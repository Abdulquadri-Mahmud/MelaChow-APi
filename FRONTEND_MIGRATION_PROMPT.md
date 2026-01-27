# Frontend Authentication Alignment Prompt

**To**: Antigravity AI (Frontend Team)  
**From**: Backend Team  
**Date**: 2026-01-24  
**Subject**: Frontend Alignment Required - Backend Authentication Hardening Complete

---

## 🎯 Objective

The backend authentication system has been **audited and hardened** for security. While the changes are **mostly backward compatible**, there are **critical frontend updates required** to ensure proper functionality, especially for **vendor dashboard routes**.

This is a **non-breaking alignment task** focused on ensuring the frontend correctly handles the new backend authentication behavior.

---

## 📋 What Changed on the Backend

### 1. Cookie Configuration Updated ✅
**Change**: Cookies now use `sameSite: "none"` in production (was `"strict"`)

**Why**: To support cross-origin requests from Vercel frontend to backend API

**Impact on Frontend**: 
- ✅ **No action required** - Cookies will now work correctly in production
- Ensure `credentials: "include"` is set on all authenticated requests (should already be done)

---

### 2. Vendor Routes No Longer Accept Query-Based IDs 🚨 **CRITICAL**
**Change**: All protected vendor routes now **exclusively** use the authenticated vendor's ID from the JWT token

**Routes Affected**:
```
GET  /api/vendors/get-vendor       (was: ?id=xxx, now: uses token only)
GET  /api/vendors/get-wallet       (was: ?id=xxx, now: uses token only)
GET  /api/vendors/orders           (was: ?id=xxx, now: uses token only)
PATCH /api/vendors/update-vendor   (was: ?id=xxx, now: uses token only)
DELETE /api/vendors/delete-vendor  (was: ?id=xxx, now: uses token only)
PATCH /api/vendors/restore-vendor  (was: ?id=xxx, now: uses token only)
```

**Impact on Frontend**: 
- 🚨 **ACTION REQUIRED** - Remove all `?id=` query parameters from vendor dashboard API calls
- The backend will **ignore** query parameters and use the authenticated vendor's ID from the cookie

---

### 3. Public Routes Unchanged ✅
**No Change**: Public routes that display vendor information to users still accept IDs

**Routes That Still Work With IDs**:
```
GET /api/vendors/vendor?id=xxx     (Public - for users browsing vendors)
```

**Impact on Frontend**:
- ✅ **No action required** - User-facing vendor browsing continues to work

---

## 🔧 Required Frontend Changes

### Change 1: Update Vendor Dashboard API Calls

#### ❌ **OLD CODE (Remove)**
```javascript
// Vendor Dashboard Component
const vendorId = getVendorIdFromLocalStorage(); // ❌ No longer needed

// Fetching vendor data
fetch(`/api/vendors/get-vendor?id=${vendorId}`, {
  credentials: 'include'
});

// Fetching wallet
fetch(`/api/vendors/get-wallet?id=${vendorId}`, {
  credentials: 'include'
});

// Fetching orders
fetch(`/api/vendors/orders?id=${vendorId}`, {
  credentials: 'include'
});

// Updating vendor
fetch(`/api/vendors/update-vendor?id=${vendorId}`, {
  method: 'PATCH',
  credentials: 'include',
  body: JSON.stringify(updates)
});
```

#### ✅ **NEW CODE (Implement)**
```javascript
// Vendor Dashboard Component
// No need to pass vendor ID - backend reads it from cookie

// Fetching vendor data
fetch('/api/vendors/get-vendor', {
  credentials: 'include'
});

// Fetching wallet
fetch('/api/vendors/get-wallet', {
  credentials: 'include'
});

// Fetching orders
fetch('/api/vendors/orders', {
  credentials: 'include'
});

// Updating vendor
fetch('/api/vendors/update-vendor', {
  method: 'PATCH',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updates)
});
```

---

### Change 2: Verify Axios Configuration (If Using Axios)

#### ✅ **Ensure This is Set Globally**
```javascript
// In your API client setup
import axios from 'axios';

axios.defaults.withCredentials = true;
axios.defaults.baseURL = process.env.NEXT_PUBLIC_API_URL;

// Then use without passing vendorId
const getVendorDashboard = async () => {
  const response = await axios.get('/api/vendors/get-vendor');
  return response.data;
};

const getVendorWallet = async () => {
  const response = await axios.get('/api/vendors/get-wallet');
  return response.data;
};
```

---

### Change 3: Update Error Handling

#### ✅ **Handle New Error Response Format**
```javascript
// Backend now returns consistent error format
{
  "success": false,
  "message": "Unauthorized. Token missing or invalid."
}

// Update your error handling
try {
  const response = await fetch('/api/vendors/get-vendor', {
    credentials: 'include'
  });
  
  const data = await response.json();
  
  if (!response.ok || !data.success) {
    // Handle error
    if (response.status === 401) {
      // Token missing or expired - redirect to login
      router.push('/vendor-auth/login');
    } else {
      // Show error message
      toast.error(data.message || 'An error occurred');
    }
  }
} catch (error) {
  console.error('API Error:', error);
}
```

---

## 📝 Detailed Migration Steps

### Step 1: Identify All Vendor Dashboard API Calls
Search your frontend codebase for:
- `/api/vendors/get-vendor`
- `/api/vendors/get-wallet`
- `/api/vendors/orders`
- `/api/vendors/update-vendor`
- `/api/vendors/delete-vendor`
- `/api/vendors/restore-vendor`

### Step 2: Remove Query Parameters
For each call found:
1. Remove `?id=${vendorId}` from the URL
2. Remove any code that retrieves `vendorId` from localStorage/state for these calls
3. Ensure `credentials: 'include'` is present

### Step 3: Update State Management
If you're storing `vendorId` in state/context for API calls:
```javascript
// ❌ OLD - Remove this pattern
const [vendorId, setVendorId] = useState(null);

useEffect(() => {
  const id = localStorage.getItem('vendorId');
  setVendorId(id);
}, []);

// ✅ NEW - Not needed for authenticated calls
// Just ensure the cookie is present (set during login)
```

### Step 4: Keep User-Facing Routes Unchanged
**DO NOT** change these public routes:
```javascript
// ✅ KEEP AS IS - Public route for users browsing vendors
fetch(`/api/vendors/vendor?id=${vendorId}`, {
  // No credentials needed for public route
});
```

---

## 🧪 Testing Checklist

After making changes, verify:

### Vendor Authentication Flow
- [ ] Vendor can log in successfully
- [ ] Cookie is set in browser (check DevTools → Application → Cookies)
- [ ] Vendor dashboard loads without passing `?id=`
- [ ] Vendor wallet displays correctly
- [ ] Vendor orders load correctly
- [ ] Vendor can update their profile
- [ ] Vendor logout clears cookie and redirects to login

### Error Scenarios
- [ ] Accessing dashboard without login redirects to login page
- [ ] Expired token shows appropriate error message
- [ ] Network errors are handled gracefully

### User Flow (Should Be Unchanged)
- [ ] Users can browse vendors by ID
- [ ] Users can view vendor menus
- [ ] User authentication still works

---

## 🚨 Common Mistakes to Avoid

### Mistake 1: Removing IDs from Public Routes
```javascript
// ❌ WRONG - This is a public route, keep the ID
fetch('/api/vendors/vendor'); // Missing ID!

// ✅ CORRECT - Public routes still need IDs
fetch(`/api/vendors/vendor?id=${vendorId}`);
```

### Mistake 2: Not Setting Credentials
```javascript
// ❌ WRONG - Cookie won't be sent
fetch('/api/vendors/get-vendor');

// ✅ CORRECT - Always include credentials
fetch('/api/vendors/get-vendor', { credentials: 'include' });
```

### Mistake 3: Hardcoding Vendor IDs
```javascript
// ❌ WRONG - Defeats the purpose of token-based auth
fetch('/api/vendors/get-vendor', {
  credentials: 'include',
  headers: { 'X-Vendor-Id': vendorId } // Don't do this!
});

// ✅ CORRECT - Let the backend read from token
fetch('/api/vendors/get-vendor', {
  credentials: 'include'
});
```

---

## 📊 Expected Behavior After Changes

### Before (Old Behavior)
```
Frontend: GET /api/vendors/get-vendor?id=123abc
Backend: Uses id=123abc from query (INSECURE)
```

### After (New Behavior)
```
Frontend: GET /api/vendors/get-vendor
          Cookie: vendorToken=eyJhbGc...
Backend: Reads vendorToken from cookie
         Extracts vendor ID from JWT
         Uses that ID (SECURE)
```

---

## 🔍 Debugging Guide

### Issue: "Unauthorized. Token missing or invalid"

**Check:**
1. Is the vendor logged in?
2. Is the cookie present in browser?
   - DevTools → Application → Cookies
   - Look for `vendorToken`
3. Is `credentials: 'include'` set on the request?
4. Is the API URL correct?

### Issue: Vendor data not loading

**Check:**
1. Did you remove the `?id=` parameter?
2. Is the request reaching the backend?
   - Check Network tab in DevTools
3. Is the cookie being sent with the request?
   - Check Request Headers in Network tab
   - Should see: `Cookie: vendorToken=...`

### Issue: Getting 401 errors after login

**Check:**
1. Is the cookie being set on login?
   - Check Response Headers after login
   - Should see: `Set-Cookie: vendorToken=...`
2. Is the cookie domain correct?
3. Is HTTPS enabled in production?

---

## 📚 Reference Files

### Backend Documentation
- `SECURITY_AUDIT_REPORT.md` - Full audit report
- `AUTH_REFERENCE.md` - Developer reference guide

### Key Backend Changes
- `utils/sendTokenCookie.js` - Cookie configuration
- `middleware/vendor.middleware.js` - Vendor authentication
- `controller/vendor/vendor.controller.js` - Vendor routes
- `routes/vendor/vendor.routes.js` - Route definitions

---

## 🎯 Success Criteria

Your frontend changes are complete when:

1. ✅ All vendor dashboard API calls work **without** passing `?id=` parameter
2. ✅ Vendor authentication flow works end-to-end
3. ✅ No console errors related to authentication
4. ✅ Vendor cannot access other vendors' data (even if they try to manipulate requests)
5. ✅ Public vendor browsing still works for users
6. ✅ Error messages are displayed correctly

---

## 🚀 Deployment Notes

### Staging Environment
1. Deploy frontend changes to staging
2. Test against staging backend
3. Verify all vendor flows work

### Production Environment
1. Backend is already deployed with new security measures
2. Deploy frontend changes
3. Monitor for authentication errors
4. Have rollback plan ready (though changes are backward compatible)

---

## 💡 Additional Recommendations

### 1. Remove Unused Code
After migration, consider removing:
- Functions that retrieve vendor ID from localStorage for API calls
- State variables that store vendor ID for authenticated requests
- Any vendor ID validation logic for dashboard routes

### 2. Improve Error Handling
```javascript
// Add global error interceptor
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Clear any local state
      localStorage.removeItem('vendor');
      // Redirect to login
      window.location.href = '/vendor-auth/login';
    }
    return Promise.reject(error);
  }
);
```

### 3. Add Loading States
```javascript
const [loading, setLoading] = useState(true);
const [vendor, setVendor] = useState(null);

useEffect(() => {
  const fetchVendorData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/vendors/get-vendor', {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        setVendor(data.data);
      }
    } catch (error) {
      console.error('Error fetching vendor:', error);
    } finally {
      setLoading(false);
    }
  };
  
  fetchVendorData();
}, []);
```

---

## 📞 Support

If you encounter any issues during migration:

1. Check the `SECURITY_AUDIT_REPORT.md` for detailed backend changes
2. Review the `AUTH_REFERENCE.md` for authentication patterns
3. Test API endpoints directly using Postman/Thunder Client
4. Check browser DevTools for cookie and network issues

---

**Migration Priority**: 🔴 **HIGH**  
**Estimated Effort**: 1-2 hours  
**Breaking Changes**: None (if done correctly)  
**Testing Required**: Yes (comprehensive)

---

**Prepared By**: Backend Team  
**Last Updated**: 2026-01-24  
**Status**: Ready for Frontend Implementation
