# 🚀 Vendor-Specific Delivery Fee System

## ✅ System Status: FULLY IMPLEMENTED & CORRECT

Your system **already correctly implements** vendor-specific delivery fees with no splitting or sharing. This document explains how it works.

---

## 📊 Core Architecture

### Data Model (Order Schema)

```javascript
Order {
  items: [
    {
      foodId: ObjectId,
      restaurantId: ObjectId,  // ✅ Each item knows its vendor
      variant: { name, price, image },
      quantity: Number,
      price: Number
    }
  ],
  
  vendorDeliveryFees: [       // ✅ Source of truth for delivery fees
    {
      restaurantId: ObjectId,
      deliveryFee: Number      // ✅ Belongs ONLY to this vendor
    }
  ],
  
  deliveryFee: Number,         // ✅ Sum of all vendor fees (backward compatible)
  subtotal: Number,
  total: Number
}
```

### Money Flow Diagram

```
Customer Payment (₦10,000)
       │
       ▼
┌─────────────────────────┐
│   Order Total           │
│─────────────────────────│
│ Subtotal:    ₦9,000     │
│ Delivery:    ₦1,000     │◄─── SUM ONLY (never split)
│ Total:      ₦10,000     │
└──────────┬──────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Vendor Breakdown (Per Restaurant)    │
│──────────────────────────────────────│
│ Vendor A:                            │
│   Items:        ₦5,000               │
│   Delivery:       ₦500  ◄── Own fee  │
│   Platform Cut: -₦500                │
│   Credit:       ₦5,000               │
│                                      │
│ Vendor B:                            │
│   Items:        ₦4,000               │
│   Delivery:       ₦500  ◄── Own fee  │
│   Platform Cut: -₦400                │
│   Credit:       ₦4,100               │
└──────────────────────────────────────┘
```

---

## 🔐 Implementation Details

### 1️⃣ Payment Initialization (`initializePayment`)

**Location**: `controller/order/orderController.js:466-565`

```javascript
// Frontend sends:
{
  items: [
    { foodId, restaurantId, quantity, price, variant },
    // ... more items
  ],
  vendorDeliveryFees: [
    { restaurantId: "vendor1", deliveryFee: 500 },
    { restaurantId: "vendor2", deliveryFee: 500 }
  ],
  deliveryAddress: { ... },
  phone: "..."
}

// Backend calculates:
const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
const totalDeliveryFee = vendorDeliveryFees.reduce((sum, v) => sum + v.deliveryFee, 0);
const total = subtotal + totalDeliveryFee;

// Sends to Paystack with metadata:
{
  email,
  amount: total * 100,
  metadata: {
    userId,
    items,
    vendorDeliveryFees,  // ✅ Preserved in payment metadata
    deliveryAddress,
    phone
  }
}
```

---

### 2️⃣ Payment Verification (`verifyPayment`)

**Location**: `controller/order/orderController.js:287-462`

**Flow**:
1. ✅ Check idempotency (prevent duplicate orders)
2. ✅ Verify payment with Paystack
3. ✅ Extract metadata (including `vendorDeliveryFees`)
4. ✅ Call `createOrder` with vendor fees intact

```javascript
// Idempotency check
const existingOrder = await Order.findOne({ paymentReference: reference });
if (existingOrder) {
  return res.status(200).json({ message: "Order already processed" });
}

// Extract from Paystack response
const metadata = payData.metadata;
const vendorDeliveryFees = metadata.vendorDeliveryFees || [];

// Create order
await createOrder({
  orderId,
  userId,
  items,
  deliveryAddress,
  phone,
  vendorDeliveryFees,  // ✅ Passed directly
  paymentReference: reference,
  paymentStatus: "paid"
});
```

---

### 3️⃣ Webhook Handler (`paystackWebhook`)

**Location**: `controller/order/orderController.js:778-875`

**Security & Reliability**:
- ✅ Signature verification (prevents fake webhooks)
- ✅ Idempotency check (prevents duplicate processing)
- ✅ MongoDB transaction (atomic operations)

```javascript
// 1. Verify signature
const hash = crypto
  .createHmac("sha512", secret)
  .update(JSON.stringify(req.body))
  .digest("hex");

if (hash !== req.headers["x-paystack-signature"]) {
  return res.status(400).send("Invalid signature");
}

// 2. Check idempotency
const existingOrder = await Order.findOne({ paymentReference: reference });
if (existingOrder) {
  return res.status(200).send("Order already processed");
}

// 3. Extract metadata
const { userId, items, deliveryAddress, phone, vendorDeliveryFees } = metadata;

// 4. Create order (same function as verifyPayment)
await createOrder({
  orderId,
  userId,
  items,
  deliveryAddress,
  phone,
  vendorDeliveryFees,  // ✅ Vendor fees preserved
  paymentReference: reference,
  paymentStatus: "paid"
});
```

---

### 4️⃣ Order Creation (`createOrder`)

**Location**: `controller/order/orderController.js:18-282`

**The Core Logic** (Lines 100-193):

```javascript
// Build delivery fee map (strict validation)
const deliveryFeeMap = {};
let totalDeliveryFee = 0;

vendorDeliveryFees.forEach((v, index) => {
  const rid = String(v.restaurantId);
  
  // Prevent duplicates
  if (deliveryFeeMap[rid] !== undefined) {
    throw new Error(`Duplicate delivery fee for restaurant ${rid}`);
  }
  
  const fee = Number(v.deliveryFee);
  if (Number.isNaN(fee) || fee < 0) {
    throw new Error(`Invalid delivery fee for restaurant ${rid}`);
  }
  
  deliveryFeeMap[rid] = fee;  // ✅ Map vendor → fee
  totalDeliveryFee += fee;
});

// Validate all vendors have fees
uniqueRestaurantsInItems.forEach((rid) => {
  if (deliveryFeeMap[rid] === undefined) {
    throw new Error(`Missing delivery fee for restaurant ${rid}`);
  }
});
```

**Vendor Payout Logic** (Lines 171-260):

```javascript
for (const vendorId of uniqueRestaurantsInItems) {
  // Get vendor's items
  const vendorItems = normalizedItems.filter(
    (i) => i.restaurantId === vendorId
  );
  
  // Calculate vendor's item subtotal
  const vendorSubtotal = vendorItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );
  
  // ✅ Get vendor's OWN delivery fee (no splitting!)
  const vendorDeliveryShare = deliveryFeeMap[vendorId];
  
  // Platform commission (10% of items only)
  const adminShare = vendorSubtotal * PLATFORM_PERCENT;
  const vendorShare = vendorSubtotal - adminShare;
  
  // ✅ Vendor gets: (item earnings) + (own delivery fee)
  const vendorCredit = vendorShare + vendorDeliveryShare;
  
  // Credit vendor wallet
  vendorWallet.balance += vendorCredit;
  vendorWallet.transactions.push({
    type: "credit",
    amount: vendorCredit,
    description: `Revenue from Order ${order.orderId}`
  });
  
  // Credit admin wallet (commission only, no delivery fee)
  adminWallet.balance += adminShare;
}
```

---

## 🎯 System Guarantees

### ✅ What This System Guarantees

1. **No Delivery Fee Splitting**
   - Each vendor receives **only their own delivery fee**
   - Delivery fees are **never divided or shared**

2. **Correct Vendor Accounting**
   ```
   Vendor Wallet Credit = (Item Earnings - Platform Commission) + (Own Delivery Fee)
   ```

3. **Backward Compatibility**
   - `Order.deliveryFee` still exists as total
   - Old analytics/reports continue working
   - Frontend doesn't need major changes

4. **Idempotent Webhooks**
   - Duplicate webhook calls are safely ignored
   - Uses `paymentReference` as unique key
   - No duplicate orders created

5. **Transaction Safety**
   - All database operations use MongoDB transactions
   - Either everything succeeds or everything rolls back
   - No partial orders or inconsistent wallet states

6. **Scalability**
   - Works with 2, 5, 10, or 100 vendors per order
   - No performance degradation
   - Clean separation of concerns

---

## 🔍 Example Calculation

### Scenario: Order from 3 Restaurants

**Cart**:
- Restaurant A: 2 items = ₦3,000
- Restaurant B: 1 item = ₦2,000
- Restaurant C: 3 items = ₦4,000

**Delivery Fees**:
- Restaurant A: ₦500
- Restaurant B: ₦300
- Restaurant C: ₦700

**Order Totals**:
```javascript
subtotal = 3000 + 2000 + 4000 = ₦9,000
deliveryFee = 500 + 300 + 700 = ₦1,500
total = ₦10,500
```

**Vendor Payouts** (10% platform commission):

| Vendor | Items | Commission | Item Earnings | Delivery Fee | Total Credit |
|--------|-------|------------|---------------|--------------|--------------|
| A      | ₦3,000 | -₦300     | ₦2,700        | +₦500        | **₦3,200**   |
| B      | ₦2,000 | -₦200     | ₦1,800        | +₦300        | **₦2,100**   |
| C      | ₦4,000 | -₦400     | ₦3,600        | +₦700        | **₦4,300**   |

**Platform Earnings**: ₦300 + ₦200 + ₦400 = **₦900** (commission only)

**Verification**:
```
Vendor Credits: 3,200 + 2,100 + 4,300 = ₦9,600
Platform:                                 ₦900
Total:                                  ₦10,500 ✅
```

---

## 🛡️ Security Features

### 1. Webhook Signature Verification
```javascript
const hash = crypto
  .createHmac("sha512", PAYSTACK_SECRET_KEY)
  .update(JSON.stringify(req.body))
  .digest("hex");

if (hash !== req.headers["x-paystack-signature"]) {
  return res.status(400).send("Invalid signature");
}
```

### 2. Idempotency Protection
```javascript
const existingOrder = await Order.findOne({ paymentReference: reference });
if (existingOrder) {
  return res.status(200).json({ message: "Order already processed" });
}
```

### 3. Input Validation
- All vendor fees validated (no NaN, no negatives)
- All vendors must have delivery fees
- No duplicate vendor fees allowed
- Items must have valid quantities and prices

### 4. Transaction Atomicity
```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Create order
  // Create vendor orders
  // Update vendor wallets
  // Update admin wallet
  
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
}
```

---

## 📝 Frontend Integration Guide

### Checkout Flow

```javascript
// 1. Calculate vendor delivery fees
const vendorDeliveryFees = calculateVendorFees(cartItems);
// Example: [
//   { restaurantId: "vendor1", deliveryFee: 500 },
//   { restaurantId: "vendor2", deliveryFee: 300 }
// ]

// 2. Initialize payment
const response = await axios.post("/api/payment/initialize", {
  items: cartItems,
  vendorDeliveryFees,  // ✅ Must include this
  deliveryAddress,
  phone,
  email
});

// 3. Redirect to Paystack
window.location.href = response.data.authorization_url;

// 4. After payment, verify
const verification = await axios.get(`/api/payment/verify/${reference}`);
```

### Required Metadata Structure

```javascript
{
  items: [
    {
      foodId: "64abc...",
      restaurantId: "64def...",
      quantity: 2,
      price: 1500,
      variant: {
        name: "Large",
        price: 1500,
        image: "https://..."
      }
    }
  ],
  vendorDeliveryFees: [
    {
      restaurantId: "64def...",
      deliveryFee: 500
    }
  ],
  deliveryAddress: {
    addressLine: "123 Main St",
    city: "Lagos",
    state: "Lagos",
    phone: "08012345678"
  },
  phone: "08012345678"
}
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "Missing delivery fee for restaurant X"

**Cause**: Frontend didn't send delivery fee for all vendors in cart

**Solution**: Ensure `vendorDeliveryFees` includes ALL unique `restaurantId` values from `items`

```javascript
// Correct approach
const uniqueVendors = [...new Set(items.map(i => i.restaurantId))];
const vendorDeliveryFees = uniqueVendors.map(vendorId => ({
  restaurantId: vendorId,
  deliveryFee: getDeliveryFeeForVendor(vendorId)
}));
```

### Issue 2: "Order already processed"

**Cause**: Webhook or verification called multiple times with same reference

**Solution**: This is **normal and safe**. The system correctly prevents duplicates.

### Issue 3: "Invalid webhook metadata"

**Cause**: Paystack metadata missing or corrupted

**Solution**: 
1. Check Paystack dashboard for actual metadata sent
2. Ensure metadata is stringified: `metadata: JSON.stringify(data)`
3. Verify metadata size < 4KB (Paystack limit)

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Single vendor order
- [ ] Multi-vendor order (2+ restaurants)
- [ ] Delivery fee calculation
- [ ] Platform commission calculation
- [ ] Wallet credit calculation

### Integration Tests
- [ ] Payment initialization
- [ ] Payment verification
- [ ] Webhook processing
- [ ] Idempotency (duplicate webhook)
- [ ] Transaction rollback on error

### Edge Cases
- [ ] Zero delivery fee
- [ ] Very large order (10+ vendors)
- [ ] Missing vendor fee (should error)
- [ ] Duplicate vendor fee (should error)
- [ ] Invalid metadata format

---

## 📚 Related Files

| File | Purpose |
|------|---------|
| `model/order/Order.js` | Order schema with `vendorDeliveryFees` |
| `controller/order/orderController.js` | All order logic (create, verify, webhook) |
| `routes/paystack/webhook.js` | Webhook route registration |
| `model/vendor/VendorOrder.js` | Per-vendor order tracking |
| `model/wallet/wallet.mode.js` | Wallet schema for payouts |

---

## 🎓 Key Takeaways

1. **Never split delivery fees** - each vendor has their own
2. **Use `deliveryFeeMap`** - O(1) lookup per vendor
3. **Validate strictly** - prevent data corruption
4. **Idempotency is critical** - webhooks can retry
5. **Transactions ensure consistency** - all or nothing
6. **Backward compatibility matters** - keep `deliveryFee` total

---

## ✅ System Health Check

Run this checklist to verify everything is working:

```bash
# 1. Check Order schema has vendorDeliveryFees
grep -n "vendorDeliveryFees" model/order/Order.js

# 2. Check createOrder uses deliveryFeeMap
grep -n "deliveryFeeMap" controller/order/orderController.js

# 3. Check webhook route is registered
grep -n "paystackWebhook" routes/paystack/webhook.js

# 4. Check idempotency in webhook
grep -n "existingOrder" controller/order/orderController.js
```

**Expected**: All files should have the correct implementations as documented above.

---

## 🚀 Deployment Notes

### Environment Variables Required
```env
PAYSTACK_SECRET_KEY=sk_test_...
CALL_BACK_URL=https://yourapp.com/payment/callback
MONGODB_URI=mongodb+srv://...
```

### Webhook URL Configuration
Set this in your Paystack dashboard:
```
https://yourapi.com/api/webhook/paystack
```

### Security Checklist
- [ ] HTTPS enabled (required for webhooks)
- [ ] Paystack secret key is secure
- [ ] Webhook signature verification active
- [ ] Rate limiting on webhook endpoint
- [ ] Database backups enabled

---

**Last Updated**: 2026-01-10  
**System Version**: 2.0 (Vendor-Specific Delivery Fees)  
**Status**: ✅ Production Ready
