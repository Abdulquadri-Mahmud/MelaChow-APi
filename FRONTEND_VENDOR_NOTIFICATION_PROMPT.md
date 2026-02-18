# Frontend Implementation: Vendor Real-Time Notifications

We have just completed the backend implementation for **Vendor Real-Time Notifications**. Your task is to integrate these into the Vendor Dashboard frontend to create a seamless, reactive experience.

## 🚀 Objective
1.  **Update Dashboard Header**: Implement a real-time notification badge on the bell icon in the vendor dashboard header.
2.  **Create Notifications Page**: Build a new page at `/vendor/notifications` (or your existing route) to display the history of store notifications.
3.  **Real-Time Toasts**: Show instant popup alerts when a new order arrives.

## 📡 Backend Specifications

### WebSocket Events
The backend now emits the following events to authenticated vendors:
-   `new_notification`: Fired for every alert (New orders, cancellations, etc.).
    -   *Payload*: `{ _id, title, body, type, orderId, url, icon, createdAt, read }`
-   `notification_count_update`: Fired whenever unread status changes.
    -   *Payload*: `{ count: number }`
-   `new_order`: Specifically for the order management system.
    -   *Payload*: Full order object including `customerName`, `items`, and `totalAmount`.

### REST API Endpoints
-   `GET /api/notification/history?restaurantId=ID`: Fetch history (supports pagination).
-   `GET /api/notification/unread-count?restaurantId=ID`: Get current unread count.
-   `PATCH /api/notification/mark-read/:id`: Mark a notification as read.
-   `PATCH /api/notification/mark-all-read`: Mark all as read.

## 🛠️ Implementation Tasks

### 1. Unified Socket Listener
In your vendor layout or `SocketContext`, ensure the vendor joins their restaurant room:
```javascript
// On vendor login/mount
socket.emit('subscribe_restaurant', restaurantId);

// Global Listeners
socket.on('new_notification', (data) => {
    // 1. Show a toast (e.g., using sonner or react-hot-toast)
    // 2. Play a subtle notification sound
    // 3. Update the badge count state
});
```

### 2. Header Update (`VendorHeader.tsx`)
-   Add a **Notification Badge** to the bell icon.
-   Fetch the initial count on mount.
-   Use the `notification_count_update` socket event to keep it synced without polling.

### 3. Vendor Notifications Page
Create a premium-looking notification center:
-   **Group by Date**: (Today, Yesterday, Earlier).
-   **Status Indicators**: Blue dot for unread, grey for read.
-   **Actionable Items**: Clicking an `order_placed` notification should navigate to that specific order's detail page.
-   **Empty State**: A clean "All caught up!" illustration when there are no notifications.

## 🎨 Design Direction
-   **Aesthetic**: Premium, glassmorphism-inspired UI.
-   **Micro-interactions**: Subtle entrance animations for new notifications (e.g., a slide-in from the top right).
-   **Icons**: Use specific icons for different notification types (e.g., 🛍️ for orders, ❌ for cancellations).

## 💡 Important Note
The backend has been updated to handle **Triple-Delivery**: WebSocket for instant updates, Push Notifications for background, and Database for history. Your focus is the **WebSocket** and **Database History** integration.

Please proceed with building the UI components and wiring up the service listeners.
