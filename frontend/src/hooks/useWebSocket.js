import { useCallback, useEffect, useRef, useState } from "react";

const RECONNECT_DELAY = 3000;

export function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const shouldReconnectRef = useRef(false);
  const subscriptionsRef = useRef([]);
  const audioRef = useRef(null);

  useEffect(() => {
    audioRef.current = new Audio("/notification.wav");
    audioRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    if (!url) {
      return undefined;
    }

    let connectTimer = null;
    shouldReconnectRef.current = true;

    const clearReconnectTimer = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const sendMessage = (message) => {
      const socket = wsRef.current;

      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }

      return false;
    };

    const connect = () => {
      if (!shouldReconnectRef.current) {
        return;
      }

      const existingSocket = wsRef.current;
      if (
        existingSocket?.readyState === WebSocket.OPEN ||
        existingSocket?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      try {
        const socket = new WebSocket(url);
        wsRef.current = socket;

        socket.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
          setError(null);
          clearReconnectTimer();

          const token = localStorage.getItem("token");
          if (token) {
            sendMessage({
              type: "AUTH",
              token,
            });
          }
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("Received:", data.type);

            switch (data.type) {
              case "EVENT":
                setLastEvent(data.data);
                setEvents((prev) => [data.data, ...prev].slice(0, 50));

                if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play().catch((err) => {
                    console.warn("Audio play failed. User interaction may be needed:", err);
                  });
                }

                if (data.data?.sent_at) {
                  console.log("DELAY:", Date.now() - data.data.sent_at, "ms");
                }
                break;

              case "MISSED_EVENTS":
                console.log(`Received ${data.count} missed events`);
                setEvents((prev) => [...data.events, ...prev].slice(0, 50));
                break;

              case "AUTH_SUCCESS":
                console.log("Authentication successful");
                setError(null);

                if (subscriptionsRef.current.length > 0) {
                  sendMessage({
                    type: "SUBSCRIBE",
                    subscriptions: subscriptionsRef.current,
                  });
                }
                break;

              case "AUTH_ERROR":
                console.error("Authentication error:", data.message);
                setError(data.message || "Authentication failed");
                shouldReconnectRef.current = false;
                socket.close();
                break;

              case "SUBSCRIBED":
                console.log("Subscriptions updated:", data.subscriptions);
                setError(null);
                break;

              case "ERROR":
                console.error("Server error:", data.message);
                setError(data.message || "Server error");
                break;

              default:
                console.log("Unknown message type:", data.type);
            }
          } catch (err) {
            console.log("Error parsing websocket data:", err);
            setError("Invalid websocket message");
          }
        };

        socket.onclose = () => {
          console.log("WebSocket disconnected");
          setIsConnected(false);

          if (!shouldReconnectRef.current) {
            return;
          }

          clearReconnectTimer();
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("Reconnecting...");
            wsRef.current = null;
            connect();
          }, RECONNECT_DELAY);
        };

        socket.onerror = (err) => {
          console.error("WebSocket error:", err);
          setError("Connection error");
        };
      } catch (err) {
        console.error("Error creating websocket:", err);
        setError("Failed to connect");
      }
    };

    connectTimer = setTimeout(connect, 0);

    return () => {
      shouldReconnectRef.current = false;

      if (connectTimer) {
        clearTimeout(connectTimer);
      }

      clearReconnectTimer();

      const socket = wsRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;

        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }

      wsRef.current = null;
      setIsConnected(false);
    };
  }, [url]);

  const send = useCallback((message) => {
    const socket = wsRef.current;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }

    console.warn("WebSocket not connected");
    return false;
  }, []);

  const subscribe = useCallback(
    (subscriptions) => {
      subscriptionsRef.current = subscriptions;

      return send({
        type: "SUBSCRIBE",
        subscriptions,
      });
    },
    [send]
  );

  const getMissedEvents = useCallback(
    (lastEventId) =>
      send({
        type: "GET_MISSED_EVENTS",
        lastEventId,
      }),
    [send]
  );

  return {
    isConnected,
    lastEvent,
    events,
    error,
    send,
    subscribe,
    getMissedEvents,
  };
}
