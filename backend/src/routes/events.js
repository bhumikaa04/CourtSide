import express from 'express' ; 
import { createAndBroadcastEvent , getRecentEvents } from '../services/eventService.js';

const router = express.Router() ; 

router.post('/' , async(req , res) => {
    try{
        const event = await createAndBroadcastEvent(req.body) ; 
        res.status(201).json({
            success : true , 
            event
        }); 
    }catch (err){
        res.status(500).json({
            success : false, 
            message : error.message
        }); 
    }
}); 

//get the recent events 
router.get('/recent' , async(req, res) => {
    try{
        const limit = parseInt(req.query.limit) || 50 ; 
        const events = await getRecentEvents(limit) ;
        res.json({
            success : true , 
            events
        }); 
    }catch(err){
        res.status(500).json({
            success : false, 
            message : err.message
        }); 
    }
}); 

export default router ; 