import express from 'express';
import { getMatchEvents, getMatchSummary } from '../services/eventService.js';

const router = express.Router();

router.get('/:id', async (req, res) => {
    try {
        const match = await getMatchSummary(req.params.id);
        res.json({
            success: true,
            match
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.get('/:id/events', async (req, res) => {
    try {
        const events = await getMatchEvents(req.params.id);
        res.json({
            success: true,
            events
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

export default router;
