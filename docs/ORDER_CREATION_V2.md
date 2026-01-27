# Order Creation V2 - Implementation Documentation

## Overview

This implementation provides a **production-grade order creation flow** that accepts a normalized frontend payload while performing **full server-side validation and price recalculation**. It maintains backward compatibility with existing flows.

---

## Key Features

### ✅ Server-Side Validation
- Food existence and availability
- Vendor ownership verification
- Stock validation (food, variants, choice options)
- Choice group constraints (min/max selections)
- Availability schedule checking
- Delivery fee validation

### ✅ Server-Side Price Calculation
- Base price from variants/portions
- Choice options pricing
- Packaging fees
- Discount application (percentage or flat)
- **Frontend prices are NEVER trusted**

### ✅ Atomic Transactions
- All database operations use MongoDB sessions
- Automatic rollback on any error
- Stock decrements are transactional
- Wallet updates are atomic

### ✅ Vendor Order Splitting
- Automatically splits orders by vendor
- Creates separate VendorOrder documents
- Calculates commission (10% platform fee)
- Updates vendor wallets and stats
- Updates admin wallet with commission

### ✅ Backward Compatibility
- Existing order flow remains untouched
- V2 endpoints are separate (`/v2/create`, `/v2/verify/:reference`)
- Existing vendor dashboards continue to work
- No schema changes required

---

## API Endpoints

### 1. Create Order (Direct - No Payment)
**Endpoint:** `POST /api/orders/v2/create`  
**Auth:** Required (User)

**Request Body:**
```json
{
  "items": [
    {
      "foodId": "64fa1234567890abcdef1234",
      "restaurantId": "64fa1234567890abcdef5678",
      "variant": {
        "name": "1 Portion",
        "price": 3000,
        "image": "https://..."
      },
      "quantity": 2,
      "note": "Extra spicy",
      "metadata": {
        "choices": [
          {
            "group": "Choose Protein",
            "name": "Chicken",
            "price": 500
          }
        ],
        "spiceLevel": "Medium"
      }
    }
  ],
  "vendorDeliveryFees": [
    {
      "restaurantId": "64fa1234567890abcdef5678",
      "deliveryFee": 700
    }
  ],
  "deliveryAddress": {
    "addressLine": "123 Main St, Apt 4B",
    "city": "Lagos",
    "state": "Lagos",
    "phone": "+2348012345678",
    "label": "Home"
  },
  "phone": "+2348012345678"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "_id": "...",
    "orderId": "ORD-A1B2C3D4E5F6",
    "userId": "...",
    "items": [...],
    "subtotal": 7000,
    "deliveryFee": 700,
    "total": 7700,
    "paymentStatus": "pending",
    "orderStatus": "pending",
    "createdAt": "2026-01-26T10:00:00.000Z"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Jollof Rice: Variant \"2 Portions\" is out of stock"
}
```

---

### 2. Verify Payment V2
**Endpoint:** `POST /api/orders/v2/verify/:reference`  
**Auth:** Required (User)

**Description:** Verifies Paystack payment and creates order with full validation.

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment verified and order created",
  "order": {...},
  "paystack": {
    "reference": "PSK_1234567890_abcd",
    "paid_at": "2026-01-26T10:00:00.000Z",
    "amount": 7700
  }
}
```

---

## Validation Rules

### Food Validation
1. **Existence:** Food must exist in database
2. **Vendor Ownership:** Food must belong to specified restaurant
3. **Availability:** `food.available` must be `true`
4. **Schedule:** If `availabilitySchedule.enabled`, check day and time
5. **Stock:** Global food stock must be sufficient

### Variant/Portion Validation
1. **Existence:** Variant name must match database entry
2. **Stock:** Variant stock must be sufficient
3. **Fallback:** If no variant, use base food price

### Choice Group Validation
1. **Min Selections:** Must meet `minSelect` constraint
2. **Max Selections:** Cannot exceed `maxSelect` constraint
3. **Option Existence:** Each choice must exist in group
4. **Stock:** Each option must have sufficient stock

### Delivery Fee Validation
1. **Coverage:** All vendors must have delivery fees
2. **No Duplicates:** Each vendor can only have one fee
3. **Valid Amount:** Fee must be >= 0

---

## Price Calculation Logic

```javascript
// 1. Base Price (from variant or food)
basePrice = variant.price || food.price

// 2. Add Choice Prices
choicesTotal = sum(choice.price for choice in choices)

// 3. Add Packaging Fee
packagingFee = food.packagingFee || 0

// 4. Calculate Subtotal
subtotal = basePrice + choicesTotal + packagingFee

// 5. Apply Discount (if active and not expired)
if (discount.active && !expired) {
  if (discount.percentage > 0) {
    discountAmount = subtotal * (discount.percentage / 100)
  } else if (discount.flatAmount > 0) {
    discountAmount = discount.flatAmount
  }
}

// 6. Final Unit Price
unitPrice = max(0, subtotal - discountAmount)

// 7. Total for Item
itemTotal = unitPrice * quantity
```

---

## Stock Management

### Decrement Operations (Atomic)
1. **Food Stock:** `food.stock -= quantity`
2. **Order Count:** `food.orderCount += 1`
3. **Variant Stock:** `variant.stock -= quantity` (if applicable)
4. **Choice Options:** `option.stock -= quantity` (for each choice)

### Infinity Handling
- Stock values of `Infinity` are never decremented
- Represents unlimited availability

---

## Vendor Order Splitting

### Commission Structure
- **Platform Commission:** 10% of subtotal
- **Vendor Earning:** 90% of subtotal
- **Delivery Fee:** 100% goes to vendor

### Example Calculation
```
Item Subtotal: ₦5,000
Platform Commission: ₦500 (10%)
Vendor Earning: ₦4,500 (90%)
Delivery Fee: ₦700
Total Vendor Credit: ₦5,200
```

### VendorOrder Document
```json
{
  "restaurantId": "...",
  "userOrderId": "...",
  "items": [...],
  "commission": 500,
  "vendorTotal": 4500,
  "deliveryShare": 700,
  "orderStatus": "pending"
}
```

---

## Error Handling

### Common Errors

| Error | Status | Message |
|-------|--------|---------|
| Food not found | 400 | `"Item 0: Food not found"` |
| Wrong vendor | 400 | `"Item 0: Food does not belong to specified restaurant"` |
| Out of stock | 400 | `"Jollof Rice is currently unavailable"` |
| Schedule conflict | 400 | `"Jollof Rice is not available on Sunday"` |
| Invalid choice | 400 | `"Jollof Rice: Invalid choice \"Goat\" in group \"Choose Protein\""` |
| Min constraint | 400 | `"Jollof Rice: \"Choose Protein\" requires at least 1 selection(s)"` |
| Missing delivery fee | 400 | `"Missing delivery fee for restaurant 64fa..."` |

---

## Migration Guide

### For Frontend Teams

**Old Payload (Still Works):**
```javascript
// Uses existing /api/orders/create endpoint
// Prices are partially trusted
```

**New Payload (Recommended):**
```javascript
// Use /api/orders/v2/create endpoint
// Prices are recalculated server-side
// Full validation applied
```

### Gradual Migration
1. **Phase 1:** Test V2 endpoints in staging
2. **Phase 2:** Run both endpoints in parallel
3. **Phase 3:** Monitor V2 for 1-2 weeks
4. **Phase 4:** Migrate frontend to V2
5. **Phase 5:** Deprecate V1 (optional)

---

## Testing Checklist

### Unit Tests
- [ ] Validate variant selection
- [ ] Validate choice groups (min/max)
- [ ] Calculate prices correctly
- [ ] Apply discounts correctly
- [ ] Handle stock depletion
- [ ] Handle availability schedules

### Integration Tests
- [ ] Create order with single vendor
- [ ] Create order with multiple vendors
- [ ] Verify payment flow
- [ ] Stock rollback on error
- [ ] Wallet updates
- [ ] VendorOrder creation

### Edge Cases
- [ ] Out of stock items
- [ ] Expired discounts
- [ ] Invalid choice selections
- [ ] Missing delivery fees
- [ ] Duplicate vendor fees
- [ ] Concurrent order creation

---

## Performance Considerations

### Database Queries
- **Food Fetch:** Single query with `$in` operator
- **Stock Updates:** Batched within transaction
- **Wallet Updates:** Atomic operations

### Optimization Tips
1. Use lean queries where possible
2. Index `foodId` and `restaurantId` fields
3. Consider caching food data (with invalidation)
4. Use connection pooling for MongoDB

---

## Security Features

### Price Tampering Prevention
- ✅ All prices recalculated server-side
- ✅ Frontend prices ignored
- ✅ Discount validation (expiry check)
- ✅ Stock validation before deduction

### Vendor Ownership Verification
- ✅ Food must belong to specified restaurant
- ✅ Prevents cross-vendor item injection

### Transaction Safety
- ✅ All operations in MongoDB session
- ✅ Automatic rollback on error
- ✅ Idempotency for payment verification

---

## Monitoring & Logging

### Key Logs
```javascript
console.log(`✅ Order created successfully: ${orderId}`);
console.log(`❌ CreateOrderV2 failed: ${error.message}`);
console.log(`🔍 [V2] Received verification request for reference: ${reference}`);
```

### Metrics to Track
- Order creation success rate
- Average order value
- Stock depletion rate
- Payment verification time
- Error rate by type

---

## Support & Troubleshooting

### Common Issues

**Issue:** "Food not found"  
**Solution:** Verify `foodId` exists and is not deleted

**Issue:** "Insufficient stock"  
**Solution:** Check food/variant/option stock levels

**Issue:** "Missing delivery fee"  
**Solution:** Ensure all vendors in order have delivery fees

**Issue:** "Payment verification failed"  
**Solution:** Check PendingOrder exists and Paystack reference matches

---

## Future Enhancements

### Planned Features
- [ ] Promo code support
- [ ] Tip calculation
- [ ] Tax calculation
- [ ] Multi-currency support
- [ ] Scheduled orders
- [ ] Subscription orders
- [ ] Gift cards

### Performance Improvements
- [ ] Redis caching for food data
- [ ] Batch stock updates
- [ ] Async wallet updates
- [ ] Event-driven architecture

---

## Contact & Support

For questions or issues:
- **Backend Team:** backend@grubdash.com
- **Documentation:** docs.grubdash.com
- **Slack:** #backend-orders

---

**Last Updated:** 2026-01-26  
**Version:** 2.0.0  
**Author:** Backend Team
