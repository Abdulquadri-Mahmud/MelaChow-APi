# Frontend Integration Prompt: MelaChow Notification System

This document outlines the API endpoints and expected payloads for the newly implemented Notification History and Push Notification system. All restricted routes require a valid **User Authorization Token** in the header.

## Base URL: `/api/notifications`

### 1. Setup & Subscription

#### GET `/vapid-public-key`
- **Purpose**: Fetch the public key required to initialize the Web Push subscription in the service worker.
- **Payload**: None
- **Response**: `{ "publicKey": "..." }`

#### POST `/subscribe`
- **Purpose**: Register a device for push notifications.
- **Payload**:
  ```json
  {
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    },
    "deviceType": "mobile" // enum: ["mobile", "desktop", "tablet", "unknown"]
  }
  ```

#### POST / DELETE `/unsubscribe`
- **Purpose**: Remove a specific device subscription.
- **Payload**: Send the `subscription` object directly (same as the object inside `req.body.subscription` in the subscribe call).
  ```json
  {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": { "p256dh": "...", "auth": "..." }
  }
  ```

---

### 2. Notification History

#### GET `/history`
- **Purpose**: Fetch the user's notification history.
- **Query Parameters**:
  - `limit`: (Optional) Number of items to fetch (default: 100).
  - `skip`: (Optional) Number of items to skip for pagination (default: 0).
  - `type`: (Optional) Filter by type. 
    - Use `'orders'` to filter for all `order_*` notifications.
    - Use `'promos'` to filter for `promo` and `discount`.
    - Use specific keys (e.g., `'account_update'`) or `'all'`.
  - `unread`: (Optional) Set to `'true'` to fetch only unread items.
- **Response**:
  ```json
  {
    "success": true,
    "notifications": [
      {
        "_id": "...",
        "title": "ðŸŽ‰ Order Placed!",
        "body": "Your order #12345 has been placed successfully.",
        "type": "order_placed",
        "read": false,
        "url": "/profile/orders/ORD-...",
        "createdAt": "2024-02-12T..."
      }
    ],
    "total": 1,
    "hasMore": false
  }
  ```

#### GET `/unread-count`
- **Purpose**: Get the number of unread notifications for a badge indicator.
- **Response**: `{ "success": true, "count": 5 }`

---

### 3. Management Actions

#### PATCH `/:id/read`
- **Purpose**: Mark a specific notification as read.
- **URL Param**: `id` - The MongoDB `_id` of the notification.
- **Response**: `{ "success": true, "notification": { ... } }`

#### PATCH `/read-all`
- **Purpose**: Mark all user notifications as read.
- **Response**: `{ "success": true, "message": "All notifications marked as read", "modifiedCount": 5 }`

#### DELETE `/:id`
- **Purpose**: Delete a specific notification from history.
- **URL Param**: `id` - The MongoDB `_id` of the notification.

#### DELETE `/clear-all`
- **Purpose**: Delete the entire notification history for the current user.

---

### 4. Testing

#### POST `/test`
- **Purpose**: Send a test push notification to all of the user's current devices.
- **Response**: `{ "message": "Test notification sent" }`

---

### Payload Types Reference
The `type` field in the history refers to:
- `order_placed`, `order_confirmed`, `order_preparing`, `order_ready`, `order_dispatched`, `order_delivered`, `order_cancelled`
- `promo`, `discount`, `delivery_nearby`
- `account_update`, `general`

