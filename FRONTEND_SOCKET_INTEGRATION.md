# Frontend Integration Prompt: Socket.IO Real-Time Notifications

This document provides complete integration instructions for connecting your frontend to the MelaChow Socket.IO server for real-time order updates and notifications.

## Installation

```bash
npm install socket.io-client
```

## Base Configuration

### 1. Socket.IO Client Setup

Create a Socket.IO client service file:

**File: `/services/socketService.js`**

```javascript
import { io } from 'socket.io-client';

class SocketService {
    constructor() {
        this.socket = null;
        this.isConnected = false;
    }

    /**
     * Initialize Socket.IO connection
     * @param {string} token - JWT authentication token
     */
    connect(token) {
        if (this.socket?.connected) {
            console.log('Socket already connected');
            return this.socket;
        }

        const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

        this.socket = io(SOCKET_URL, {
            auth: {
                token: token
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        this.setupEventListeners();
        return this.socket;
    }

    /**
     * Setup core event listeners
     */
    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('âœ… Socket.IO connected:', this.socket.id);
            this.isConnected = true;
        });

        this.socket.on('disconnect', (reason) => {
            console.log('ðŸ”´ Socket.IO disconnected:', reason);
            this.isConnected = false;
        });

        this.socket.on('connect_error', (error) => {
            console.error('âŒ Socket.IO connection error:', error.message);
        });

        this.socket.on('pong', (data) => {
            console.log('ðŸ“ Pong received:', data.timestamp);
        });
    }

    /**
     * Subscribe to order updates
     */
    subscribeToOrder(orderId) {
        if (!this.socket) return;
        this.socket.emit('subscribe_order', orderId);
        console.log(`ðŸ“¦ Subscribed to order: ${orderId}`);
    }

    /**
     * Unsubscribe from order updates
     */
    unsubscribeFromOrder(orderId) {
        if (!this.socket) return;
        this.socket.emit('unsubscribe_order', orderId);
        console.log(`ðŸ“¦ Unsubscribed from order: ${orderId}`);
    }

    /**
     * Subscribe to restaurant updates (for vendors)
     */
    subscribeToRestaurant(restaurantId) {
        if (!this.socket) return;
        this.socket.emit('subscribe_restaurant', restaurantId);
        console.log(`ðŸª Subscribed to restaurant: ${restaurantId}`);
    }

    /**
     * Listen for new notifications
     */
    onNewNotification(callback) {
        if (!this.socket) return;
        this.socket.on('new_notification', callback);
    }

    /**
     * Listen for notification count updates
     */
    onNotificationCountUpdate(callback) {
        if (!this.socket) return;
        this.socket.on('notification_count_update', callback);
    }

    /**
     * Listen for order status updates
     */
    onOrderStatusUpdate(callback) {
        if (!this.socket) return;
        this.socket.on('order_status_update', callback);
    }

    /**
     * Listen for delivery location updates
     */
    onDeliveryLocationUpdate(callback) {
        if (!this.socket) return;
        this.socket.on('delivery_location_update', callback);
    }

    /**
     * Listen for new orders (for vendors)
     */
    onNewOrder(callback) {
        if (!this.socket) return;
        this.socket.on('new_order', callback);
    }

    /**
     * Send ping to server
     */
    ping() {
        if (!this.socket) return;
        this.socket.emit('ping');
    }

    /**
     * Disconnect socket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            console.log('ðŸ”´ Socket.IO manually disconnected');
        }
    }

    /**
     * Remove all listeners
     */
    removeAllListeners() {
        if (this.socket) {
            this.socket.removeAllListeners();
        }
    }
}

export default new SocketService();
```

---

## Integration Examples

### 2. React/Next.js Integration

#### A. App-Level Setup (Connect on Login)

**File: `/contexts/AuthContext.js` or `/hooks/useAuth.js`**

```javascript
import { useEffect } from 'react';
import socketService from '@/services/socketService';

export function useAuth() {
    const { user, token } = useAuthState(); // Your auth state

    useEffect(() => {
        if (token && user) {
            // Connect Socket.IO when user logs in
            socketService.connect(token);

            return () => {
                // Disconnect when user logs out
                socketService.disconnect();
            };
        }
    }, [token, user]);

    return { user, token };
}
```

#### B. Notification Badge Component

```javascript
'use client';

import { useState, useEffect } from 'react';
import socketService from '@/services/socketService';

export default function NotificationBadge() {
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        // Fetch initial count
        fetch('/api/notifications/unread-count', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        .then(res => res.json())
        .then(data => setUnreadCount(data.count));

        // Listen for real-time updates
        socketService.onNotificationCountUpdate((data) => {
            setUnreadCount(data.count);
        });

        return () => {
            socketService.removeAllListeners();
        };
    }, []);

    return (
        <div className="relative">
            <BellIcon />
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-2">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </div>
    );
}
```

#### C. In-App Notification Toast

```javascript
'use client';

import { useEffect } from 'react';
import { toast } from 'react-hot-toast'; // or your toast library
import socketService from '@/services/socketService';

export default function NotificationListener() {
    useEffect(() => {
        socketService.onNewNotification((notification) => {
            // Show toast notification
            toast.custom((t) => (
                <div className="bg-white shadow-lg rounded-lg p-4 flex items-start gap-3">
                    <img src={notification.icon} alt="" className="w-10 h-10" />
                    <div>
                        <h4 className="font-semibold">{notification.title}</h4>
                        <p className="text-sm text-gray-600">{notification.body}</p>
                        {notification.url && (
                            <a 
                                href={notification.url} 
                                className="text-blue-500 text-sm mt-1 inline-block"
                            >
                                View Details â†’
                            </a>
                        )}
                    </div>
                </div>
            ), { duration: 5000 });
        });

        return () => {
            socketService.removeAllListeners();
        };
    }, []);

    return null; // This is a listener component
}
```

#### D. Order Tracking Page

```javascript
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import socketService from '@/services/socketService';

export default function OrderTrackingPage() {
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [status, setStatus] = useState('pending');

    useEffect(() => {
        // Fetch initial order data
        fetch(`/api/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        .then(res => res.json())
        .then(data => {
            setOrder(data.order);
            setStatus(data.order.status);
        });

        // Subscribe to real-time order updates
        socketService.subscribeToOrder(orderId);

        // Listen for status updates
        socketService.onOrderStatusUpdate((data) => {
            if (data.orderId === orderId) {
                setStatus(data.status);
                
                // Show notification
                toast.success(`Order ${data.status}!`);
            }
        });

        return () => {
            socketService.unsubscribeFromOrder(orderId);
        };
    }, [orderId]);

    return (
        <div>
            <h1>Order #{orderId}</h1>
            <OrderStatusTimeline status={status} />
            {/* Rest of your UI */}
        </div>
    );
}
```

#### E. Vendor Dashboard (New Orders)

```javascript
'use client';

import { useState, useEffect } from 'react';
import socketService from '@/services/socketService';

export default function VendorDashboard() {
    const [orders, setOrders] = useState([]);
    const restaurantId = 'YOUR_RESTAURANT_ID';

    useEffect(() => {
        // Subscribe to restaurant updates
        socketService.subscribeToRestaurant(restaurantId);

        // Listen for new orders
        socketService.onNewOrder((orderData) => {
            // Add new order to the list
            setOrders(prev => [orderData, ...prev]);

            // Play notification sound
            new Audio('/notification.mp3').play();

            // Show alert
            toast.success(`New order from ${orderData.customerName}!`);
        });

        return () => {
            socketService.removeAllListeners();
        };
    }, [restaurantId]);

    return (
        <div>
            <h1>Incoming Orders</h1>
            {orders.map(order => (
                <OrderCard key={order.orderId} order={order} />
            ))}
        </div>
    );
}
```

---

## Socket.IO Events Reference

### Events You Can Listen To (from server):

| Event | Description | Payload |
|-------|-------------|---------|
| `new_notification` | New notification received | `{ _id, title, body, type, orderId, url, icon, image, createdAt, read }` |
| `notification_count_update` | Unread count changed | `{ count: number }` |
| `order_status_update` | Order status changed | `{ orderId, status, previousStatus, restaurantName, totalAmount, timestamp }` |
| `delivery_location_update` | Delivery driver location | `{ orderId, driverLocation: { latitude, longitude, heading, speed }, estimatedArrival, timestamp }` |
| `new_order` | New order (vendors only) | `{ orderId, customerName, customerPhone, items, totalAmount, deliveryAddress, notes, timestamp }` |
| `order_update` | Order update (vendors) | `{ orderId, status, customerName, items, timestamp }` |
| `restaurant_status_change` | Restaurant online/offline | `{ restaurantId, isOnline, reason, timestamp }` |
| `pong` | Response to ping | `{ timestamp }` |

### Events You Can Emit (to server):

| Event | Description | Payload |
|-------|-------------|---------|
| `subscribe_order` | Subscribe to order updates | `orderId` (string) |
| `unsubscribe_order` | Unsubscribe from order | `orderId` (string) |
| `subscribe_restaurant` | Subscribe to restaurant (vendors) | `restaurantId` (string) |
| `ping` | Health check | None |

---

## Health Check Endpoints

### Check Socket.IO Server Status

```javascript
GET /api/socket/health

Response:
{
    "success": true,
    "status": "healthy",
    "activeConnections": 42,
    "timestamp": "2024-02-12T13:00:00.000Z"
}
```

### Check Your Active Connections

```javascript
GET /api/socket/my-connections
Headers: { Authorization: "Bearer YOUR_TOKEN" }

Response:
{
    "success": true,
    "connections": [
        {
            "id": "abc123",
            "connected": true,
            "rooms": ["user_123", "order_456"]
        }
    ],
    "count": 1
}
```

---

## Best Practices

### 1. Connection Management
- Connect Socket.IO **after** user authentication
- Disconnect on logout
- Reconnect automatically on token refresh

### 2. Error Handling
```javascript
socketService.socket.on('connect_error', (error) => {
    if (error.message === 'Authentication failed') {
        // Redirect to login
        window.location.href = '/login';
    }
});
```

### 3. Performance
- Unsubscribe from rooms when leaving pages
- Remove event listeners in cleanup functions
- Use `socket.once()` for one-time events

### 4. Testing
```javascript
// Test connection
socketService.connect(token);

// Test ping
socketService.ping();

// Check health
fetch('/api/socket/health').then(r => r.json()).then(console.log);
```

---

## Troubleshooting

### Connection Issues
1. **"Authentication failed"**: Check if JWT token is valid
2. **"Socket.IO not initialized"**: Ensure server is running with Socket.IO
3. **CORS errors**: Verify `CLIENT_URL` in backend `.env`

### No Events Received
1. Check if you're subscribed to the correct room
2. Verify event listener is set up before event fires
3. Check browser console for Socket.IO debug logs

### Enable Debug Mode
```javascript
localStorage.setItem('debug', 'socket.io-client:*');
```

---

## Complete Example: Order Tracking with Real-Time Updates

```javascript
'use client';

import { useState, useEffect } from 'react';
import socketService from '@/services/socketService';

export default function OrderTracking({ orderId }) {
    const [status, setStatus] = useState('pending');
    const [driverLocation, setDriverLocation] = useState(null);

    useEffect(() => {
        // Subscribe to order
        socketService.subscribeToOrder(orderId);

        // Listen for status updates
        socketService.onOrderStatusUpdate((data) => {
            if (data.orderId === orderId) {
                setStatus(data.status);
            }
        });

        // Listen for driver location
        socketService.onDeliveryLocationUpdate((data) => {
            if (data.orderId === orderId) {
                setDriverLocation(data.driverLocation);
            }
        });

        return () => {
            socketService.unsubscribeFromOrder(orderId);
        };
    }, [orderId]);

    return (
        <div>
            <h2>Order Status: {status}</h2>
            {driverLocation && (
                <Map 
                    lat={driverLocation.latitude} 
                    lng={driverLocation.longitude} 
                />
            )}
        </div>
    );
}
```

---

## Advanced Integration: Unified Notification Manager

### Overview
The following sections provide production-grade patterns for managing the **three-tier notification system**:
1. **WebSocket (Socket.IO)** - Real-time in-app notifications
2. **Push Notifications** - Background alerts when app is closed
3. **REST API** - Persistent history and fallback

---

## PART 1: Unified Notification Manager Hook

This hook combines all three notification channels into a single, intelligent interface.

**File: `/app/hooks/useNotificationManager.js`**

```javascript
'use client';

import { useEffect, useState } from 'react';
import { useRealtimeNotifications } from './useRealtimeNotifications';
import { usePushNotifications } from './usePushNotifications';
import axios from 'axios';

/**
 * UNIFIED NOTIFICATION MANAGER
 * Combines WebSocket, Push, and REST API
 */
export function useNotificationManager() {
    // Real-time (WebSocket)
    const { 
        unreadCount: wsUnreadCount, 
        latestNotification: wsLatestNotification,
        isConnected: wsConnected 
    } = useRealtimeNotifications();

    // Push Notifications
    const {
        subscription: pushSubscription,
        isSupported: pushSupported,
        permission: pushPermission
    } = usePushNotifications();

    // REST API fallback
    const [apiUnreadCount, setApiUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch initial data from API
    useEffect(() => {
        fetchNotificationsFromAPI();
        fetchUnreadCountFromAPI();
    }, []);

    // Poll API when WebSocket is disconnected (fallback)
    useEffect(() => {
        if (!wsConnected) {
            console.log('ðŸ“¡ WebSocket disconnected - falling back to API polling');
            const interval = setInterval(fetchUnreadCountFromAPI, 30000); // Every 30s
            return () => clearInterval(interval);
        }
    }, [wsConnected]);

    const fetchNotificationsFromAPI = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/notifications/history', {
                withCredentials: true,
                params: { limit: 50 }
            });
            setNotifications(response.data.notifications || []);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUnreadCountFromAPI = async () => {
        try {
            const response = await axios.get('/api/notifications/unread-count', {
                withCredentials: true
            });
            setApiUnreadCount(response.data.count || 0);
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    };

    // Intelligent count selection
    // Priority: WebSocket > API fallback
    const unreadCount = wsConnected ? wsUnreadCount : apiUnreadCount;

    // Add new WebSocket notification to local list
    useEffect(() => {
        if (wsLatestNotification) {
            setNotifications(prev => [wsLatestNotification, ...prev]);
        }
    }, [wsLatestNotification]);

    return {
        // Notification data
        notifications,
        unreadCount,
        latestNotification: wsLatestNotification,
        loading,

        // Connection states
        isRealtimeConnected: wsConnected,
        isPushEnabled: !!pushSubscription,
        isPushSupported: pushSupported,
        pushPermission,

        // Actions
        refreshNotifications: fetchNotificationsFromAPI,
        refreshCount: fetchUnreadCountFromAPI
    };
}
```

---

## PART 2: Smart Notification Settings Page

**File: `/app/settings/notifications/page.jsx`**

```javascript
'use client';

import { Bell, Smartphone, Wifi } from 'lucide-react';
import { useNotificationManager } from '@/app/hooks/useNotificationManager';
import NotificationSettings from '@/app/components/Settings/NotificationSettings';

export default function NotificationSettingsPage() {
    const {
        isRealtimeConnected,
        isPushEnabled,
        isPushSupported,
        pushPermission
    } = useNotificationManager();

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <div className="max-w-2xl mx-auto p-4 space-y-6">
                <h1 className="text-2xl font-black">Notification Settings</h1>

                {/* Connection Status */}
                <div className="bg-white rounded-2xl p-4 space-y-3">
                    <h2 className="font-bold text-sm">Connection Status</h2>

                    {/* Real-time (WebSocket) */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                            <Wifi size={20} className={isRealtimeConnected ? 'text-green-500' : 'text-gray-400'} />
                            <div>
                                <p className="text-sm font-bold">Real-time Updates</p>
                                <p className="text-xs text-gray-500">Instant in-app notifications</p>
                            </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                            isRealtimeConnected 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-gray-200 text-gray-600'
                        }`}>
                            {isRealtimeConnected ? 'Active' : 'Inactive'}
                        </div>
                    </div>

                    {/* Push Notifications */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                            <Bell size={20} className={isPushEnabled ? 'text-orange-500' : 'text-gray-400'} />
                            <div>
                                <p className="text-sm font-bold">Push Notifications</p>
                                <p className="text-xs text-gray-500">Alerts when app is closed</p>
                            </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                            isPushEnabled 
                                ? 'bg-orange-100 text-orange-700' 
                                : 'bg-gray-200 text-gray-600'
                        }`}>
                            {isPushEnabled ? 'Enabled' : 'Disabled'}
                        </div>
                    </div>
                </div>

                {/* How It Works */}
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                    <h3 className="font-bold text-blue-900 mb-2">How Notifications Work</h3>
                    <ul className="space-y-2 text-sm text-blue-700">
                        <li className="flex items-start gap-2">
                            <span className="text-blue-500 mt-0.5">â€¢</span>
                            <span><strong>App Open:</strong> Instant updates via real-time connection</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-500 mt-0.5">â€¢</span>
                            <span><strong>App Closed:</strong> Push notifications bring you back</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-500 mt-0.5">â€¢</span>
                            <span><strong>Critical Updates:</strong> Both methods ensure you never miss important alerts</span>
                        </li>
                    </ul>
                </div>

                {/* Push Notification Controls */}
                <NotificationSettings />

                {/* Recommendation */}
                {!isPushEnabled && isPushSupported && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                        <p className="text-sm text-amber-800">
                            ðŸ’¡ <strong>Recommendation:</strong> Enable push notifications to stay updated even when the app is closed. You'll never miss order updates or delivery alerts!
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
```

---

## PART 3: Backend Notification Delivery Decision Matrix

### Implementation Guide for Different Scenarios

The backend intelligently chooses delivery methods based on context:

#### SCENARIO 1: Order Status Change (High Priority)
```javascript
/**
 * User should ALWAYS know immediately
 * Uses: Database + WebSocket + Push
 */
async function handleOrderStatusChange(userId, orderId, newStatus) {
    // This automatically:
    // 1. Saves to database (history)
    // 2. Sends via WebSocket if user online
    // 3. Sends push if user offline OR status is critical
    await sendOrderNotification(userId, orderId, newStatus, {
        restaurantName: order.restaurantName,
        totalAmount: order.totalAmount
    });
}
```

#### SCENARIO 2: Promotional Notification (Low Priority)
```javascript
/**
 * Don't interrupt user if they're actively using app
 * Uses: WebSocket (if online) OR Push (if offline)
 */
async function sendPromoNotification(userId, promoDetails) {
    const userSockets = await getUserSockets(userId);
    const isUserOnline = userSockets && userSockets.length > 0;

    if (isUserOnline) {
        // User is active - just show in-app notification
        // Don't send push to avoid interruption
        emitToUser(userId, 'new_notification', {
            type: 'promo',
            title: promoDetails.title,
            body: promoDetails.message,
            // ...
        });
    } else {
        // User is offline - safe to send push
        await sendNotification(userId, 'promo', {
            message: promoDetails.message,
            url: promoDetails.link
        });
    }
}
```

#### SCENARIO 3: Delivery Location Update (Continuous)
```javascript
/**
 * Only send via WebSocket - don't spam with push
 * Uses: WebSocket only (no database, no push)
 */
async function updateDeliveryLocation(orderId, userId, location) {
    // Only emit via WebSocket
    // Don't save each location update to database
    // Don't send push notifications
    emitToUser(userId, 'delivery_location_update', {
        orderId,
        driverLocation: location,
        timestamp: Date.now()
    });
}
```

#### SCENARIO 4: Critical Alert (e.g., Order Cancelled)
```javascript
/**
 * Use ALL channels to ensure delivery
 * Uses: Database + WebSocket + Push (always)
 */
async function sendCriticalAlert(userId, orderId, reason) {
    // Save to database
    const notification = await Notification.create({
        userId,
        type: 'order_cancelled',
        title: 'âŒ Order Cancelled',
        body: `Order #${orderId} was cancelled. ${reason}`,
        orderId,
        read: false
    });

    // Send via WebSocket (if online)
    emitToUser(userId, 'new_notification', notification);

    // ALWAYS send push (even if online)
    await sendPushNotification(userId, notification, {
        priority: 'critical',
        requireInteraction: true
    });

    // Optional: Send SMS for ultra-critical cases
    // await sendSMS(user.phone, notification.body);
}
```

---

## PART 4: Testing Strategy

### Comprehensive Test Scenarios

```javascript
/**
 * TEST 1: User is actively using app
 * Expected: WebSocket notification only, no push
 */
async function test_UserOnline() {
    // 1. User opens app (WebSocket connects)
    // 2. Order status changes to "preparing"
    // 3. Verify: Toast notification appears
    // 4. Verify: No push notification sent
    // 5. Verify: Notification saved to database
}

/**
 * TEST 2: User has app closed
 * Expected: Push notification sent
 */
async function test_UserOffline() {
    // 1. User closes app (WebSocket disconnects)
    // 2. Order status changes to "dispatched"
    // 3. Verify: Push notification appears on device
    // 4. Verify: Notification saved to database
    // 5. User opens app
    // 6. Verify: Notification appears in history
}

/**
 * TEST 3: Critical notification while user is online
 * Expected: Both WebSocket AND push
 */
async function test_CriticalNotification() {
    // 1. User is browsing menu (app open)
    // 2. Order status changes to "dispatched" (critical)
    // 3. Verify: Toast notification appears
    // 4. Verify: Push notification also sent
    // 5. Reasoning: User might not be looking at app
}

/**
 * TEST 4: Network interruption
 * Expected: Auto-reconnect, sync state
 */
async function test_NetworkInterruption() {
    // 1. User has app open
    // 2. Network disconnects
    // 3. Order status changes (backend receives)
    // 4. Network reconnects
    // 5. Verify: Notification count syncs
    // 6. Verify: Missed notifications appear
}

/**
 * TEST 5: Multiple devices
 * Expected: All devices receive notification
 */
async function test_MultipleDevices() {
    // 1. User logged in on phone and tablet
    // 2. Order status changes
    // 3. Verify: WebSocket notification on both devices
    // 4. User closes phone, keeps tablet open
    // 5. Another order update
    // 6. Verify: WebSocket on tablet, push on phone
}
```

---

## PART 5: Performance Optimization

### Backend Optimizations

```javascript
/**
 * Batch notification sending for multiple users
 */
async function sendBatchNotifications(userNotifications) {
    const promises = userNotifications.map(({ userId, type, data }) => 
        sendNotification(userId, type, data)
    );

    // Send all notifications in parallel
    await Promise.allSettled(promises);
}

/**
 * Debounce rapid status changes
 */
const debounce = require('lodash/debounce');

const debouncedNotification = debounce(async (userId, type, data) => {
    await sendNotification(userId, type, data);
}, 1000, { leading: true, trailing: false });

/**
 * Cache active user sockets
 */
const activeUserCache = new Map();

async function isUserOnlineCached(userId) {
    // Check cache first
    if (activeUserCache.has(userId)) {
        const cached = activeUserCache.get(userId);
        if (Date.now() - cached.timestamp < 10000) { // 10s cache
            return cached.isOnline;
        }
    }

    // Fetch from Socket.IO
    const sockets = await getUserSockets(userId);
    const isOnline = sockets && sockets.length > 0;

    // Update cache
    activeUserCache.set(userId, {
        isOnline,
        timestamp: Date.now()
    });

    return isOnline;
}
```

---

## PART 6: Scaling Considerations

### When to Add Redis (Socket.IO Adapter)

**Threshold**: 1,000+ concurrent WebSocket connections

**Implementation**:

```bash
npm install @socket.io/redis-adapter redis
```

```javascript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

async function initializeSocket(server) {
    const io = new Server(server, {
        // ... existing config
    });

    // Redis adapter for multi-server scaling
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));

    console.log('âœ… Socket.IO using Redis adapter');

    // ... rest of setup
}
```

**Benefits**:
- Horizontal scaling across multiple servers
- Share socket events between server instances
- Load balance WebSocket connections

---

## PART 7: Final Integration Checklist

### Backend
- âœ… WebSocket server initialized with authentication
- âœ… Notification service uses WebSocket for online users
- âœ… Push notifications sent for offline users
- âœ… Critical notifications use both channels
- âœ… All notifications saved to database
- âœ… Expired push subscriptions auto-cleaned
- âœ… Socket.IO rooms working (user, order, restaurant)
- âœ… Delivery location updates via WebSocket only

### Frontend
- [ ] Socket.IO connects on user login
- [ ] Real-time notification count updates
- [ ] Toast notifications appear instantly
- [ ] Order tracking page shows live updates
- [ ] Push notifications enabled (user opt-in)
- [ ] Graceful fallback when WebSocket disconnected
- [ ] Connection status indicator visible
- [ ] Multiple devices receive notifications
- [ ] No duplicate notifications

### Testing
- [ ] User online â†’ WebSocket notifications work
- [ ] User offline â†’ Push notifications work
- [ ] Critical updates â†’ Both channels used
- [ ] Network interruption â†’ Auto-reconnects
- [ ] Multiple devices â†’ All receive updates
- [ ] Order tracking â†’ Live status changes
- [ ] Delivery tracking â†’ Location updates
- [ ] Notification history â†’ All saved correctly

### Performance
- [ ] No memory leaks in hooks
- [ ] Event listeners cleaned up
- [ ] WebSocket reconnection working
- [ ] Database queries optimized
- [ ] Push notification batching
- [ ] Redis adapter (if >1000 users)

---

## Production Deployment Notes

1. **Environment Variables**:
   ```env
   NEXT_PUBLIC_API_URL=https://your-api.com
   ```

2. **CORS Configuration**: Ensure backend allows your frontend domain

3. **SSL/TLS**: Use `wss://` for WebSocket connections in production

4. **Load Balancing**: If using multiple servers, implement Redis adapter (see scaling docs)

---

This integration provides **real-time, instant updates** for orders and notifications without polling! ðŸš€

