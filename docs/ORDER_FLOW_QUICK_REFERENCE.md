# Order Creation Flow - Quick Reference

**Date:** 2026-01-26  
**Status:** ⚠️ REFACTORING REQUIRED

---

## 🚨 TL;DR

**Problem:** Orders are created AFTER payment verification (WRONG)  
**Solution:** Orders should be created BEFORE payment verification (CORRECT)  
**Impact:** Non-breaking refactoring required  
**Effort:** 2-3 days  
**Priority:** HIGH

---

## 📋 What's Wrong?

### Current Flow
```
initializePayment → Paystack → verifyPayment → CREATE Order ❌
```

### Correct Flow
```
CREATE Order → initializePayment → Paystack → verifyPayment → UPDATE Order ✅
```

---

## 🔧 Files to Modify

| File | Function | Change Required |
|------|----------|-----------------|
| `controller/order/orderController.js` | `initializePayment` | Create Order BEFORE Paystack |
| `controller/order/orderController.js` | `verifyPayment` | UPDATE Order (don't create) |
| `controller/order/orderController.js` | `verifyPaymentV2` | UPDATE Order (don't create) |
| `controller/order/createOrderV2.controller.js` | `createOrderV2` | Remove VendorOrder creation |
| `controller/order/createOrderV2.controller.js` | NEW: `updateOrderAfterPayment` | Add new function |

---

## 📝 Key Changes

### 1. initializePayment (Lines 601-698)

**Before:**
```javascript
await PendingOrder.create({ userId, paymentReference, payload });
```

**After:**
```javascript
const order = await createOrderV2({
  userId, items, vendorDeliveryFees, deliveryAddress, phone,
  paymentStatus: "pending"
});
const reference = `PSK_${order.orderId}_${Date.now()}`;
order.paymentReference = reference;
await order.save();
```

---

### 2. verifyPayment (Lines 703-788)

**Before:**
```javascript
const newOrder = await createOrder({ paymentStatus: "paid" });
```

**After:**
```javascript
const order = await Order.findOne({ paymentReference: reference });
order.paymentStatus = "paid";
order.orderStatus = "accepted";
await order.save();
await createVendorOrdersAndUpdateWallets(order);
```

---

### 3. createOrderV2 (Lines 255-571)

**Before:**
```javascript
if (paymentStatus === "paid") {
  // Create VendorOrders here
}
```

**After:**
```javascript
// Remove VendorOrder creation
// Always create order with pending status
// VendorOrders created in updateOrderAfterPayment
```

---

## ✅ Benefits

| Before | After |
|--------|-------|
| ❌ No order before payment | ✅ Order exists before payment |
| ❌ No failed payment audit | ✅ Full audit trail |
| ❌ Stock validated after payment | ✅ Stock validated before payment |
| ❌ Complex (2 tables) | ✅ Simple (1 table) |
| ❌ Orphaned payment risk | ✅ No orphaned payments |

---

## 🧪 Testing Checklist

- [ ] Order created with `paymentStatus: "pending"`
- [ ] Payment reference stored correctly
- [ ] Order updated to `"paid"` after verification
- [ ] Failed payments update order to `"failed"`
- [ ] VendorOrders only created after payment success
- [ ] Idempotency works (duplicate verification)
- [ ] Stock validated before payment
- [ ] Wallets updated correctly

---

## 📚 Documentation

1. **ORDER_FLOW_SUMMARY.md** - Executive summary
2. **ORDER_FLOW_AUDIT_REPORT.md** - Detailed audit
3. **ORDER_FLOW_REFACTORING_PLAN.md** - Implementation guide
4. **ORDER_FLOW_DIAGRAMS.md** - Visual diagrams
5. **ORDER_FLOW_QUICK_REFERENCE.md** - This file

---

## 🎯 Next Steps

1. ✅ Review audit report
2. ✅ Review refactoring plan
3. ⏳ Approve implementation
4. ⏳ Implement changes
5. ⏳ Test thoroughly
6. ⏳ Deploy to staging
7. ⏳ Deploy to production

---

## 🔒 Safety

- ✅ No schema changes
- ✅ Non-breaking
- ✅ Can rollback easily
- ✅ Backward compatible
- ✅ Existing orders unaffected

---

## 📊 Order Status Values

### paymentStatus
- `"pending"` - Payment not completed
- `"paid"` - Payment successful
- `"failed"` - Payment failed

### orderStatus
- `"pending"` - Order created, awaiting payment
- `"accepted"` - Payment verified, order confirmed
- `"preparing"` - Vendor preparing food
- `"ready_for_pickup"` - Ready for delivery
- `"rider_assigned"` - Rider assigned
- `"out_for_delivery"` - In transit
- `"delivered"` - Delivered to customer
- `"completed"` - Order completed
- `"cancelled"` - Order cancelled
- `"failed"` - Payment failed
- `"refunded"` - Order refunded

---

## 🔄 Correct Lifecycle

```
1. CREATE Order
   paymentStatus: "pending"
   orderStatus: "pending"

2. Initialize Payment
   paymentReference: "PSK_..."

3a. Payment Success
    paymentStatus: "paid"
    orderStatus: "accepted"
    → Create VendorOrders
    → Update wallets

3b. Payment Failed
    paymentStatus: "failed"
    orderStatus: "failed"
    → No VendorOrders
    → No wallet updates
```

---

## 💡 Key Principles

1. **Order First** - Always create Order before payment
2. **Pending Status** - Start with `paymentStatus: "pending"`
3. **Update, Don't Create** - Verification updates existing order
4. **Idempotency** - Handle duplicate verifications
5. **Audit Trail** - Keep all orders (including failed)
6. **Stock Before Payment** - Validate before charging user

---

## 🚨 Common Mistakes to Avoid

1. ❌ Creating order after payment
2. ❌ Creating order with `paymentStatus: "paid"` directly
3. ❌ Not handling failed payments
4. ❌ Creating VendorOrders before payment verification
5. ❌ Not checking idempotency
6. ❌ Validating stock after payment

---

## ✅ Correct Implementation

```javascript
// 1. Initialize Payment
async function initializePayment(req, res) {
  // Create order FIRST
  const order = await createOrderV2({
    paymentStatus: "pending"  // ✅ Pending
  });
  
  // Generate reference
  const reference = `PSK_${order.orderId}_${Date.now()}`;
  
  // Update order
  order.paymentReference = reference;
  await order.save();
  
  // Initialize Paystack
  await paystack.initialize({ reference, amount: order.total });
  
  return { orderId: order.orderId, reference };
}

// 2. Verify Payment
async function verifyPayment(req, res) {
  const { reference } = req.params;
  
  // Find existing order
  const order = await Order.findOne({ paymentReference: reference });
  
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  
  // Check idempotency
  if (order.paymentStatus === "paid") {
    return res.json({ message: "Already processed", order });
  }
  
  // Verify with Paystack
  const payment = await paystack.verify(reference);
  
  if (payment.status === "success") {
    // Update order
    order.paymentStatus = "paid";
    order.orderStatus = "accepted";
    await order.save();
    
    // Create VendorOrders
    await createVendorOrdersAndUpdateWallets(order);
  } else {
    // Update as failed
    order.paymentStatus = "failed";
    order.orderStatus = "failed";
    await order.save();
  }
  
  return { order };
}
```

---

## 📞 Support

For questions:
- Review `ORDER_FLOW_REFACTORING_PLAN.md` for detailed implementation
- Review `ORDER_FLOW_AUDIT_REPORT.md` for complete analysis
- Review `ORDER_FLOW_DIAGRAMS.md` for visual explanations

---

**Version:** 1.0  
**Date:** 2026-01-26  
**Author:** Backend AI Assistant
