# Authentication Quick Reference Guide

## 🔐 How Authentication Works Now

### User Authentication Flow
```
1. POST /api/user/auth/login { email }
   → Sends OTP to email
   
2. POST /api/user/auth/verify-account { email, otp }
   → Sets HTTP-only cookie: "token"
   → Returns user data
   
3. All subsequent requests automatically include cookie
   → Middleware reads req.cookies.token
   → Attaches req.user and req.userId
```

### Vendor Authentication Flow
```
1. POST /api/vendor/auth/login { email }
   → Sends OTP to email
   
2. POST /api/vendor/auth/verify-otp { email, otp }
   → Sets HTTP-only cookie: "vendorToken"
   → Returns vendor data
   
3. All subsequent requests automatically include cookie
   → Middleware reads req.cookies.vendorToken
   → Attaches req.vendor
```

---

## 🛡️ Security Rules for Controllers

### ✅ DO: Use Token-Derived Identity

```javascript
// CORRECT - Protected route
export const getProfile = async (req, res) => {
  const userId = req.userId; // From auth middleware
  const user = await User.findById(userId);
  // ...
}

// CORRECT - Protected vendor route
export const getVendorDashboard = async (req, res) => {
  const vendorId = req.vendor._id; // From vendorAuth middleware
  const vendor = await Vendor.findById(vendorId);
  // ...
}
```

### ❌ DON'T: Accept Identity from Request Input

```javascript
// WRONG - Security vulnerability!
export const getProfile = async (req, res) => {
  const userId = req.query.id; // ❌ User can manipulate this
  const user = await User.findById(userId);
  // ...
}

// WRONG - Fallback allows spoofing!
export const getVendorDashboard = async (req, res) => {
  const id = req.vendor ? req.vendor._id : req.query.id; // ❌ Dangerous
  // ...
}
```

---

## 📝 Route Protection Patterns

### Pattern 1: User-Protected Route
```javascript
// In routes file
import auth from '../middleware/auth.middleware.js';

router.get('/profile', auth, getProfile);
router.patch('/update', auth, updateProfile);
router.delete('/delete', auth, deleteAccount);
```

### Pattern 2: Vendor-Protected Route
```javascript
// In routes file
import vendorAuth from '../middleware/vendor.middleware.js';

router.get('/dashboard', vendorAuth, getDashboard);
router.patch('/update', vendorAuth, updateVendor);
router.get('/orders', vendorAuth, getOrders);
```

### Pattern 3: Public Route (No Auth)
```javascript
// Public routes that accept IDs are OK
router.get('/vendor', getVendorForUserDisplay); // Uses req.query.id
router.get('/food/:id', getFoodById); // Uses req.params.id
```

---

## 🍪 Cookie Configuration Reference

### Current Settings
```javascript
{
  httpOnly: true,              // Prevents JavaScript access
  secure: isProduction,        // HTTPS only in production
  sameSite: isProduction ? "none" : "lax",  // Cross-origin support
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  path: "/"                    // Available on all routes
}
```

### Why These Settings?
- **httpOnly**: Protects against XSS attacks
- **secure**: Ensures cookies only sent over HTTPS
- **sameSite: "none"**: Required for Vercel frontend (different domain)
- **path: "/"**: Ensures cookie sent with all API requests

---

## 🔍 Debugging Authentication Issues

### Issue: "Unauthorized. Token missing or invalid"

**Check:**
1. Is the cookie being set on login?
   ```javascript
   // In browser DevTools → Application → Cookies
   // Should see: "token" or "vendorToken"
   ```

2. Is the cookie being sent with requests?
   ```javascript
   // In browser DevTools → Network → Request Headers
   // Should see: Cookie: token=...
   ```

3. Is CORS configured correctly?
   ```javascript
   // Frontend must use:
   fetch(url, { credentials: 'include' })
   // or
   axios.defaults.withCredentials = true
   ```

### Issue: Cookie Not Being Set

**Check:**
1. Is `NODE_ENV` set correctly?
2. Is the frontend on HTTPS in production?
3. Is the backend on HTTPS in production?
4. Are both domains in the CORS whitelist?

---

## 🚨 Common Mistakes to Avoid

### Mistake 1: Accepting User-Provided IDs
```javascript
// ❌ WRONG
const userId = req.body.userId || req.query.userId;

// ✅ CORRECT
const userId = req.userId; // From middleware only
```

### Mistake 2: Forgetting Middleware
```javascript
// ❌ WRONG - Route not protected
router.delete('/delete-account', deleteAccount);

// ✅ CORRECT
router.delete('/delete-account', auth, deleteAccount);
```

### Mistake 3: Inconsistent Cookie Names
```javascript
// ❌ WRONG - Different names
res.cookie('authToken', token); // Setting
const token = req.cookies.token; // Reading

// ✅ CORRECT - Same names
res.cookie('token', token);
const token = req.cookies.token;
```

### Mistake 4: Wrong Cookie Settings on Logout
```javascript
// ❌ WRONG - Settings don't match
res.clearCookie('token', { httpOnly: true }); // Missing other options

// ✅ CORRECT - Exact same settings
res.clearCookie('token', {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/"
});
```

---

## 📚 Middleware Reference

### User Auth Middleware (`auth.middleware.js`)
**Reads**: `req.cookies.token`  
**Attaches**: 
- `req.user` (full user object)
- `req.userId` (user ID string)

**Usage**:
```javascript
import auth from '../middleware/auth.middleware.js';
router.get('/protected', auth, controller);
```

### Vendor Auth Middleware (`vendor.middleware.js`)
**Reads**: `req.cookies.vendorToken`  
**Attaches**: 
- `req.vendor` (full vendor object)

**Usage**:
```javascript
import vendorAuth from '../middleware/vendor.middleware.js';
router.get('/protected', vendorAuth, controller);
```

---

## 🧪 Testing Checklist

### Manual Testing
- [ ] Login sets cookie in browser
- [ ] Cookie persists across page refreshes
- [ ] Protected routes work with cookie
- [ ] Protected routes fail without cookie
- [ ] Logout clears cookie
- [ ] Cannot access other users' data

### Automated Testing
```javascript
// Example test
describe('User Authentication', () => {
  it('should set HTTP-only cookie on login', async () => {
    const res = await request(app)
      .post('/api/user/auth/verify-account')
      .send({ email: 'test@example.com', otp: '123456' });
    
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toContain('token=');
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
  });
});
```

---

## 🔗 Related Files

- `middleware/auth.middleware.js` - User authentication
- `middleware/vendor.middleware.js` - Vendor authentication
- `utils/sendTokenCookie.js` - Cookie configuration
- `controller/user/user.controller.js` - User auth controllers
- `controller/vendor/vendor.auth.controller.js` - Vendor auth controllers
- `index.js` - CORS configuration

---

**Last Updated**: 2026-01-24  
**Maintained By**: Backend Team
