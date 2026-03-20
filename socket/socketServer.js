import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import Vendor from '../model/vendor/vendor.model.js';
import Admin from '../model/Admin/admin.model.js';
import Rider from '../model/rider.model.js';
import { registerRiderSocketHandlers } from './rider.socket.js';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient, isRedisReady } from '../config/redis.js';
import { JWT_SECRET } from '../utils/jwt.js';

let io;

/**
 * Initialize Socket.IO server
 */
export async function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:3000',
                // 'http://localhost:3001',
                // 'http://localhost:5000',
                'https://grub-dash-frontend-xi.vercel.app',
                process.env.CLIENT_URL,
            ].filter(Boolean),
            credentials: true,
            methods: ['GET', 'POST']
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
    });

    // Redis adapter setup for multi-instance support
    try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        console.log('✅ Socket.IO Redis adapter active — multi-instance broadcasting enabled');
    } catch (err) {
        console.warn('⚠️ Redis adapter unavailable — falling back to in-memory adapter:', err.message);
        // System continues working on single instance without Redis
    }


    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            // ── Token extraction — priority order ─────────────────────────
            // 1. httpOnly cookie (most authoritative — same as HTTP auth layer)
            // 2. Explicit auth.token (mobile clients, non-browser environments)
            // 3. Authorization header (Bearer token fallback)
            let token = null;

            // Priority 1: Parse httpOnly cookie from handshake headers
            if (socket.handshake.headers.cookie) {
                const cookies = socket.handshake.headers.cookie
                    .split(';')
                    .reduce((acc, pair) => {
                        const [key, ...rest] = pair.trim().split('=');
                        if (key) acc[key.trim()] = decodeURIComponent(rest.join('=').trim());
                        return acc;
                    }, {});

                token = cookies['riderToken']
                    || cookies['vendorToken']
                    || cookies['adminToken']
                    || cookies['token'];
            }

            // Priority 2: Explicit token passed in socket auth options
            if (!token && socket.handshake.auth?.token) {
                token = socket.handshake.auth.token;
            }

            // Priority 3: Authorization header
            if (!token && socket.handshake.headers.authorization) {
                token = socket.handshake.headers.authorization.replace('Bearer ', '');
            }

            if (!token) {
                console.error('❌ Socket Auth Failed: No token found in cookie, auth, or header');
                return next(new Error('Authentication token required'));
            }

            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (err) {
                console.error('❌ Socket Auth Failed: Token invalid or expired', err.message);
                return next(new Error('Authentication failed'));
            }

            const role = decoded.role || 'user';
            
            // Resolve identity based on role and available IDs
            let identity;
            const targetId = decoded.id || decoded.userId || decoded.riderId || decoded.adminId || decoded.vendorId;

            if (role === 'rider') {
                identity = await Rider.findById(targetId).select('-password');
            } else if (role === 'vendor') {
                identity = await Vendor.findById(targetId).select('-password');
            } else if (role === 'admin' || role === 'super-admin') {
                identity = await Admin.findById(targetId).select('-password');
            } else {
                identity = await User.findById(targetId).select('-password');
            }

            if (!identity) {
                console.error(`❌ Socket Auth Failed: ${role} with ID ${targetId} not found`);
                return next(new Error(`${role} not found`));
            }

            socket.userId   = identity._id.toString();
            socket.userEmail = identity.email || identity.name || identity.phone;
            socket.userRole  = role;

            console.log(`✅ Socket authenticated: ${socket.userRole} ${socket.userEmail} (${socket.id})`);
            next();

        } catch (error) {
            console.error('❌ Socket unexpected error during auth:', error.message);
            next(new Error('Authentication failed'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id} | Role: ${socket.userRole} | User: ${socket.userEmail}`);

        // Register Rider Specific Handlers
        registerRiderSocketHandlers(io, socket);

        // Join personal room (used by emitToUser, emitToAdmin)
        socket.join(`user_${socket.userId}`);
        console.log(`👤 ${socket.userRole} ${socket.userId} joined personal room`);

        // ── Rider room handlers ────────────────────────────────────────────
        // Called by RiderContext: socket.emit('rider_connect', { riderId })
        // Puts the rider into room "rider:{riderId}" so that
        // io.to(SOCKET_ROOMS.rider(riderId)).emit(...) reaches them.
        socket.on('rider_connect', ({ riderId } = {}) => {
            if (!riderId) return;
            const room = `rider:${riderId}`;
            socket.join(room);
            console.log(`🛵 Rider ${riderId} joined room: ${room}`);
        });

        // Called by socketService.subscribeToRider(riderId)
        socket.on('subscribe_rider', (riderId) => {
            if (!riderId) return;
            const room = `rider:${riderId}`;
            socket.join(room);
            console.log(`🛵 Rider subscribed to room: ${room}`);
        });

        // Called by socketService.subscribeToRiderOrder(orderId) on dashboard
        socket.on('subscribe_rider_order', (orderId) => {
            if (!orderId) return;
            const room = `order:${orderId}`;
            socket.join(room);
            console.log(`📦 Rider subscribed to order room: ${room}`);
        });

        // ── Vendor room handlers ───────────────────────────────────────────
        // Called by vendor frontend: socket.emit('vendor_connect', { vendorId })
        socket.on('vendor_connect', async ({ vendorId } = {}) => {
            if (!vendorId) return;
            // ✅ FIX: Use "vendor:{id}" colon format to match SOCKET_ROOMS.vendor()
            // The old subscribe_restaurant handler used "restaurant_{id}" (underscore)
            // which doesn't match what rider.controller.js emits to.
            socket.join(`vendor:${vendorId}`);
            console.log(`🏪 Vendor ${vendorId} joined room: vendor:${vendorId}`);

            // Deliver any notifications that arrived while vendor was disconnected
            try {
                const Notification = (await import('../model/notification/notification.model.js')).default;
                const missedNotifications = await Notification.find({
                    restaurantId: vendorId,
                    read: false
                })
                    .sort({ createdAt: -1 })
                    .limit(20)
                    .lean();

                if (missedNotifications.length > 0) {
                    socket.emit('missed_notifications', {
                        notifications: missedNotifications,
                        count: missedNotifications.length
                    });
                    console.log(`📬 Delivered ${missedNotifications.length} missed notification(s) to vendor ${vendorId}`);
                }
            } catch (err) {
                console.error('❌ Failed to deliver missed notifications:', err.message);
            }
        });

        // Called by socketService.subscribeToRestaurant(restaurantId)
        socket.on('subscribe_restaurant', (restaurantId) => {
            if (!restaurantId) return;
            // ✅ FIX: Same room format fix — was "restaurant_{id}", must be "vendor:{id}"
            socket.join(`vendor:${restaurantId}`);
            console.log(`🏪 Subscribed to vendor room: vendor:${restaurantId}`);
        });

        // ── Customer / Order room handlers ────────────────────────────────
        // Customer joins their personal delivery-tracking room
        socket.on('customer_connect', async ({ userId } = {}) => {
            if (!userId) return;
            socket.join(`customer:${userId}`);
            console.log(`👤 Customer ${userId} joined room: customer:${userId}`);

            // Deliver missed notifications for customer
            try {
                const Notification = (await import('../model/notification/notification.model.js')).default;
                const missedNotifications = await Notification.find({
                    userId: userId,
                    read: false
                })
                    .sort({ createdAt: -1 })
                    .limit(20)
                    .lean();

                if (missedNotifications.length > 0) {
                    socket.emit('missed_notifications', {
                        notifications: missedNotifications,
                        count: missedNotifications.length
                    });
                    console.log(`📬 Delivered ${missedNotifications.length} missed notification(s) to customer ${userId}`);
                }
            } catch (err) {
                console.error('❌ Failed to deliver missed notifications:', err.message);
            }
        });

        // Subscribe to order-specific updates
        socket.on('subscribe_order', (orderId) => {
            if (!orderId) return;
            // ✅ FIX: Use "order:{id}" colon format to match SOCKET_ROOMS.order()
            socket.join(`order:${orderId}`);
            console.log(`📦 Subscribed to order room: order:${orderId}`);
        });

        socket.on('unsubscribe_order', (orderId) => {
            if (!orderId) return;
            socket.leave(`order:${orderId}`);
            console.log(`📦 Unsubscribed from order room: order:${orderId}`);
        });

        // ── Admin room ─────────────────────────────────────────────────────
        if (socket.userRole === 'admin' || socket.userRole === 'super-admin') {
            socket.join('admin_room');
            console.log(`🛡️ Admin joined admin_room`);
        }

        // ── Health check ───────────────────────────────────────────────────
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: Date.now() });
        });

        // ── Reconnect ──────────────────────────────────────────────────────
        socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Client reconnected: ${socket.id} | Attempts: ${attemptNumber}`);
            socket.join(`user_${socket.userId}`);
        });

        socket.on('disconnect', (reason) => {
            console.log(`🔴 Client disconnected: ${socket.id} | Reason: ${reason}`);
        });

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
 * Emit event to specific user (personal room)
 */
export function emitToUser(userId, event, data) {
    if (!io) { console.error('Socket.IO not initialized'); return; }
    io.to(`user_${userId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to user ${userId}`);
}

/**
 * Emit event to specific order room
 */
export function emitToOrder(orderId, event, data) {
    if (!io) { console.error('Socket.IO not initialized'); return; }
    // ✅ FIX: colon format to match SOCKET_ROOMS.order()
    io.to(`order:${orderId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to order ${orderId}`);
}

/**
 * Emit event to specific restaurant/vendor room
 */
export function emitToRestaurant(restaurantId, event, data) {
    if (!io) { console.error('Socket.IO not initialized'); return; }
    // ✅ FIX: colon format to match SOCKET_ROOMS.vendor()
    io.to(`vendor:${restaurantId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to restaurant ${restaurantId}`);
}

/**
 * Emit event to specific rider room
 */
export function emitToRider(riderId, event, data) {
    if (!io) { console.error('Socket.IO not initialized'); return; }
    // Match the room format used in rider_connect
    io.to(`rider:${riderId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to rider ${riderId}`);
}

/**
 * Emit event to admin(s)
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
    if (!io) { console.error('Socket.IO not initialized'); return; }
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