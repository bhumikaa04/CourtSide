import { WebSocketServer } from "ws";
import { verifyToken } from "./utils/jwt.js";
import pool from "./db/index.js";

// Map: ws -> client metadata
const clients = new Map();

export function initWebSocket(server) {
  const wss = new WebSocketServer({ server });
  console.log("WebSocket server initialized");

  wss.on("connection", (ws, req) => {
    console.log("New client connected");

    // store client metadata
    clients.set(ws, {
      userId: null,
      authenticated: false,
      subscriptions: [],
      lastEventId: 0,
    });

    // handle incoming messages
    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        console.log("Data received:", data.type);

        await handleMessage(ws, data);
      } catch (err) {
        console.log("Error:", err);

        ws.send(
          JSON.stringify({
            type: "ERROR",
            message: "Invalid message format",
          })
        );
      }
    });

    // handle disconnect
    ws.on("close", () => {
      console.log("Client disconnected");
      clients.delete(ws);
    });
  });

  return wss;
}

// message router
async function handleMessage(ws, data) {
  switch (data.type) {
    case "AUTH":
      await handleAuth(ws, data.token);
      break;

    case "SUBSCRIBE":
      handleSubscription(ws, data.subscriptions);
      break;

    case "GET_MISSED_EVENTS":
      await getMissedEvents(ws, data.lastEventId);
      break;

    default:
      console.log("Unknown message type:", data.type);
  }
}

// authenticate user
async function handleAuth(ws, token) {
  const decoded = verifyToken(token);

  if (!decoded) {
    ws.send(
      JSON.stringify({
        type: "AUTH_ERROR",
        message: "Invalid or expired token",
      })
    );
    return;
  }

  const client = clients.get(ws);
  client.userId = decoded.userId;
  client.authenticated = true;

  try {
    const result = await pool.query(
      `SELECT match_id, event_type, team
       FROM user_subscriptions
       WHERE user_id = $1`,
      [client.userId]
    );

    client.subscriptions = result.rows;

    ws.send(
      JSON.stringify({
        type: "AUTH_SUCCESS",
        message: "Authenticated successfully",
        subscriptions: client.subscriptions,
      })
    );

    console.log(`User ${client.userId} authenticated`);
  } catch (err) {
    console.error("Error loading subscriptions:", err);
  }
}

// handle subscriptions
function handleSubscription(ws, subscriptions) {
  const client = clients.get(ws);

  if (!client.authenticated) {
    ws.send(
      JSON.stringify({
        type: "ERROR",
        message: "Must authenticate first",
      })
    );
    return;
  }

  client.subscriptions = subscriptions || [];

  ws.send(
    JSON.stringify({
      type: "SUBSCRIBED",
      subscriptions: client.subscriptions,
    })
  );

  console.log(`User ${client.userId} subscribed to:`, client.subscriptions);
}

// send missed events
async function getMissedEvents(ws, lastEventId) {
  const client = clients.get(ws);

  if (!client.authenticated) return;

  try {
    const result = await pool.query(
      `SELECT * FROM events
       WHERE id > $1
       ORDER BY id ASC`,
      [lastEventId || 0]
    );

    ws.send(
      JSON.stringify({
        type: "MISSED_EVENTS",
        events: result.rows,
        count: result.rows.length,
      })
    );

    console.log(
      `Sent ${result.rows.length} missed events to user ${client.userId}`
    );
  } catch (err) {
    console.log("Error fetching missed events:", err);
  }
}

// broadcast event
export async function broadcastEvent(event) {
  console.log("Broadcast event:", event.type, event.match_id);

  const promises = [];

  clients.forEach((client, ws) => {
    if (!client.authenticated) return;

    const shouldReceive = shouldClientReceiveEvent(client, event);

    if (shouldReceive && ws.readyState === 1) {
      promises.push(
        ws.send(
          JSON.stringify({
            type: "EVENT",
            data: {
              ...event , 
              sent_at : Date.now()
            }
          })
        )
      );
    }
  });

  await Promise.all(promises);
}

// filter logic
function shouldClientReceiveEvent(client, event) {
  if (!client.subscriptions || client.subscriptions.length === 0) {
    return true;
  }

  return client.subscriptions.some((sub) => {
    if (sub.match_id && sub.match_id !== event.match_id) return false;
    if (sub.event_type && sub.event_type !== event.type) return false;
    if (sub.team && sub.team !== event.team) return false;

    return true;
  });
}