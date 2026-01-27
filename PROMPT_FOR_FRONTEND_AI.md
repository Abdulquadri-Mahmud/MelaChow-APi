Prompt to Antigravity AI (Frontend)

You are to **align the frontend with critical backend authentication security updates** that were just completed.

This is a **non-breaking migration task** focused on updating vendor dashboard API calls to work with the new secure authentication flow.

---

## 1. Context: What Changed on the Backend

The backend authentication system was audited and hardened for security. The most critical change affecting the frontend is:

**All protected vendor routes now exclusively use the authenticated vendor's ID from the JWT token stored in HTTP-only cookies.**

This means vendor dashboard routes **no longer accept or use** `?id=` query parameters.

---

## 2. Required Frontend Changes

### Critical Change: Update Vendor Dashboard API Calls

You must find and update ALL vendor dashboard API calls to remove the `?id=` query parameter.

**Routes that need updating:**
- `/api/vendors/get-vendor`
- `/api/vendors/get-wallet`
- `/api/vendors/orders`
- `/api/vendors/update-vendor`
- `/api/vendors/delete-vendor`
- `/api/vendors/restore-vendor`

**Before (OLD CODE - Remove)**:
```javascript
const vendorId = getVendorIdFromLocalStorage();

fetch(`/api/vendors/get-vendor?id=${vendorId}`, {
  credentials: 'include'
});

fetch(`/api/vendors/get-wallet?id=${vendorId}`, {
  credentials: 'include'
});

fetch(`/api/vendors/orders?id=${vendorId}`, {
  credentials: 'include'
});
```

**After (NEW CODE - Implement)**:
```javascript
// No need to pass vendor ID - backend reads it from cookie

fetch('/api/vendors/get-vendor', {
  credentials: 'include'
});

fetch('/api/vendors/get-wallet', {
  credentials: 'include'
});

fetch('/api/vendors/orders', {
  credentials: 'include'
});
```

---

## 3. What NOT to Change

**DO NOT modify public routes** that display vendor information to users:

```javascript
// ✅ KEEP AS IS - This is a public route for users browsing vendors
fetch(`/api/vendors/vendor?id=${vendorId}`);
```

This route is public and still requires the vendor ID in the query parameter.

---

## 4. Implementation Steps

1. **Search the codebase** for all instances of:
   - `/api/vendors/get-vendor`
   - `/api/vendors/get-wallet`
   - `/api/vendors/orders`
   - `/api/vendors/update-vendor`
   - `/api/vendors/delete-vendor`
   - `/api/vendors/restore-vendor`

2. **For each instance found**:
   - Remove `?id=${vendorId}` from the URL
   - Remove any code that retrieves `vendorId` from localStorage/state for these specific calls
   - Ensure `credentials: 'include'` is present (or `withCredentials: true` for Axios)

3. **Update error handling** to handle the new error response format:
   ```javascript
   {
     "success": false,
     "message": "Unauthorized. Token missing or invalid."
   }
   ```

4. **Test thoroughly**:
   - Vendor login flow
   - Dashboard data loading
   - Wallet display
   - Orders display
   - Profile updates
   - Logout

---

## 5. Expected Behavior

### Before Migration
```
Frontend sends: GET /api/vendors/get-vendor?id=123abc
Backend uses: id=123abc from query parameter (INSECURE)
```

### After Migration
```
Frontend sends: GET /api/vendors/get-vendor
                Cookie: vendorToken=eyJhbGc...
Backend reads: vendorToken from cookie
               Extracts vendor ID from JWT
               Uses that ID (SECURE)
```

---

## 6. Testing Checklist

After making changes, verify:

- [ ] Vendor can log in successfully
- [ ] Cookie `vendorToken` is set in browser (check DevTools → Application → Cookies)
- [ ] Vendor dashboard loads without passing `?id=` parameter
- [ ] Vendor wallet displays correctly
- [ ] Vendor orders load correctly
- [ ] Vendor can update their profile
- [ ] Vendor logout clears cookie
- [ ] Accessing dashboard without login redirects to login page
- [ ] Public vendor browsing (for users) still works

---

## 7. Common Mistakes to Avoid

### Mistake 1: Removing IDs from Public Routes
```javascript
// ❌ WRONG - Public route needs ID
fetch('/api/vendors/vendor');

// ✅ CORRECT
fetch(`/api/vendors/vendor?id=${vendorId}`);
```

### Mistake 2: Not Including Credentials
```javascript
// ❌ WRONG - Cookie won't be sent
fetch('/api/vendors/get-vendor');

// ✅ CORRECT
fetch('/api/vendors/get-vendor', { credentials: 'include' });
```

### Mistake 3: Passing Vendor ID in Headers or Body
```javascript
// ❌ WRONG - Don't try to pass vendor ID manually
fetch('/api/vendors/get-vendor', {
  credentials: 'include',
  headers: { 'X-Vendor-Id': vendorId }
});

// ✅ CORRECT - Let backend read from cookie
fetch('/api/vendors/get-vendor', {
  credentials: 'include'
});
```

---

## 8. If Using Axios

Ensure global configuration is set:

```javascript
import axios from 'axios';

axios.defaults.withCredentials = true;
axios.defaults.baseURL = process.env.NEXT_PUBLIC_API_URL;

// Then use without vendorId
const getVendorDashboard = async () => {
  const response = await axios.get('/api/vendors/get-vendor');
  return response.data;
};
```

---

## 9. Debugging Guide

### Issue: "Unauthorized. Token missing or invalid"

**Check:**
1. Is the vendor logged in?
2. Is the `vendorToken` cookie present? (DevTools → Application → Cookies)
3. Is `credentials: 'include'` set on the request?
4. Is the cookie being sent with the request? (DevTools → Network → Request Headers)

### Issue: Vendor data not loading

**Check:**
1. Did you remove the `?id=` parameter from the URL?
2. Is the request reaching the backend? (Network tab)
3. Is the cookie being sent? (Request Headers should show `Cookie: vendorToken=...`)

---

## 10. Success Criteria

Your migration is complete when:

1. ✅ All vendor dashboard API calls work without `?id=` parameter
2. ✅ Vendor authentication flow works end-to-end
3. ✅ No authentication-related console errors
4. ✅ Public vendor browsing still works for users
5. ✅ Vendor cannot access other vendors' data

---

## Final Notes

- **Priority**: 🔴 HIGH
- **Estimated Time**: 1-2 hours
- **Breaking Changes**: None (if implemented correctly)
- **Backend Status**: Already deployed and ready

The backend is already running with these security measures. Your frontend changes will make the vendor dashboard work correctly with the new secure authentication flow.

Focus on finding and updating all vendor dashboard API calls to remove query-based IDs. The backend will handle authentication via cookies automatically.
