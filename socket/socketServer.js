import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import Vendor from '../model/vendor/vendor.model.js';
import Admin from '../model/Admin/admin.model.js';
import { registerRiderSocketHandlers } from './rider.socket.js';

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

            // Fetch user/vendor/admin from database
            let identity;
            const role = decoded.role || 'user';
            const id = decoded.userId || decoded.id;

            if (role === 'vendor') {
                identity = await Vendor.findById(id).select('-password');
            } else if (role === 'admin' || role === 'super-admin') {
                identity = await Admin.findById(id).select('-password');
            } else {
                identity = await User.findById(id).select('-password');
            }

            if (!identity) {
                return next(new Error(`${role} not found`));
            }

            // Attach identity to socket
            socket.userId = identity._id.toString();
            socket.userEmail = identity.email || identity.name;
            socket.userRole = role;

            console.log(`✅ Socket authenticated: ${socket.userRole} ${socket.userEmail} (${socket.id})`);
            next();

        } catch (error) {
            console.error('Socket authentication error:', error.message);
            next(new Error('Authentication failed'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id} | User: ${socket.userEmail}`);

        // Register Rider Specific Handlers
        registerRiderSocketHandlers(io, socket);

        // Join user-specific room for targeted broadcasts
        socket.join(`user_${socket.userId}`);
        console.log(`👤 ${socket.userRole} ${socket.userId} joined personal room`);

        // Join role-specific rooms
        if (socket.userRole === 'admin' || socket.userRole === 'super-admin') {
            socket.join('admin_room');
            console.log(`🛡️ Admin joined admin_room`);
        }

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
 * Emit event to all admins
 */
export function emitToAdmin(adminId, event, data) {
    if (!io) return;

    if (adminId) {
        io.to(`user_${adminId}`).emit(event, data);
    } else {
        io.to('admin_room').emit(event, data);
    }
    console.log(`📤 Emitted '${event}' to admin(s)`);
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
