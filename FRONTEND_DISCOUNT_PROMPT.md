# Prompt for Frontend AI: Integrate Typed Discount System

## Context
A new, robust Discount System has been implemented on the backend. It supports specific item discounts, delivery discounts, and order-wide coupons, validated server-side.

## Objective
Update the checkout flow to support validating and applying discount codes using the new API.

## API Integration

### 1. Verify Discount Context
Before the user places the order (e.g., in the Cart or Checkout View), allow them to enter a code.

**Endpoint**: `POST /api/discounts/verify`
**Body**:
```json
{
  "code": "Save20",
  "subtotal": 5000,
  "deliveryFee": 1000,
  "vendorId": "...", // If single vendor cart
  "items": [...]
}
```
**Response**:
Returns the *calculated* preview.
```json
{
  "total": 5400,
  "discountAmount": 600,
  "finalSubtotal": 4400, // Display this
  "appliedDiscount": { "label": "10% Off", "type": "PERCENTAGE" }
}
```

### 2. Place Order
When calling `POST /api/orders` (Create Order), simply add the `discountCode` field to the payload.
**Do not send the calculated total.** The backend re-calculates it.

### 3. Display Logic
- **Food Cards**: Check `food.activePromotions` (array). If present, fetch the discount details (or backend can hydrate) to show a badge (e.g. "Special Promo").
    - *Note*: You might need to update the Food fetch query to populate `activePromotions` if you want details, or just show a generic "Promo Available" badge.

## Task List for Frontend AI
1.  **UI Component**: Add a "Coupon Code" input field in the Checkout summary.
2.  **Logic**:
    -   On "Apply", call `/api/discounts/verify`.
    -   If valid, show the discount amount and the new Total in the UI.
    -   If invalid, show the error message returned by backend.
3.  **Checkout**: Pass the validated `discountCode` in the `createOrder` payload.
4.  **Vendor Dashboard**: Create a "Discounts" tab where vendors can create coupons (`POST /api/admin/discounts`) and list them (`GET /api/admin/discounts`).

## Prompt Text
(Copy and paste this)

```markdown
I need you to integrate the new Discount System into the Checkout and Vendor Dashboard.

**Documentation**: See `DISCOUNT_SYSTEM.md` for full implementation details.

**Checkout Flow**:
1. Add a "Promo Code" input.
2. call `POST /api/discounts/verify` to validate.
3. Show the `discountAmount` and updated `total` from the response. DO NOT calculate math on frontend.
4. Pass `discountCode` to `POST /api/orders`.

**Vendor Dashboard**:
1. Add a "Coupons" page.
2. Allow vendors to create discounts (Fixed/Percentage, Item-specific or Vendor-wide).
3. Endpoint: `POST /api/admin/discounts`.
```
