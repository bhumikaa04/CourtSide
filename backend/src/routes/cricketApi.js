import express from 'express';
import { getApiMatch, getApiMatches, getApiMatchEvents } from '../services/cricApiService.js';

const router = express.Router();

router.get('/matches', async (req, res) => {
    try {
        const matches = await getApiMatches();
        res.json({
            success: true,
            matches
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

router.get('/match/:id', async (req, res) => {
    try {
        const match = await getApiMatch(req.params.id);
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

router.get('/match/:id/events', async (req, res) => {
    try {
        const events = await getApiMatchEvents(req.params.id);
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
