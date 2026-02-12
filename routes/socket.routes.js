import express from 'express';
import { getActiveConnections, getUserSockets } from '../socket/socketServer.js';
import auth from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * GET /api/socket/health
 * Check Socket.IO server health
 */
router.get('/health', async (req, res) => {
    try {
        const activeConnections = await getActiveConnections();

        res.json({
            success: true,
            status: 'healthy',
            activeConnections,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * GET /api/socket/my-connections
 * Get current user's active socket connections
 */
router.get('/my-connections', auth, async (req, res) => {
    try {
        const sockets = await getUserSockets(req.userId);

        res.json({
            success: true,
            connections: sockets.map(s => ({
                id: s.id,
                connected: s.connected,
                rooms: Array.from(s.rooms)
            })),
            count: sockets.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
