import pool from "../db/index.js";
import {broadcastEvent} from '../websocket.js' ; 

//create and braodcast a new event
export async function createAndBroadcastEvent(eventData) {
    try{
        //Validate required Fields
        if(!eventData.type || !eventData.matchId){
            throw new Error('type and matchId are required'); 
        }

        //Save to DB
        const result = await pool.query(
            `INSERT INTO events (type, match_id , team , player, description)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`, 
            [
                eventData.type , 
                eventData.matchId , 
                eventData.team || null , 
                eventData.player || null , 
                eventData.description || null 
            ]
        ); 

        const savedEvent = result.rows[0] ; 

        //Broadcast to all the relevent clients 
        await broadcastEvent(savedEvent);

        return savedEvent; 
    }catch(err){
        console.log('Error Creating Event :' , err); 
        throw err ; 
    }
}

//Get events after a SPecific ID (for replay)
export async function getEventsAfter(lastEventId, matchId = null) {
    try{
        let query = `
        SELECT * FROM events 
        WHERE id > $1
        ` ; 
        const params = [lastEventId] ;

        if(matchId) {
            query += ` AND match_id = $2` ; 
            params.push(matchId); 
        }

        query += ' ORDER BY id ASC' ; 

        const result = await pool.query(query, params); 
        return result.rows ; 
    } catch(err){
        console.log('Error Getting Events : ' , err); 
        throw err ; 
    }
}

//Get the recent events 
export async function getRecentEvents(limit = 50) {
    try{
        const result = await pool.query(
            `SELECT * FROM events 
             ORDER BY id DESC 
             LIMIT $1`,
            [limit]
        );

        //return in chronological order
        return result.rows.reverse() ; 
    }catch(err){
        console.error('Error Getting recent Events : ', err); 
        throw err ; 
    }
}