import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import Vendor from '../model/vendor/vendor.model.js';
import Admin from '../model/Admin/admin.model.js';
import Rider from '../model/rider.model.js';
import { registerRiderSocketHandlers } from './rider.socket.js';
import { registerCallSocketHandlers } from './call.socket.js';
import { verifySamkaRiderCallToken } from '../services/call/callAuth.service.js';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient, isRedisReady } from '../config/redis.js';
import { JWT_SECRET } from '../utils/jwt.js';
import { isTokenBlocked } from '../middleware/tokenBlocklist.js';
import { findIdentityByTokenId, postgresUserIdentityEnabled, publicUser } from '../services/postgres/userIdentity.repository.js';
import { findVendorByTokenId, postgresVendorIdentityEnabled, publicVendor } from '../services/postgres/vendorIdentity.repository.js';
import { usePostgresAdminWrites, usePostgresRiderReads } from '../services/postgres/compat.js';
import { adminAccountRepository } from '../services/postgres/adminAccount.repository.js';
import { riderAccountsRepository } from '../services/postgres/riderAccounts.repository.js';

let io;

/**
 * Initialize Socket.IO server
 */
export async function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:3000',
                'http://localhost',
                'https://localhost',
                'capacitor://localhost',
                'https://grub-dash-frontend-xi.vercel.app',
                'https://www.melachow.com',
                'https://melachow.com',
                'https://admin.melachow.com',
                'https://vendor.melachow.com',
                'https://rider.melachow.com',
                'https://melachow-admin.vercel.app',
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
        await Promise.race([
            Promise.all([pubClient.connect(), subClient.connect()]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis adapter connection timed out')), 3000)),
        ]);
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

            // Check for short-lived Samka Rider Call Token (minted by SamkaTech.Logistics)
            try {
                const samkaActor = verifySamkaRiderCallToken(token);
                if (samkaActor) {
                    socket.userId = samkaActor.riderId;
                    socket.riderId = samkaActor.riderId;
                    socket.riderName = samkaActor.name;
                    socket.userEmail = samkaActor.name;
                    socket.userRole = 'samka_rider';
                    console.log(`✅ Socket authenticated: samka_rider ${socket.riderId} (${socket.id})`);
                    return next();
                }
            } catch (samkaErr) {
                console.error('❌ Socket Auth Failed: Invalid Samka rider call token', samkaErr.message);
                return next(new Error('Authentication failed'));
            }

            if (await isTokenBlocked(token)) {
                return next(new Error('Session has been revoked'));
            }

            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (err) {
                console.error('❌ Socket Auth Failed: Token invalid or expired', err.message);
                return next(new Error('Authentication failed'));
            }

            if (decoded.type !== 'access') {
                return next(new Error('Access token required'));
            }

            const role = decoded.role || 'user';
            
            // Resolve identity based on role and active DB provider (PostgreSQL or MongoDB)
            let identity;
            const targetId = decoded.id || decoded.userId || decoded.riderId || decoded.adminId || decoded.vendorId;

            if (role === 'rider') {
                identity = usePostgresRiderReads()
                    ? await riderAccountsRepository.getByToken(targetId)
                    : await Rider.findById(targetId).select('-password');
            } else if (role === 'vendor') {
                if (postgresVendorIdentityEnabled()) {
                    const pgVendor = await findVendorByTokenId(targetId);
                    identity = pgVendor ? publicVendor(pgVendor) : null;
                } else {
                    identity = await Vendor.findById(targetId).select('-password');
                }
            } else if (role === 'admin' || role === 'super-admin' || role === 'finance-admin') {
                identity = usePostgresAdminWrites()
                    ? await adminAccountRepository.get(targetId)
                    : await Admin.findById(targetId).select('-password');
            } else {
                if (postgresUserIdentityEnabled()) {
                    const pgUser = await findIdentityByTokenId(targetId);
                    identity = pgUser ? publicUser(pgUser) : null;
                    if (pgUser) {
                        socket.postgresUserId = String(pgUser.id);
                        socket.userName = pgUser.fullName || [pgUser.firstname, pgUser.lastname].filter(Boolean).join(' ').trim() || 'Customer';
                    }
                } else {
                    identity = await User.findById(targetId).select('-password');
                    if (identity) {
                        socket.userName = identity.fullName || identity.name || [identity.firstname, identity.lastname].filter(Boolean).join(' ').trim() || 'Customer';
                    }
                }
            }

            if (!identity) {
                console.error(`❌ Socket Auth Failed: ${role} with ID ${targetId} not found`);
                return next(new Error(`${role} not found`));
            }

            const inactive = identity.deletedAt || identity.suspended || identity.banned ||
                identity.isActive === false ||
                (role === 'vendor' && (identity.active === false || identity.isApproved === false));
            if (inactive) return next(new Error('Account is inactive'));

            socket.userId   = (identity._id || identity.id).toString();
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
    io.on('connection', async (socket) => {
        console.log(`🔌 Client connected: ${socket.id} | Role: ${socket.userRole} | User: ${socket.userEmail}`);

        // Register Voice Calling Signaling Handlers (Customer + Samka Rider)
        registerCallSocketHandlers(io, socket);

        // Samka Riders only use the calling signaling channel and join their dedicated room
        if (socket.userRole === 'samka_rider' && socket.riderId) {
            socket.join(`samka_rider_${socket.riderId}`);
            console.log(`🛵 Samka Rider ${socket.riderId} joined calling room: samka_rider_${socket.riderId}`);
            return;
        }

        // Register Rider Specific Handlers
        registerRiderSocketHandlers(io, socket);

        // Join personal room (used by emitToUser, emitToAdmin)
        socket.join(`user_${socket.userId}`);
        if (socket.postgresUserId && socket.postgresUserId !== socket.userId) {
            socket.join(`user_${socket.postgresUserId}`);
        }
        console.log(`👤 ${socket.userRole} ${socket.userId} joined personal room`);

        // ── Rider room handlers ────────────────────────────────────────────
        // Called by RiderContext: socket.emit('rider_connect', { riderId })
        // Puts the rider into room "rider:{riderId}" so that
        // io.to(SOCKET_ROOMS.rider(riderId)).emit(...) reaches them.
        socket.on('rider_connect', ({ riderId } = {}) => {
            if (!riderId || socket.userRole !== 'rider' || riderId !== socket.userId) return;
            const room = `rider:${riderId}`;
            socket.join(room);
            console.log(`🛵 Rider ${riderId} joined room: ${room}`);
        });

        // Called by socketService.subscribeToRider(riderId)
        socket.on('subscribe_rider', (riderId) => {
            if (!riderId || socket.userRole !== 'rider' || riderId !== socket.userId) return;
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
            if (!vendorId || socket.userRole !== 'vendor' || vendorId !== socket.userId) return;
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
            if (!restaurantId || socket.userRole !== 'vendor' || restaurantId !== socket.userId) return;
            // ✅ FIX: Same room format fix — was "restaurant_{id}", must be "vendor:{id}"
            socket.join(`vendor:${restaurantId}`);
            console.log(`🏪 Subscribed to vendor room: vendor:${restaurantId}`);
        });

        // ── Customer / Order room handlers ────────────────────────────────
        // Customer joins their personal delivery-tracking room
        socket.on('customer_connect', async ({ userId } = {}) => {
            if (!userId || socket.userRole !== 'user' || userId !== socket.userId) return;
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
        socket.on('subscribe_order', async (orderId) => {
            if (!orderId) return;
            const order = await (await import('../model/order/Order.js')).default.findById(orderId)
                .select('userId riderId vendorId').lean();
            if (!order) return;
            const allowedIds = [order.userId, order.riderId, order.vendorId]
                .filter(Boolean).map((id) => id.toString());
            if (!allowedIds.includes(socket.userId) && !['admin', 'super-admin'].includes(socket.userRole)) return;
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

            // Deliver any notifications that arrived while admin was disconnected
            try {
                const Notification = (await import('../model/notification/notification.model.js')).default;
                // Fetch unread notifications meant for admins (either broad role-based or specific adminId)
                const missedNotifications = await Notification.find({
                    $or: [
                        { role: 'admin' },
                        { adminId: socket.userId }
                    ],
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
                    console.log(`📬 Delivered ${missedNotifications.length} missed notification(s) to admin ${socket.userId}`);
                }
            } catch (err) {
                console.error('❌ Failed to deliver missed notifications to admin:', err.message);
            }
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
 * Emit event to a connected Samka Rider (voice calling signaling)
 */
export function emitToSamkaRider(riderId, event, data) {
    if (!io || !riderId) return;
    io.to(`samka_rider_${riderId}`).emit(event, data);
    console.log(`📤 Emitted '${event}' to Samka rider ${riderId}`);
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
