# Typed Discount System Documentation

## Overview
A robust, validated discount system enabling Items, Order, and Delivery scope discounts without breaking existing logic.

## 🎯 Discount Scopes
1.  **GLOBAL_ORDER**: Percentage or Fixed amount off the entire cart subtotal.
2.  **VENDOR_ORDER**: Discount applies only to items from a specific Vendor.
3.  **SPECIFIC_ITEMS**: Discount applies to specific food items (e.g. "Buy This Burger, Get ₦500 Off").
4.  **DELIVERY_FEE**: Discount applies specifically to the delivery fee (e.g. "Free Delivery").

## 🛠 Back-Office Integration
- **Food Model**: Updated with `activePromotions` field. When a `SPECIFIC_ITEMS` discount is created, it automatically links to the Food document. This allows the Frontend to easily badge foods that have active promos.

## 📡 API Endpoints

### 1. Verify Discount (User)
**POST** `/api/discounts/verify`
Use this *before* placing an order to show the user the new total.
```json
// Body
{
  "code": "SAVE20",
  "subtotal": 5000,
  "deliveryFee": 1000,
  "items": [{ "foodId": "...", "price": 100, "quantity": 1 }]
}

// Response
{
  "success": true,
  "data": {
    "subtotal": 5000,
    "discountAmount": 1000,
    "finalSubtotal": 4000,
    "finalDeliveryFee": 1000,
    "total": 5000,
    "appliedDiscount": {
      "code": "SAVE20",
      "type": "PERCENTAGE",
      "amount": 1000,
      "scope": "GLOBAL_ORDER"
    }
  }
}
```

### 2. Create Order with Discount
**POST** `/api/orders`
Add the `discountCode` field to the payload.
```json
{
  "items": [...],
  "deliveryAddress": {...},
  "discountCode": "SAVE20" // <--- NEW FIELD
}
```
The backend will re-validate the code and apply the discount to the created order.

### 3. Manage Discounts (Admin/Vendor)
**POST** `/api/admin/discounts`
```json
{
  "code": "BURGER500",
  "type": "FIXED", // or PERCENTAGE
  "value": 500,
  "scope": "SPECIFIC_ITEMS",
  "targetFoodIds": ["foodId123"],
  "vendorId": "vendorId123",
  "usageLimit": 100
}
```
*Note: Creating a SPECIFIC_ITEMS discount automatically updates the Food model's `activePromotions` field.*

## 🔒 Security & Validation
- **Server-Side Math**: All calculations happen on the backend.
- **Idempotency**: Discount usage is tracked transactionally.
- **Validation**: Checks expiry, per-user limits, and vendor ownership.
