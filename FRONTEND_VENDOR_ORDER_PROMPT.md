Prompt to Antigravity AI (Frontend)

You are to update the **Vendor Order Management** frontend code.

While the backend logic for orders didn't require structural changes, we must align the frontend to ensure it strictly follows the **cookie-based authentication** pattern and stops sending unnecessary IDs.

---

## 1. Required Change: Remove IDs & Enable Credentials

The following endpoints **do not accept** a `vendorId` in the query parameter. They rely 100% on the `vendorToken` cookie.

### Affected Endpoints
- `GET /api/orders/orders`
- `GET /api/orders/orders/status`
- `PUT /api/orders/orders/:vendorOrderId`
- `PUT /api/orders/orders/:vendorOrderId/complete`

### A. Fetching Orders

**Before (OLD)**:
```javascript
// ❌ Don't pass vendorId
fetch(`/api/orders/orders?vendorId=${currentVendorId}`, { ... });
```

**After (NEW)**:
```javascript
// ✅ Credentials ensure the correct vendor is identified
fetch('/api/orders/orders', {
  credentials: 'include' // Required for cookie transmission
});
```

### B. Updating Order Status

**Before (OLD)**:
```javascript
// ❌ Don't pass vendorId in body/query
axios.put(`/api/orders/orders/${orderId}?vendorId=${currentVendorId}`, { status: 'preparing' });
```

**After (NEW)**:
```javascript
// ✅ Just the order ID in URL + credentials
axios.put(`/api/orders/orders/${orderId}`, 
  { status: 'preparing' },
  { withCredentials: true }
);
```

---

## 2. Checklist

1.  [ ] **Search** for calls to `/api/orders`.
2.  [ ] **Remove** any `?vendorId=...` logic from these calls.
3.  [ ] **Verify** that `credentials` or `withCredentials` is set to true.
4.  [ ] **Test**: Login as a vendor and verify the Orders page loads correctly.

---

**Note**: If you don't send `credentials: 'include'`, the request will fail with **401 Unauthorized** because the backend won't see the cookie.
