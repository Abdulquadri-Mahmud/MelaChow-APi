# Order Flow Refactoring - Implementation Plan

**Date:** 2026-01-26  
**Status:** Ready for Implementation  
**Priority:** HIGH  
**Breaking Changes:** None (if done correctly)

---

## 🎯 Objective

Refactor the order creation flow to follow industry standards:
- ✅ Create Order **BEFORE** payment verification
- ✅ Update Order **AFTER** payment verification
- ✅ Maintain backward compatibility
- ✅ No breaking changes to existing APIs

---

## 📋 Implementation Steps

### Step 1: Create Helper Function for Order Updates

**File:** `controller/order/createOrderV2.controller.js`

**Add new function:**

```javascript
/**
 * ========================================
 * UPDATE ORDER AFTER PAYMENT VERIFICATION
 * ========================================
 * Updates an existing pending order after payment is verified
 */
export const updateOrderAfterPayment = async (orderId, paymentReference) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Find existing order
    const order = await Order.findOne({ 
      $or: [
        { _id: orderId },
        { orderId: orderId },
        { paymentReference: paymentReference }
      ]
    }).session(session);

    if (!order) {
      throw new Error("Order not found");
    }

    // 2. Check if already processed (idempotency)
    if (order.paymentStatus === "paid") {
      console.log(`⚠️ Order ${order.orderId} already paid. Skipping.`);
      await session.commitTransaction();
      session.endSession();
      return order;
    }

    // 3. Update order status
    order.paymentStatus = "paid";
    order.orderStatus = "accepted";
    await order.save({ session });

    // 4. Create VendorOrders and update wallets
    await createVendorOrdersAndUpdateWallets(order, session);

    await session.commitTransaction();
    session.endSession();

    console.log(`✅ Order ${order.orderId} updated to paid`);
    return order;

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("❌ updateOrderAfterPayment failed:", error.message);
    throw error;
  }
};

/**
 * ========================================
 * CREATE VENDOR ORDERS AND UPDATE WALLETS
 * ========================================
 * Extracted from createOrderV2 for reusability
 */
const createVendorOrdersAndUpdateWallets = async (order, session) => {
  const PLATFORM_COMMISSION = 0.1; // 10%

  // Group items by vendor
  const vendorItemsMap = {};
  order.items.forEach(item => {
    const vendorId = String(item.restaurantId);
    if (!vendorItemsMap[vendorId]) {
      vendorItemsMap[vendorId] = [];
    }
    vendorItemsMap[vendorId].push(item);
  });

  // Map delivery fees
  const deliveryFeeMap = {};
  order.vendorDeliveryFees.forEach(v => {
    deliveryFeeMap[String(v.restaurantId)] = v.deliveryFee;
  });

  const vendorIds = Object.keys(vendorItemsMap);

  // Process each vendor
  for (const vendorId of vendorIds) {
    const vendorItems = vendorItemsMap[vendorId];
    const vendorSubtotal = vendorItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const vendorDeliveryShare = deliveryFeeMap[vendorId] || 0;
    const commission = Number((vendorSubtotal * PLATFORM_COMMISSION).toFixed(2));
    const vendorTotal = Number((vendorSubtotal - commission).toFixed(2));

    // Check if VendorOrder already exists (idempotency)
    const existingVendorOrder = await VendorOrder.findOne({
      restaurantId: vendorId,
      userOrderId: order._id
    }).session(session);

    if (existingVendorOrder) {
      console.log(`⚠️ VendorOrder already exists for vendor ${vendorId}, order ${order.orderId}`);
      continue;
    }

    // Create VendorOrder
    const [vendorOrder] = await VendorOrder.create(
      [
        {
          restaurantId: vendorId,
          userOrderId: order._id,
          items: vendorItems.map(item => ({
            foodId: item.foodId,
            variant: item.variant,
            quantity: item.quantity,
            originalPrice: item.price,
            vendorEarning: Number((item.price * (1 - PLATFORM_COMMISSION)).toFixed(2)),
            metadata: item.metadata
          })),
          commission,
          vendorTotal,
          deliveryShare: vendorDeliveryShare,
          orderStatus: "pending"
        }
      ],
      { session }
    );

    // Update vendor stats
    await Vendor.findByIdAndUpdate(
      vendorId,
      {
        $push: { vendorOrders: vendorOrder._id },
        $inc: {
          totalOrders: 1,
          totalSales: vendorSubtotal
        }
      },
      { session }
    );

    // Update vendor wallet
    let vendorWallet = await Wallet.findOne({
      ownerId: vendorId,
      ownerModel: "Vendor"
    }).session(session);

    if (!vendorWallet) {
      [vendorWallet] = await Wallet.create(
        [{ ownerId: vendorId, ownerModel: "Vendor", balance: 0 }],
        { session }
      );
    }

    const vendorCredit = Number((vendorTotal + vendorDeliveryShare).toFixed(2));
    vendorWallet.balance = Number((vendorWallet.balance + vendorCredit).toFixed(2));
    vendorWallet.transactions.push({
      type: "credit",
      amount: vendorCredit,
      description: `Revenue from Order ${order.orderId}`
    });

    await vendorWallet.save({ session });
  }

  // Update admin wallet
  const totalCommission = vendorIds.reduce((sum, vendorId) => {
    const vendorSubtotal = vendorItemsMap[vendorId].reduce(
      (s, item) => s + item.price * item.quantity,
      0
    );
    return sum + vendorSubtotal * PLATFORM_COMMISSION;
  }, 0);

  let adminWallet = await Wallet.findOne({
    ownerModel: "Admin"
  }).session(session);

  if (!adminWallet) {
    const adminUser = await Admin.findOne().session(session);
    if (adminUser) {
      [adminWallet] = await Wallet.create(
        [{ ownerId: adminUser._id, ownerModel: "Admin", balance: 0 }],
        { session }
      );
    }
  }

  if (adminWallet) {
    adminWallet.balance = Number(
      (adminWallet.balance + totalCommission).toFixed(2)
    );
    adminWallet.transactions.push({
      type: "credit",
      amount: Number(totalCommission.toFixed(2)),
      description: `Commission from Order ${order.orderId}`
    });
    await adminWallet.save({ session });
  }
};
```

---

### Step 2: Refactor `createOrderV2`

**File:** `controller/order/createOrderV2.controller.js`

**Changes:**

```javascript
export const createOrderV2 = async ({
  userId,
  items,
  vendorDeliveryFees,
  deliveryAddress,
  phone,
  paymentReference = null,
  paymentStatus = "pending",  // Default to "pending"
  orderId = null
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ... validation and normalization (keep existing) ... */

    /* ========================================
     * 5️⃣ CREATE ORDER (ALWAYS PENDING FIRST)
     * ======================================== */
    const finalOrderId = orderId || generateOrderId();

    const [order] = await Order.create(
      [
        {
          orderId: finalOrderId,
          userId,
          items: normalizedItems,
          vendorDeliveryFees,
          deliveryAddress,
          phone,
          subtotal: Number(subtotal.toFixed(2)),
          deliveryFee: Number(totalDeliveryFee.toFixed(2)),
          total,
          paymentReference,
          paymentStatus: "pending",  // ✅ ALWAYS create as pending
          orderStatus: "pending"
        }
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    console.log(`✅ Order created successfully: ${finalOrderId}`);
    return order;

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("❌ CreateOrderV2 failed:", error.message);
    throw error;
  }
};
```

**Key Changes:**
- ❌ Remove `if (paymentStatus === "paid")` block
- ❌ Remove VendorOrder creation from this function
- ✅ Always create order with `paymentStatus: "pending"`
- ✅ VendorOrders will be created in `updateOrderAfterPayment`

---

### Step 3: Refactor `initializePayment`

**File:** `controller/order/orderController.js`

**Replace entire function:**

```javascript
/**
 * ========================================
 * INITIALIZE PAYMENT (CORRECT FLOW)
 * ========================================
 * 1. Create Order with pending status
 * 2. Initialize Paystack payment
 * 3. Update Order with payment reference
 */
export const initializePayment = async (req, res) => {
  try {
    const { items, deliveryAddress, phone, email, vendorDeliveryFees } = req.body;
    const userId = req.userId;

    // Validation
    if (!items?.length)
      return res.status(400).json({ message: "Cart is empty" });
    if (!vendorDeliveryFees?.length)
      return res.status(400).json({ message: "vendorDeliveryFees is required" });
    if (!email)
      return res.status(400).json({ message: "Email is required" });

    /* ========================================
     * 1️⃣ CREATE ORDER (PENDING STATUS)
     * ======================================== */
    const order = await createOrderV2({
      userId,
      items,
      vendorDeliveryFees,
      deliveryAddress,
      phone: phone || deliveryAddress?.phone,
      paymentStatus: "pending",
      orderStatus: "pending"
    });

    console.log(`✅ Order created: ${order.orderId} (pending payment)`);

    /* ========================================
     * 2️⃣ GENERATE PAYMENT REFERENCE
     * ======================================== */
    const reference = `PSK_${order.orderId}_${Date.now()}`;

    /* ========================================
     * 3️⃣ UPDATE ORDER WITH REFERENCE
     * ======================================== */
    order.paymentReference = reference;
    await order.save();

    console.log(`✅ Payment reference assigned: ${reference}`);

    /* ========================================
     * 4️⃣ INITIALIZE PAYSTACK
     * ======================================== */
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(order.total * 100),
        reference,
        callback_url: process.env.CALL_BACK_URL,
        metadata: {
          orderId: order.orderId,
          userId: String(userId)
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data?.data;
    if (!data)
      return res.status(500).json({ message: "Failed to initialize payment" });

    console.log(`🚀 Paystack initialized for Order ${order.orderId}`);

    return res.json({
      authorization_url: data.authorization_url,
      reference: data.reference,
      orderId: order.orderId,  // ✅ Return orderId for frontend tracking
      total: data.amount / 100,
    });

  } catch (err) {
    console.error("Paystack initialize error:", err.response?.data || err.message);
    return res.status(500).json({
      message: "Failed to initialize payment",
      error: err.message
    });
  }
};
```

**Key Changes:**
- ✅ Create Order BEFORE Paystack initialization
- ✅ Use `orderId` in payment reference
- ✅ Update Order with payment reference
- ❌ Remove PendingOrder creation
- ✅ Return `orderId` to frontend

---

### Step 4: Refactor `verifyPayment`

**File:** `controller/order/orderController.js`

**Replace entire function:**

```javascript
/**
 * ========================================
 * VERIFY PAYMENT (CORRECT FLOW)
 * ========================================
 * 1. Find existing Order by reference
 * 2. Verify payment with Paystack
 * 3. Update Order status
 * 4. Create VendorOrders and update wallets
 */
export const verifyPayment = async (req, res) => {
  const { reference } = req.params;

  console.log(`🔍 Received verification request for reference: ${reference}`);

  if (!reference)
    return res.status(400).json({ message: "Reference is required" });

  try {
    /* ========================================
     * 1️⃣ FIND EXISTING ORDER
     * ======================================== */
    const order = await Order.findOne({ paymentReference: reference });

    if (!order) {
      console.error("❌ Order not found for reference:", reference);
      return res.status(404).json({
        message: "Order not found. Please contact support.",
        debug: "ORDER_NOT_FOUND"
      });
    }

    /* ========================================
     * 2️⃣ IDEMPOTENCY CHECK
     * ======================================== */
    if (order.paymentStatus === "paid") {
      console.log(`⚠️ Order ${order.orderId} already paid`);
      return res.status(200).json({
        message: "Order already processed",
        order,
      });
    }

    /* ========================================
     * 3️⃣ VERIFY WITH PAYSTACK
     * ======================================== */
    const verifyResp = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const payData = verifyResp.data?.data;

    if (!payData || payData.status !== "success") {
      // Payment failed - update order
      order.paymentStatus = "failed";
      order.orderStatus = "failed";
      await order.save();

      console.error(`❌ Payment failed for Order ${order.orderId}`);
      return res.status(400).json({
        message: "Payment not successful",
        order
      });
    }

    /* ========================================
     * 4️⃣ UPDATE ORDER AND CREATE VENDOR ORDERS
     * ======================================== */
    const updatedOrder = await updateOrderAfterPayment(order._id, reference);

    console.log(`✅ Payment verified and Order ${updatedOrder.orderId} updated`);

    return res.status(200).json({
      message: "Payment verified and order confirmed",
      order: updatedOrder,
      paystack: {
        reference: payData.reference,
        paid_at: payData.paid_at,
      },
    });

  } catch (err) {
    console.error("Verify Payment Error:", err.message);
    return res.status(500).json({
      message: "Payment verification failed",
      error: err.message,
    });
  }
};
```

**Key Changes:**
- ✅ Find existing Order (not create new)
- ✅ Handle failed payments (update order status)
- ✅ Use `updateOrderAfterPayment` helper
- ✅ Idempotency check
- ❌ Remove PendingOrder logic

---

### Step 5: Refactor `verifyPaymentV2`

**File:** `controller/order/orderController.js`

**Replace entire function:**

```javascript
/**
 * ========================================
 * VERIFY PAYMENT V2 (CORRECT FLOW)
 * ========================================
 * Same as verifyPayment but with enhanced logging
 */
export const verifyPaymentV2 = async (req, res) => {
  const { reference } = req.params;

  console.log(`🔍 [V2] Received verification request for reference: ${reference}`);

  if (!reference)
    return res.status(400).json({ message: "Reference is required" });

  try {
    /* ========================================
     * 1️⃣ FIND EXISTING ORDER
     * ======================================== */
    const order = await Order.findOne({ paymentReference: reference });

    if (!order) {
      console.error("❌ [V2] Order not found for reference:", reference);
      return res.status(404).json({
        success: false,
        message: "Order not found. Please contact support.",
        debug: "ORDER_NOT_FOUND"
      });
    }

    /* ========================================
     * 2️⃣ IDEMPOTENCY CHECK
     * ======================================== */
    if (order.paymentStatus === "paid") {
      console.log(`⚠️ [V2] Order ${order.orderId} already paid`);
      return res.status(200).json({
        success: true,
        message: "Order already processed",
        order,
      });
    }

    /* ========================================
     * 3️⃣ VERIFY WITH PAYSTACK
     * ======================================== */
    const verifyResp = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const payData = verifyResp.data?.data;

    if (!payData || payData.status !== "success") {
      // Payment failed - update order
      order.paymentStatus = "failed";
      order.orderStatus = "failed";
      await order.save();

      console.error(`❌ [V2] Payment failed for Order ${order.orderId}`);
      return res.status(400).json({
        success: false,
        message: "Payment not successful",
        order
      });
    }

    /* ========================================
     * 4️⃣ UPDATE ORDER AND CREATE VENDOR ORDERS
     * ======================================== */
    const updatedOrder = await updateOrderAfterPayment(order._id, reference);

    console.log(`✅ [V2] Payment verified and Order ${updatedOrder.orderId} updated`);

    return res.status(200).json({
      success: true,
      message: "Payment verified and order confirmed",
      order: updatedOrder,
      paystack: {
        reference: payData.reference,
        paid_at: payData.paid_at,
        amount: payData.amount / 100
      },
    });

  } catch (err) {
    console.error("❌ [V2] Verify Payment Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: err.message,
    });
  }
};
```

---

### Step 6: Update Exports

**File:** `controller/order/createOrderV2.controller.js`

**Add to exports:**

```javascript
export {
  createOrderV2,
  createOrderController,
  generateOrderId,
  updateOrderAfterPayment  // ✅ New export
};
```

**File:** `controller/order/orderController.js`

**Update imports:**

```javascript
import {
  createOrderV2,
  updateOrderAfterPayment  // ✅ New import
} from "./createOrderV2.controller.js";
```

---

## 🧪 Testing Plan

### Unit Tests

```javascript
// Test 1: Order created with pending status
test("initializePayment creates order with pending status", async () => {
  const response = await request(app)
    .post("/api/orders/create")
    .send({ items, deliveryAddress, phone, email, vendorDeliveryFees });

  expect(response.body.orderId).toBeDefined();
  
  const order = await Order.findOne({ orderId: response.body.orderId });
  expect(order.paymentStatus).toBe("pending");
  expect(order.orderStatus).toBe("pending");
  expect(order.paymentReference).toBeDefined();
});

// Test 2: Payment verification updates existing order
test("verifyPayment updates existing order", async () => {
  // Create order
  const initResponse = await request(app)
    .post("/api/orders/create")
    .send({ items, deliveryAddress, phone, email, vendorDeliveryFees });

  const reference = initResponse.body.reference;

  // Mock Paystack verification
  mockPaystackVerify(reference, "success");

  // Verify payment
  const verifyResponse = await request(app)
    .post(`/api/orders/verify/${reference}`);

  expect(verifyResponse.body.order.paymentStatus).toBe("paid");
  expect(verifyResponse.body.order.orderStatus).toBe("accepted");
});

// Test 3: Failed payment updates order
test("failed payment updates order status", async () => {
  const initResponse = await request(app)
    .post("/api/orders/create")
    .send({ items, deliveryAddress, phone, email, vendorDeliveryFees });

  const reference = initResponse.body.reference;

  // Mock Paystack verification (failed)
  mockPaystackVerify(reference, "failed");

  const verifyResponse = await request(app)
    .post(`/api/orders/verify/${reference}`);

  const order = await Order.findOne({ paymentReference: reference });
  expect(order.paymentStatus).toBe("failed");
  expect(order.orderStatus).toBe("failed");
});

// Test 4: Idempotency - duplicate verification
test("duplicate verification returns existing order", async () => {
  const initResponse = await request(app)
    .post("/api/orders/create")
    .send({ items, deliveryAddress, phone, email, vendorDeliveryFees });

  const reference = initResponse.body.reference;
  mockPaystackVerify(reference, "success");

  // First verification
  await request(app).post(`/api/orders/verify/${reference}`);

  // Second verification (duplicate)
  const verifyResponse = await request(app)
    .post(`/api/orders/verify/${reference}`);

  expect(verifyResponse.body.message).toContain("already processed");
  
  // Ensure VendorOrders not duplicated
  const vendorOrders = await VendorOrder.find({ userOrderId: verifyResponse.body.order._id });
  expect(vendorOrders.length).toBe(1); // Only one, not two
});
```

---

## 🔄 Migration Strategy

### Phase 1: Deploy New Code (Non-Breaking)

1. Deploy refactored code to staging
2. Test all flows thoroughly
3. Monitor for errors
4. Deploy to production

**Impact:** None - existing orders continue to work

---

### Phase 2: Monitor Production

1. Monitor order creation success rate
2. Check for failed payments
3. Verify VendorOrder creation
4. Ensure wallets update correctly

**Duration:** 1-2 weeks

---

### Phase 3: Clean Up (Optional)

1. Remove PendingOrder model (if no longer used)
2. Remove old V1 `createOrder` function
3. Consolidate V1 and V2 endpoints

**Impact:** Breaking change - requires frontend update

---

## ✅ Checklist

### Code Changes
- [ ] Add `updateOrderAfterPayment` function
- [ ] Add `createVendorOrdersAndUpdateWallets` function
- [ ] Refactor `createOrderV2` (remove VendorOrder creation)
- [ ] Refactor `initializePayment` (create order first)
- [ ] Refactor `verifyPayment` (update existing order)
- [ ] Refactor `verifyPaymentV2` (update existing order)
- [ ] Update exports and imports

### Testing
- [ ] Unit tests for order creation
- [ ] Unit tests for payment verification
- [ ] Unit tests for failed payments
- [ ] Unit tests for idempotency
- [ ] Integration tests for full flow
- [ ] Edge case tests

### Documentation
- [ ] Update API documentation
- [ ] Update ORDER_CREATION_V2.md
- [ ] Add migration notes
- [ ] Update frontend integration guide

### Deployment
- [ ] Deploy to staging
- [ ] Test in staging
- [ ] Deploy to production
- [ ] Monitor production

---

## 🚨 Rollback Plan

If issues arise after deployment:

1. **Immediate Rollback:**
   - Revert to previous code version
   - Orders created during new flow will remain (safe)
   - No data loss

2. **Partial Rollback:**
   - Keep new code but disable V2 endpoints
   - Route all traffic to V1 endpoints
   - Investigate and fix issues

3. **Data Cleanup:**
   - Identify orders stuck in "pending" status
   - Manually verify and update if needed
   - Contact users for failed payments

---

## 📊 Success Metrics

### Before Refactoring
- Orders created: **AFTER** payment
- Failed payment audit: **NO**
- Stock validation timing: **AFTER** payment
- PendingOrder usage: **YES**

### After Refactoring
- Orders created: **BEFORE** payment ✅
- Failed payment audit: **YES** ✅
- Stock validation timing: **BEFORE** payment ✅
- PendingOrder usage: **NO** ✅

---

## 🎯 Conclusion

This refactoring:
- ✅ Follows industry standards
- ✅ Improves payment reliability
- ✅ Better audit trail
- ✅ Simpler architecture
- ✅ Non-breaking if done correctly
- ✅ Can be deployed incrementally

**Estimated Effort:** 2-3 days  
**Risk Level:** Low (if tested thoroughly)  
**Priority:** High

---

**Next Steps:**
1. Review this plan
2. Approve implementation
3. Create feature branch
4. Implement changes
5. Test thoroughly
6. Deploy to staging
7. Deploy to production

---

**Plan Version:** 1.0  
**Author:** Backend AI Assistant  
**Date:** 2026-01-26
