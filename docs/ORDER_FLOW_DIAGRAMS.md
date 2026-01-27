# Order Creation Flow - Visual Diagrams

**Date:** 2026-01-26

---

## 🔴 Current Flow (INCORRECT)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (User)                              │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ POST /api/orders/create
                                  │ { items, deliveryAddress, ... }
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND: initializePayment()                      │
│                                                                       │
│  1. Validate items and calculate total                              │
│  2. Generate Paystack reference: PSK_timestamp_random                │
│  3. ❌ Create PendingOrder (NOT Order):                              │
│     {                                                                │
│       paymentReference: "PSK_...",                                   │
│       payload: { items, deliveryAddress, ... }                       │
│     }                                                                │
│  4. Initialize Paystack payment                                      │
│  5. Return: { authorization_url, reference }                         │
│                                                                       │
│  ❌ NO Order document created yet!                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ { authorization_url }
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    User Redirected to Paystack                       │
│                    (Payment Gateway)                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ User completes payment
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (User)                              │
│                    Redirected back to app                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ POST /api/orders/verify/:reference
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND: verifyPayment()                          │
│                                                                       │
│  1. Check if Order already exists (idempotency)                      │
│  2. Verify payment with Paystack API                                 │
│  3. Retrieve PendingOrder from database                              │
│  4. ❌ CREATE Order (AFTER payment):                                 │
│     {                                                                │
│       orderId: "ORD-ABC123",                                         │
│       paymentStatus: "paid",  ← Created as "paid" directly           │
│       orderStatus: "pending",                                        │
│       paymentReference: "PSK_..."                                    │
│     }                                                                │
│  5. Create VendorOrders                                              │
│  6. Update vendor wallets                                            │
│  7. Update admin wallet                                              │
│  8. Delete PendingOrder                                              │
│  9. Return: { order, paystack }                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ { order }
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (User)                              │
│                    Order Confirmation Page                           │
└─────────────────────────────────────────────────────────────────────┘
```

### ❌ Issues with Current Flow

1. **No Order exists during payment** - Only PendingOrder
2. **No orderId** to track payment
3. **Order created AFTER payment** - Wrong timing
4. **Failed payments have no Order record** - No audit trail
5. **Stock validated AFTER payment** - User might pay but can't get order

---

## ✅ Correct Flow (INDUSTRY STANDARD)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (User)                              │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ POST /api/orders/initialize
                                  │ { items, deliveryAddress, ... }
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND: initializePayment()                      │
│                                                                       │
│  1. Validate items, stock, pricing                                   │
│  2. ✅ CREATE Order (BEFORE payment):                                │
│     {                                                                │
│       orderId: "ORD-ABC123",                                         │
│       paymentStatus: "pending",  ← Created as "pending"              │
│       orderStatus: "pending",                                        │
│       paymentReference: null,                                        │
│       items: [...],                                                  │
│       total: 7700                                                    │
│     }                                                                │
│  3. Generate reference: PSK_ORD-ABC123_timestamp                     │
│  4. Update Order with paymentReference                               │
│  5. Initialize Paystack payment                                      │
│  6. Return: { authorization_url, reference, orderId }                │
│                                                                       │
│  ✅ Order exists with pending status!                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ { authorization_url, orderId }
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    User Redirected to Paystack                       │
│                    (Payment Gateway)                                 │
│                                                                       │
│  Order already exists in database with:                              │
│  - orderId: "ORD-ABC123"                                             │
│  - paymentStatus: "pending"                                          │
│  - paymentReference: "PSK_ORD-ABC123_..."                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ User completes payment
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (User)                              │
│                    Redirected back to app                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ POST /api/orders/verify/:reference
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND: verifyPayment()                          │
│                                                                       │
│  1. ✅ FIND existing Order by paymentReference                       │
│  2. Check if already paid (idempotency)                              │
│  3. Verify payment with Paystack API                                 │
│  4. If payment SUCCESS:                                              │
│     ✅ UPDATE Order (don't create new):                              │
│     {                                                                │
│       paymentStatus: "paid",  ← Updated from "pending"               │
│       orderStatus: "accepted"                                        │
│     }                                                                │
│     - Create VendorOrders                                            │
│     - Update vendor wallets                                          │
│     - Update admin wallet                                            │
│     - Notify vendors                                                 │
│                                                                       │
│  5. If payment FAILED:                                               │
│     ✅ UPDATE Order:                                                 │
│     {                                                                │
│       paymentStatus: "failed",                                       │
│       orderStatus: "failed"                                          │
│     }                                                                │
│     - Don't create VendorOrders                                      │
│     - Don't update wallets                                           │
│                                                                       │
│  6. Return: { order, paystack }                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ { order }
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (User)                              │
│                    Order Confirmation Page                           │
└─────────────────────────────────────────────────────────────────────┘
```

### ✅ Benefits of Correct Flow

1. **Order exists before payment** - Full audit trail
2. **orderId available immediately** - Better tracking
3. **Stock validated before payment** - No refunds needed
4. **Failed payments have Order record** - Can retry or debug
5. **Industry standard** - Follows best practices

---

## 📊 Order Status Lifecycle

### Current (Incorrect)
```
[No Order] → Payment → [Order: "paid"] → VendorOrders
     ❌                      ❌
```

### Correct
```
[Order: "pending"] → Payment Success → [Order: "paid"] → VendorOrders
       ✅                                    ✅              ✅
                  → Payment Failed → [Order: "failed"]
                                           ✅
```

---

## 🔄 Payment Status Flow

### Correct Order Status Transitions

```
┌─────────────┐
│   pending   │  ← Order created during initializePayment
└─────────────┘
       │
       │ User completes payment
       │
       ├─────────────────┬─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│    paid     │   │   failed    │   │   pending   │
│             │   │             │   │ (timeout)   │
└─────────────┘   └─────────────┘   └─────────────┘
       │                 │                 │
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  accepted   │   │   failed    │   │  cancelled  │
│ (VendorOrders│   │ (no action) │   │ (user      │
│  created)    │   │             │   │  abandoned) │
└─────────────┘   └─────────────┘   └─────────────┘
```

---

## 🗄️ Database State Comparison

### Current Flow (Incorrect)

**Step 1: After initializePayment**
```
PendingOrder Collection:
{
  _id: "...",
  userId: "user123",
  paymentReference: "PSK_1234567890_abcd",
  payload: { items, deliveryAddress, ... }
}

Order Collection:
[EMPTY] ❌ No order exists yet!
```

**Step 2: After verifyPayment**
```
PendingOrder Collection:
[DELETED]

Order Collection:
{
  _id: "...",
  orderId: "ORD-ABC123",
  userId: "user123",
  paymentStatus: "paid",  ❌ Created as "paid" directly
  orderStatus: "pending",
  paymentReference: "PSK_1234567890_abcd",
  items: [...],
  total: 7700
}

VendorOrder Collection:
{
  _id: "...",
  restaurantId: "vendor1",
  userOrderId: "...",
  items: [...],
  commission: 500,
  vendorTotal: 4500
}
```

---

### Correct Flow

**Step 1: After initializePayment**
```
Order Collection:
{
  _id: "...",
  orderId: "ORD-ABC123",
  userId: "user123",
  paymentStatus: "pending",  ✅ Created as "pending"
  orderStatus: "pending",
  paymentReference: "PSK_ORD-ABC123_1234567890",
  items: [...],
  total: 7700
}

VendorOrder Collection:
[EMPTY] ✅ Not created yet (waiting for payment)
```

**Step 2: After verifyPayment (SUCCESS)**
```
Order Collection:
{
  _id: "...",
  orderId: "ORD-ABC123",
  userId: "user123",
  paymentStatus: "paid",  ✅ Updated from "pending"
  orderStatus: "accepted",  ✅ Updated
  paymentReference: "PSK_ORD-ABC123_1234567890",
  items: [...],
  total: 7700
}

VendorOrder Collection:
{
  _id: "...",
  restaurantId: "vendor1",
  userOrderId: "...",
  items: [...],
  commission: 500,
  vendorTotal: 4500,
  orderStatus: "pending"
}
```

**Step 2: After verifyPayment (FAILED)**
```
Order Collection:
{
  _id: "...",
  orderId: "ORD-ABC123",
  userId: "user123",
  paymentStatus: "failed",  ✅ Updated from "pending"
  orderStatus: "failed",  ✅ Updated
  paymentReference: "PSK_ORD-ABC123_1234567890",
  items: [...],
  total: 7700
}

VendorOrder Collection:
[EMPTY] ✅ Not created (payment failed)
```

---

## 🔍 Edge Cases Comparison

### Scenario 1: User Abandons Payment

**Current Flow:**
```
PendingOrder exists → User abandons → PendingOrder remains in DB
❌ No Order record
❌ Can't see abandoned carts
❌ No retry mechanism
```

**Correct Flow:**
```
Order exists (pending) → User abandons → Order remains (pending)
✅ Order record exists
✅ Can see abandoned carts
✅ Can send reminder emails
✅ Can retry payment
```

---

### Scenario 2: Payment Fails

**Current Flow:**
```
PendingOrder exists → Payment fails → No Order created
❌ No audit trail
❌ Can't debug issues
❌ User has to start over
```

**Correct Flow:**
```
Order exists (pending) → Payment fails → Order updated (failed)
✅ Full audit trail
✅ Can debug issues
✅ Can retry payment
✅ Better UX
```

---

### Scenario 3: Stock Runs Out

**Current Flow:**
```
User pays → Stock validated → Out of stock → Refund required
❌ User paid but can't get order
❌ Refund process needed
❌ Bad UX
```

**Correct Flow:**
```
Stock validated → Out of stock → Payment not initialized
✅ User not charged
✅ No refund needed
✅ Better UX
```

---

### Scenario 4: Duplicate Verification

**Current Flow:**
```
First verify → Order created
Second verify → Check if exists → Return existing
✅ Idempotency works
⚠️ But VendorOrders might duplicate
```

**Correct Flow:**
```
First verify → Order updated → VendorOrders created
Second verify → Check if paid → Return existing
✅ Idempotency guaranteed
✅ VendorOrders never duplicate
```

---

## 📈 Metrics Comparison

| Metric | Current Flow | Correct Flow |
|--------|--------------|--------------|
| Order exists before payment | ❌ No | ✅ Yes |
| Failed payment audit trail | ❌ No | ✅ Yes |
| Abandoned cart tracking | ❌ No | ✅ Yes |
| Stock validation timing | ❌ After payment | ✅ Before payment |
| Payment retry capability | ❌ No | ✅ Yes |
| Orphaned payment risk | ⚠️ High | ✅ Low |
| Database complexity | ⚠️ 2 tables (Order + PendingOrder) | ✅ 1 table (Order) |
| Industry standard compliance | ❌ No | ✅ Yes |

---

## 🎯 Summary

### Current Flow Issues
1. ❌ Order created AFTER payment
2. ❌ No order reference during payment
3. ❌ No audit trail for failed payments
4. ❌ Stock validated too late
5. ❌ Complex (PendingOrder + Order)

### Correct Flow Benefits
1. ✅ Order created BEFORE payment
2. ✅ Order reference available immediately
3. ✅ Full audit trail for all payments
4. ✅ Stock validated before payment
5. ✅ Simpler (just Order)

---

**For implementation details, see:**
- `ORDER_FLOW_REFACTORING_PLAN.md`

**For complete audit, see:**
- `ORDER_FLOW_AUDIT_REPORT.md`

---

**Diagrams Version:** 1.0  
**Date:** 2026-01-26  
**Author:** Backend AI Assistant
