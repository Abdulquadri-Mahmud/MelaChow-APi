import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';

let io;

/**
 * Initialize Socket.IO server
 * @param {Object} server - HTTP server instance
 */
export function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:3000',
            credentials: true,
            methods: ['GET', 'POST']
        },
        pingTimeout: 60000, // 60 seconds
        pingInterval: 25000, // 25 seconds
        transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                return next(new Error('Authentication token required'));
            }

            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Fetch user from database
            const user = await User.findById(decoded.userId || decoded.id).select('-password');

            if (!user) {
                return next(new Error('User not found'));
            }

            // Attach user to socket
            socket.userId = user._id.toString();
            socket.userEmail = user.email;
            socket.userRole = user.role || 'customer'; // 'customer', 'vendor', 'rider', etc.

            console.log(`✅ Socket authenticated: User ${user.email} (${socket.id})`);
            next();

        } catch (error) {
            console.error('Socket authentication error:', error.message);
            next(new Error('Authentication failed'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id} | User: ${socket.userEmail}`);

        // Join user-specific room for targeted broadcasts
        socket.join(`user_${socket.userId}`);
        console.log(`👤 User ${socket.userId} joined personal room`);

        // Handle client disconnection
        socket.on('disconnect', (reason) => {
            console.log(`🔴 Client disconnected: ${socket.id} | Reason: ${reason}`);
        });

        // Handle reconnection
        socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Client reconnected: ${socket.id} | Attempts: ${attemptNumber}`);
            socket.join(`user_${socket.userId}`);
        });

        // Client ping for connection health check
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: Date.now() });
        });

        // Subscribe to order-specific updates
        socket.on('subscribe_order', (orderId) => {
            socket.join(`order_${orderId}`);
            console.log(`📦 User ${socket.userId} subscribed to order ${orderId}`);
        });

        // Unsubscribe from order updates
        socket.on('unsubscribe_order', (orderId) => {
            socket.leave(`order_${orderId}`);
            console.log(`📦 User ${socket.userId} unsubscribed from order ${orderId}`);
        });

        // Subscribe to restaurant updates (for vendors)
        socket.on('subscribe_restaurant', (restaurantId) => {
            if (socket.userRole === 'vendor' || socket.userRole === 'admin') {
                socket.join(`restaurant_${restaurantId}`);
                console.log(`🏪 User ${socket.userId} subscribed to restaurant ${restaurantId}`);
            }
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`❌ Socket error for ${socket.id}:`, error);
        });
    });

    console.log('🚀 Socket.IO server initialized');
    return io;
}

/**
 * Get Socket.IO instance
 */
export function getIO() {
    if (!io) {
        throw new Error('Socket.IO not initialized. Call initializeSocket first.');
    }
    return io;
}

/**
 * Emit event to specific user
 */
export function emitToUser(userId, event, data) {
    if (!io) {
        console.error('Socket.IO not initialized');
        return;
    }

    io.to(`user_${userId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to user ${userId}`);
}

/**
 * Emit event to specific order room
 */
export function emitToOrder(orderId, event, data) {
    if (!io) {
        console.error('Socket.IO not initialized');
        return;
    }

    io.to(`order_${orderId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to order ${orderId}`);
}

/**
 * Emit event to specific restaurant room
 */
export function emitToRestaurant(restaurantId, event, data) {
    if (!io) {
        console.error('Socket.IO not initialized');
        return;
    }

    io.to(`restaurant_${restaurantId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to restaurant ${restaurantId}`);
}

/**
 * Broadcast to all connected clients
 */
export function broadcastToAll(event, data) {
    if (!io) {
        console.error('Socket.IO not initialized');
        return;
    }

    io.emit(event, data);
    console.log(`📢 Broadcasted '${event}' to all clients`);
}

/**
 * Get active connections count
 */
export async function getActiveConnections() {
    if (!io) return 0;

    const sockets = await io.fetchSockets();
    return sockets.length;
}

/**
 * Get user's active sockets
 */
export async function getUserSockets(userId) {
    if (!io) return [];

    const sockets = await io.in(`user_${userId}`).fetchSockets();
    return sockets;
}
