import express from 'express' ; 
import http from 'http' ; 
import cors from 'cors' ; 
import dotenv from 'dotenv' ; 
import { initWebSocket } from './websocket.js';
import authRoutes from './routes/auth.js' ; 
import eventRoutes from './routes/events.js' ; 
import matchRoutes from './routes/matches.js' ; 
import cricketApiRoutes from './routes/cricketApi.js' ; 
import { ensureDatabaseSchema } from './db/index.js';

//load env variables 
dotenv.config() ; 
console.log('secret key : ' , process.env.JWT_SECRET_KEY)

const app = express(); 
const PORT = process.env.PORT || 8080 ;

//middleware 
app.use(cors()) ; //allows frontend to connect 
app.use(express.json()) ; //parsing the JSON bodies 

//routes 
app.use('/auth' , authRoutes) ; 
app.use('/events' , eventRoutes) ; 
app.use('/match' , matchRoutes) ; 
app.use('/api/cricket' , cricketApiRoutes) ; 

//Health Check Endpoint 
app.get('/health' , (req , res) => {
    res.json({
        status : 'OK' , 
        timestamp : new Date() , 
        websocket : 'ws:///localhost:' + PORT 
    }); 
}); 

//create the HTTP Server
const server = http.createServer(app) ; 

//initialize websocket (attach to the same server)
initWebSocket(server) ; 

await ensureDatabaseSchema();

//start server
server.listen(PORT , () => {
    console.log(`
        Server is running on the http://localhost:${PORT} \n
        WebSocket endpoint ws://localhost:${PORT} \n
        Health Check : http://localhost:${PORT}/health`); 
}); 
