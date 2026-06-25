# MelaChow Rider Flows & API Documentation

This document provides a comprehensive specification of all rider-related flows, state transitions, API endpoints, error handling, background worker tasks, and payment mechanisms within the MelaChow Platform.

---

## 1. Overview of Rider States & Lifecycle

Riders on the MelaChow platform cycle through several states defined in the `Rider` model schema:

| State | Description | Eligible Actions |
|---|---|---|
| `offline` | The rider is logged out or currently inactive. | Login, update profile, view wallet/history. |
| `available` | The rider is active and searching for deliveries in their assigned state/city. | Receive broadcast assignments, change status to offline. |
| `pending_assignment` | The rider has been offered one or more broadcast delivery offers and has 90 seconds to respond. | Accept assignment (goes to `on_delivery`), reject/timeout offer (goes back to `available`). |
| `on_delivery` | The rider has accepted a delivery and is currently in-transit (picking up or delivering food). | Mark picked up, request OTP, confirm OTP (completes delivery), terminate order, report undeliverable. Cannot go offline. |

---

## 2. Core Business Flows & Mechanics

### A. Broadcast & Auto-Assignment Algorithm
When a vendor marks an order as ready, the system initiates the automated rider assignment broadcast:
1. **Scope**: The system queries active, verified riders (`status: "available"` or `status: "on_delivery"` or `status: "pending_assignment"`) matching the order's `cityId` and `stateId`.
2. **Exclusions**: Any riders who have explicitly rejected this specific order are excluded.
3. **Offer Generation**: Eligible riders receive the offer details simultaneously via Socket.IO (`ORDER_ASSIGNED_TO_RIDER`) and push notification. Their database status is updated to `pending_assignment`, and a `RiderAssignment` document is created with a `90s` time-to-live (`expiresAt`).
4. **FIFO Dispatch Queue**: If no riders are online or available in the order's city, the order is enqueued into `OrderBroadcastQueue` as `waiting`. When a rider changes their status to `available` (or finishes a delivery), a background catch-up task (`catchupRiderWithPendingOrders`) automatically dispatches the oldest queued order in their city.
5. **Broadcast Timeout**: A background job (`broadcast-timeout`) fires after 95s. If the order is still unassigned, it triggers a re-broadcast. If three broadcast attempts fail, alerts are sent to the vendor (at 10 mins) and the customer (at 15 mins) to notify them of the delay.

### B. Delivery OTP Verification
To guarantee secure handovers, delivery confirmation requires a One-Time Password (OTP):
- **Requesting OTP**: The rider requests the OTP once they arrive at the customer's delivery address. The endpoint (`/request-delivery-otp`) validates that the order is `out_for_delivery` and sends a 6-digit code via SMS (priority) or email to the customer. It also emits the OTP via sockets to display it live on the customer's tracking screen.
- **Bypass Mode**: If the SMS/Email providers fail, the system falls back to a temporary bypass code (`123456`) to ensure the rider isn't blocked.
- **Verification**: The customer reads the code to the rider, who inputs it. Confirming the OTP executes the atomic wallet payouts and completes the delivery.

### C. Watchdog & Termination Strike System
- **1-Hour Delivery Watchdog**: Once a rider accepts a delivery, a BullMQ watchdog job (`delivery-timeout`) is queued for 1 hour. If the delivery is not confirmed within this hour, the watchdog automatically resets the order status back to `ready_for_pickup`, unassigns the rider, and triggers a re-broadcast.
- **Rider-Initiated Termination**: A rider can manually cancel an accepted delivery (`/terminate`). If the food was **already picked up** (`out_for_delivery`), the system logs an `OrderTermination` record and increments the rider's `terminationStrikes`.
- **Suspension**: If a rider accumulates **3 strikes**, they are automatically suspended for a configured duration (e.g. 24 hours), their account status is forced to `offline`, and they are blocked from going back online until the suspension expires.

### D. Undeliverable / Dispute Escalation
If a rider cannot complete a delivery (e.g., customer unreachable, address incorrect):
1. **Reporting**: The rider reports the order as `/undeliverable`, moving the order to `disputed_delivery`.
2. **Remake Request**: A notification is sent to the vendor to decide if they will remake the food (within a 15-minute window).
3. **Escalation**: If the vendor does not respond within 15 minutes, a background dispute escalation worker (`dispute-escalation`) is triggered. The order remains as `disputed_delivery`, and a high-priority alert (`dispute_escalation_admin`) is sent to the admin dashboard for manual mediation.

---

## 3. Detailed Endpoint Reference

All endpoints (except registration/login) require a bearer authentication token:
`Authorization: Bearer <RIDER_ACCESS_TOKEN>`

### A. Authentication & Onboarding

#### 1. Register Rider
* **URL**: `POST /api/riders/register`
* **Auth**: Public
* **Request Body**:
```json
{
  "name": "John Doe",
  "phone": "08012345678",
  "password": "securepassword123",
  "email": "johndoe@example.com", // Optional
  "stateId": "60d5ec49867c29001f3014a1", // Optional (with cityId)
  "cityId": "60d5ec49867c29001f3014a2", // Optional (with stateId)
  "requestedState": "Lagos", // Optional (fallback if IDs not selected)
  "requestedCity": "Ikeja", // Optional (fallback if IDs not selected)
  "serviceZones": ["Ikeja", "Ogba"], // Optional
  "vehicleType": "motorbike" // "motorbike" | "bicycle" (default)
}
```
* **Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "Rider account registered successfully. Your account is pending admin approval.",
  "data": {
    "_id": "65b822d...",
    "name": "John Doe",
    "phone": "08012345678",
    "role": "rider",
    "status": "offline",
    "isVerified": false,
    "isActive": true
  }
}
```
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "Name, phone, password, state and city are required"}`
  - `400 Bad Request`: `{"success": false, "message": "A rider with this phone number already exists"}`

#### 2. Rider Login
* **URL**: `POST /api/auth/rider/login`
* **Auth**: Public
* **Request Body**:
```json
{
  "phone": "08012345678",
  "password": "securepassword123"
}
```
* **Success Response (200 OK)**:
*(Also sets HttpOnly cookie `riderToken` containing the refresh token)*
```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "rider": {
    "_id": "65b822d...",
    "name": "John Doe",
    "phone": "08012345678",
    "status": "offline",
    "isVerified": true,
    "isActive": true
  }
}
```
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "Phone and password are required"}`
  - `404 Not Found`: `{"success": false, "message": "Rider not found"}`
  - `403 Forbidden`: `{"success": false, "message": "Account is temporarily locked due to too many failed attempts"}` (5 failed attempts locks account for 15 mins)
  - `403 Forbidden`: `{"success": false, "message": "Rider account is pending admin approval"}` (if not verified)
  - `401 Unauthorized`: `{"success": false, "message": "Invalid credentials"}`

#### 3. Rider Logout
* **URL**: `POST /api/auth/rider/logout`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
*(Clears the `riderToken` cookie and blacklists access and refresh tokens in Redis)*
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### 4. Get Current Profile
* **URL**: `GET /api/auth/rider/me`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "_id": "65b822d...",
    "name": "John Doe",
    "phone": "08012345678",
    "status": "available",
    "isVerified": true,
    "isActive": true,
    "totalDeliveries": 12,
    "totalEarnings": 7200
  }
}
```

#### 5. Update Profile (Self)
* **URL**: `PATCH /api/riders/:riderId`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "name": "John Updated",
  "phone": "08087654321",
  "email": "updated@example.com",
  "password": "newsecurepassword123" // Optional
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "_id": "65b822d...",
    "name": "John Updated",
    "phone": "08087654321",
    "email": "updated@example.com"
  }
}
```
* **Common Errors**:
  - `43 Forbidden`: `{"success": false, "message": "Unauthorized to update this profile"}`

---

### B. Delivery & Active Order Flow

#### 1. Fetch Active Delivery Order
* **URL**: `GET /api/riders/:riderId/active-order`
* **Auth**: Bearer Token
* **Success Response (200 OK - No Active Order)**:
```json
{
  "success": true,
  "data": {
    "order": null
  }
}
```
* **Success Response (200 OK - With Active Order)**:
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "65b839a...",
      "vendorOrderId": "65b839a_v...",
      "orderId": "MC-10395",
      "status": "out_for_delivery",
      "items": [
        {
          "name": "Special Jollof Rice",
          "quantity": 2,
          "price": 2500
        }
      ],
      "restaurantName": "Mela Palace",
      "restaurantAddress": "12, Allen Avenue, Ikeja",
      "userName": "Alice Smith",
      "userPhone": "08099887766",
      "deliveryFullAddress": "Block 4, Flat 2, Maryland Estate, Lagos",
      "deliveryFee": 600,
      "deliveryOtp": {
        "status": "sent",
        "createdAt": "2026-06-24T08:00:00.000Z"
      }
    }
  }
}
```

#### 2. Get Pending Assignment Offers
* **URL**: `GET /api/riders/:riderId/pending-offers`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "offers": [
      {
        "_id": "65b839a_v...",
        "vendorOrderId": "65b839a_v...",
        "orderId": "MC-10395",
        "status": "assigned",
        "restaurantName": "Mela Palace",
        "restaurantAddress": "12, Allen Avenue, Ikeja",
        "deliveryFullAddress": "Block 4, Flat 2, Maryland Estate, Lagos",
        "deliveryFee": 600,
        "items": [...],
        "hasPreviousRider": true,
        "previousRider": {
          "name": "Abu Bakar",
          "phone": "08055554444",
          "foodPickedUp": true,
          "terminatedAt": "2026-06-24T07:45:00.000Z",
          "reason": "rider_initiated"
        }
      }
    ]
  }
}
```

#### 3. Fetch Single Order Details
* **URL**: `GET /api/riders/:riderId/orders/:orderId`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "orderId": "MC-10395",
    "orderStatus": "rider_assigned",
    "deliveryFullAddress": "Block 4, Flat 2, Maryland Estate, Lagos",
    "restaurantName": "Mela Palace",
    "items": [...],
    "deliveryOtp": null
  }
}
```
* **Common Errors**:
  - `403 Forbidden`: `{"success": false, "message": "Rider not authorized to view this order"}` (Rider must be the assigned owner or a broadcast candidate)
  - `404 Not Found`: `{"success": false, "message": "Order not found"}`

#### 4. Update Status (Accept / Reject / Go Offline)
* **URL**: `PATCH /api/riders/:riderId/status`
* **Auth**: Bearer Token
* **Request Body (Accept Broadcast Assignment)**:
```json
{
  "status": "on_delivery",
  "orderId": "65b839a_v..." // The VendorOrder ID matching the offer
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "_id": "65b822d...",
    "status": "on_delivery",
    "currentOrderId": "65b839a_v..."
  }
}
```
* **Request Body (Reject Offer)**:
```json
{
  "status": "available",
  "orderId": "65b839a_v...",
  "reason": "Rider busy with mechanical issue"
}
```
* **Request Body (Go Offline)**:
```json
{
  "status": "offline"
}
```
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "You already have an ongoing delivery. Please complete your current active delivery before accepting a new job."}`
  - `400 Bad Request`: `{"success": false, "message": "No active assignment found to accept."}` (If accepting status `on_delivery` but no active broadcast assignment matching `orderId` exists or is expired)
  - `400 Bad Request`: `{"success": false, "message": "You cannot go offline while on an active delivery!"}`
  - `409 Conflict`: `{"success": false, "message": "This order has already been accepted by another rider"}`

#### 5. Mark Order Picked Up
* **URL**: `PATCH /api/riders/:riderId/picked-up`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "orderId": "65b839a_v..."
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Order picked up",
  "data": {
    "_id": "65b839a...",
    "orderStatus": "out_for_delivery"
  }
}
```
* **Common Errors**:
  - `403 Forbidden`: `{"success": false, "message": "Rider not assigned to this order"}`

#### 6. Request Delivery Verification OTP
* **URL**: `POST /api/riders/:riderId/request-delivery-otp`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "orderId": "65b839a_v..."
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "OTP sent to customer via SMS", // or via Email / Bypass Mode message
  "method": "sms" // "sms" | "email" | "bypass"
}
```
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "Delivery OTP can only be requested after the order has been picked up. Current status: ready_for_pickup"}`
  - `403 Forbidden`: `{"success": false, "message": "Rider not assigned to this order"}`
  - `503 Service Unavailable`: `{"success": false, "message": "Unable to send OTP to customer right now. Check the customer has a valid phone number or email, then try again."}`

#### 7. Confirm Delivery (Settle Payment & Complete)
* **URL**: `POST /api/riders/:riderId/confirm-delivery`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "orderId": "65b839a_v...",
  "otp": "857201"
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Order delivered successfully",
  "data": {
    "_id": "65b839a...",
    "orderStatus": "delivered",
    "riderEarnings": 600
  }
}
```
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "Incorrect code. Please ask the customer to check again."}`
  - `403 Forbidden`: `{"success": false, "message": "Rider not assigned to this order"}`

#### 8. Terminate Order (Rider Cancel / Drop delivery)
* **URL**: `POST /api/riders/:riderId/orders/:orderId/terminate`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "note": "Flat tire on motorway, cannot complete transit"
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "foodPickedUp": true,
  "message": "Order terminated. A strike has been logged. New rider will contact you to collect the food."
}
```
* **Common Errors**:
  - `403 Forbidden`: `{"success": false, "message": "You are not assigned to this order"}`
  - `400 Bad Request`: `{"success": false, "message": "Cannot terminate a completed or cancelled order"}`

#### 9. Report Order Undeliverable
* **URL**: `POST /api/riders/:riderId/orders/:orderId/undeliverable`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "reason": "Customer address inaccessible and customer unreachable after 5 phone attempts."
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Order flagged as disputed. Vendor has been notified."
}
```

#### 10. Fetch Rider Completed Orders History
* **URL**: `GET /api/riders/:riderId/orders`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "orders": [
    {
      "_id": "65b839a...",
      "orderId": "MC-10395",
      "orderStatus": "delivered",
      "status": "delivered",
      "createdAt": "2026-06-24T06:00:00.000Z",
      "items": [...]
    }
  ]
}
```

---

### C. Wallet & Payout Flows

#### 1. Fetch Rider Wallet Details
* **URL**: `GET /api/riders/:riderId/wallet`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "_id": "65b83cf...",
    "ownerId": "65b822d...",
    "ownerModel": "Rider",
    "balance": 1800,
    "totalEarned": 7200,
    "totalWithdrawn": 5400,
    "transactions": [
      {
        "type": "credit",
        "amount": 600,
        "description": "Delivery payout for Order MC-10395",
        "transactionType": "rider_payout",
        "date": "2026-06-24T08:10:00.000Z"
      }
    ]
  }
}
```

#### 2. Resolve Bank Account Name (Payout Setup Step 1)
* **URL**: `GET /api/riders/:riderId/payout/resolve-account`
* **Auth**: Bearer Token
* **Query Parameters**:
  - `accountNumber`: `0123456789`
  - `bankCode`: `058` (e.g. GTBank)
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accountName": "JOHN DOE",
    "accountNumber": "0123456789",
    "bankCode": "058"
  }
}
```
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "Could not resolve account. Please check the account number and bank."}`

#### 3. Save Bank Account (Payout Setup Step 2)
* **URL**: `POST /api/riders/:riderId/payout/bank-account`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "accountNumber": "0123456789",
  "bankCode": "058",
  "bankName": "Guaranty Trust Bank"
}
```
* **Success Response (200 OK)**:
*(Creates Paystack Transfer Recipient behind the scenes)*
```json
{
  "success": true,
  "message": "Bank account saved successfully",
  "data": {
    "bankName": "Guaranty Trust Bank",
    "accountNumber": "0123456789",
    "accountName": "JOHN DOE",
    "payoutEnabled": true
  }
}
```
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "Could not verify bank account. Please check the details and try again."}`
  - `502 Bad Gateway`: `{"success": false, "message": "Failed to register bank account with payment provider. Please try again."}`

#### 4. Fetch Saved Bank Account details
* **URL**: `GET /api/riders/:riderId/payout/bank-account`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "bankName": "Guaranty Trust Bank",
    "accountNumber": "0123456789",
    "accountName": "JOHN DOE",
    "payoutEnabled": true
  }
}
```

#### 5. Initiate Withdrawal (Rider Payout Step 3)
> [!WARNING]
> **API Implementation Gap**: The controller contains the complete `initiateRiderWithdrawal` logic, but the route is not currently registered in the Express routing file `routes/rider.routes.js`.

* **Expected URL**: `POST /api/riders/:riderId/payout/withdraw`
* **Auth**: Bearer Token
* **Request Body**:
```json
{
  "amount": 5000
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Withdrawal initiated successfully",
  "data": {
    "reference": "RWD_F810CA3...",
    "requestedAmount": 5000,
    "transferFee": 25,
    "netAmount": 4975,
    "status": "processing",
    "bankName": "Guaranty Trust Bank",
    "accountNumber": "0123456789"
  }
}
```
* **Withdrawal Transfer Fees**:
  - $\le$ ₦5,000: **₦10** fee
  - $\le$ ₦50,000: **₦25** fee
  - $>$ ₦50,000: **₦50** fee
* **Common Errors**:
  - `400 Bad Request`: `{"success": false, "message": "Minimum withdrawal amount is ₦1,500"}`
  - `400 Bad Request`: `{"success": false, "message": "Maximum withdrawal amount is ₦500,000"}`
  - `400 Bad Request`: `{"success": false, "message": "Insufficient balance. Available: ₦1,200"}`
  - `400 Bad Request`: `{"success": false, "message": "You already have a withdrawal in progress. Please wait for it to complete."}`
  - `429 Too Many Requests`: `{"success": false, "message": "Withdrawal cooldown active. You can withdraw again in 14 hours."}` (24-hour payout cooldown)

#### 6. Fetch Payout/Withdrawal History
* **URL**: `GET /api/riders/:riderId/payout/history`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "65b83df...",
      "requestedAmount": 5000,
      "transferFee": 25,
      "netAmount": 4975,
      "status": "completed",
      "paystackReference": "RWD_F810CA3...",
      "bankName": "Guaranty Trust Bank",
      "accountNumber": "0123456789",
      "accountName": "JOHN DOE",
      "settledAt": "2026-06-23T14:30:00.000Z"
    }
  ]
}
```

#### 7. Fetch Supported Bank List
* **URL**: `GET /api/riders/banks`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    { "name": "Access Bank", "code": "044" },
    { "name": "Guaranty Trust Bank", "code": "058" }
  ]
}
```

---

### D. Notifications

#### 1. Fetch Notification History
* **URL**: `GET /api/rider-notifications/` (or `/history`)
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "65b83e1...",
      "title": "New Order Offered",
      "message": "You have a new delivery offer from Mela Palace for ₦600.",
      "type": "order_assigned",
      "isRead": false,
      "createdAt": "2026-06-24T08:15:00.000Z"
    }
  ]
}
```

#### 2. Get Unread Notification Count
* **URL**: `GET /api/rider-notifications/unread-count` (or `/unread`)
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "count": 3
}
```

#### 3. Mark Notification As Read
* **URL**: `PATCH /api/rider-notifications/:id/read`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

#### 4. Clear All Notifications
* **URL**: `DELETE /api/rider-notifications/clear-all`
* **Auth**: Bearer Token
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "All notifications cleared"
}
```

---

## 4. Admin Management APIs

Admin routes require admin privileges (`Authorization: Bearer <ADMIN_ACCESS_TOKEN>`).

### A. Rider Operations
- `GET /api/admin/riders`: List all riders with advanced filtering (`?status=available`, `?cityId=...`, `?isVerified=true`, `?available=true`).
- `POST /api/admin/riders`: Create a new platform-managed rider directly.
- `PATCH /api/admin/riders/:riderId`: Update profile, verify status, platform vehicle, vehicle type, or location status.
- `PATCH /api/admin/riders/:riderId/approve`: Approve a pending rider account, enabling them to receive delivery offers.
- `DELETE /api/admin/riders/:riderId`: Soft-delete/deactivate a rider (fails if the rider has an active delivery).
- `PATCH /api/admin/riders/:riderId/reject-offer`: Manually cancel a pending assignment for a rider who is unresponsive.
- `GET /api/admin/riders/:riderId/history`: Fetch rider activity summary (today's deliveries, earnings before/after cutoff, next payout schedule, related transactions list).
- `GET /api/admin/rider-assignments`: Fetch detailed log of order assignments.

### B. Platform Vehicle Fleet Operations
- `GET /api/admin/platform-vehicles`: View platform vehicles. Add query `?available=true` to find unassigned stock.
- `POST /api/admin/platform-vehicles`: Register a new platform vehicle (fields: `identifier`, `label`, `vehicleType` ("motorbike"|"bicycle"), `status` ("available"|"assigned"|"maintenance")).
- `PATCH /api/admin/platform-vehicles/:vehicleId`: Edit vehicle properties or assign it to a rider.
- `DELETE /api/admin/platform-vehicles/:vehicleId`: Delete a vehicle (unassigns rider automatically).
- `PATCH /api/admin/platform-vehicles/:vehicleId/unassign`: Unassign a rider from a vehicle, resetting rider ownership back to `"own"`.

---

## 5. Real-Time Socket Events (Socket.IO)

The rider client should establish a connection to `/socket.io` and join room `rider:<RiderID>` on authentication.

### Events Emitted to Rider Client
- `ORDER_ASSIGNED_TO_RIDER`: Fired when a broadcast offer is sent to the rider.
  - **Payload**:
    ```json
    {
      "orderId": "65b839a...",
      "riderId": "65b822d...",
      "vendorName": "Mela Palace",
      "items": [...],
      "deliveryAddress": {...},
      "payout": 600,
      "assignmentMode": "automatic",
      "assignmentExpiresAt": "2026-06-24T08:21:50.000Z"
    }
    ```
- `ASSIGNMENT_CANCELLED`: Fired if another rider accepted the order first, if the offer expired, or if an admin canceled it.
  - **Payload**:
    ```json
    {
      "orderId": "65b839a...",
      "reason": "accepted_by_another_rider",
      "message": "This order has been accepted by another rider."
    }
    ```
- `ORDER_STATUS_UPDATE`: Emitted when requesting delivery OTP or order changes.

### Events Emitted by Rider to Server
- The rider does not emit specific socket actions for states; status shifts (like marking picked up or confirming OTP) are handled via standard HTTP REST API endpoints, which then emit real-time events to all concerned rooms.
