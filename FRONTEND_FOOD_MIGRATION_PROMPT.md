Prompt to Antigravity AI (Frontend)

You are to update the **Vendor Dashboard** frontend code to align with the recent security updates to the **Food Management API**.

The backend now uses **HTTP-only cookies** to identify the logged-in vendor.

---

## 1. What Changed on the Backend (Food API)

- **Create Food**: Now extracts the vendor ID **automatically** from the auth cookie. It no longer accepts `vendorId` in the request.
- **Get Foods**: Now **dynamic**.
  - If you send `?vendorId=...`, it works as a **public** request (e.g., for users viewing a menu).
  - If you **omit** `?vendorId=...`, it treats it as a **dashboard** request and shows foods for the logged-in vendor (from cookie).
- **Update/Delete Food**: Now enforces ownership checks using the auth cookie.

---

## 2. Required Frontend Changes (Vendor Dashboard Only)

You need to update the API calls in the **Vendor Dashboard** files.

### A. Fetching Vendor's Foods (Dashboard)

**Before (OLD - Remove `vendorId`)**:
```javascript
// ❌ Don't pass vendorId for the dashboard view
fetch(`/api/vendors/foods/get-foods?vendorId=${currentVendorId}`, {
  credentials: 'include'
});
```

**After (NEW)**:
```javascript
// ✅ Backend auto-detects vendor from cookie
fetch('/api/vendors/foods/get-foods', {
  credentials: 'include'
});
```

### B. Creating New Food

**Before (OLD)**:
```javascript
// ❌ Don't pass vendorId in the body or query
const payload = {
  vendorId: currentVendorId, // Remove this
  name: "Burger",
  price: 10
};
axios.post(`/api/vendors/foods/create?vendorId=${currentVendorId}`, payload);
```

**After (NEW)**:
```javascript
// ✅ Just send the food data. Credentials identify the vendor.
const payload = {
  name: "Burger",
  price: 10
};

fetch('/api/vendors/foods/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // <--- CRITICAL
  body: JSON.stringify(payload)
});
```

### C. Update & Delete Food

Ensure these calls include `credentials: 'include'`. (The `id` query param for the **Food ID** is still required, but you don't need to check vendor ownership on the frontend).

```javascript
// ✅ Update Food (Keep Food ID, just ensure credentials)
fetch(`/api/vendors/foods/update-food?id=${foodId}`, {
  method: 'PATCH',
  credentials: 'include',
  // ...
});

// ✅ Delete Food
fetch(`/api/vendors/foods/delete-food?id=${foodId}`, {
  method: 'DELETE',
  credentials: 'include',
  // ...
});
```

---

## 3. What NOT to Change (Public User Views)

**CRITICAL**: Do **NOT** remove `vendorId` from the public menu pages where users browse restaurants.

```javascript
// ✅ KEEP THIS AS IS for User Views
// Users still need to specify WHICH vendor they are looking at
fetch(`/api/vendors/foods/get-foods?vendorId=${restaurantId}`);
```

---

## 4. Summary Checklist

1.  [ ] **Dashboard**: Remove `vendorId` param from `get-foods` call.
2.  [ ] **Create Food**: Remove `vendorId` from payload/URL.
3.  [ ] **All Vendor Actions**: Ensure `credentials: 'include'` (or `withCredentials: true` for Axios) is set.
4.  [ ] **Public Menu**: Leave `get-foods?vendorId=...` exactly as it is.
