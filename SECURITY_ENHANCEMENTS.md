# Security & Hybrid Auth Enhancements - Summary

**Date:** January 31, 2026
**Status:** ✅ IMPLEMENTED

---

## 🔒 1. Secure Hybrid Authentication
We have transitioned to a **Two-Token System** to improve security and stability:

- **Refresh Token (HttpOnly Cookie):**
  - **Lifetime:** 7 Days (Long-lived)
  - **Purpose:** Persistent session authority.
  - **Storage:** Secure, HttpOnly, Partitioned Cookie (iOS optimized).
  - **Role:** Primary source of truth for "Stay Logged In".

- **Access Token (Response Body):**
  - **Lifetime:** 30 Minutes (Short-lived)
  - **Purpose:** authorize API requests.
  - **Storage:** Client memory (or transient storage).
  - **Role:** Used for authorization headers (Bearer token) if needed in future frontend updates.

**Changes Applied:**
- Created `utils/generateTokens.js` for standardized token generation.
- Updated `otp.verification.controller.js` (User Login).
- Updated `vendor.auth.controller.js` (Vendor Login).
- Updated `admin.controller.js` (Admin Login).

---

## 🛡️ 2. CSP & XSS Hardening
We replaced the disabled CSP with a **Targeted Content Security Policy**:

```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://grub-dash-frontend-xi.vercel.app"], // Allow frontend
    styleSrc: ["'self'", "'unsafe-inline'"], // Allow UI frameworks
    imgSrc: ["'self'", "data:", "https:"], // Allow images
    connectSrc: ["'self'", "https://grub-dash-frontend-xi.vercel.app"], // API calls
    // ...
  }
}
```
**Impact:**
- **Prevents XSS:** Blocks unauthorized scripts.
- **iOS Compatible:** Carefully configured `connectSrc` ensures iOS apps/browsers can still communicate.

---

## 🧱 3. Security Headers
Added strict headers to every response:

1. `X-Content-Type-Options: nosniff` - Prevents MIME sniffing.
2. `X-Frame-Options: DENY` - Prevents Clickjacking (site cannot be embedded in iframes).
3. `Referrer-Policy: strict-origin-when-cross-origin` - Protects user privacy.

---

## ✅ Backward Compatibility
- **Existing Clients:** Continue to use the `token` cookie (now serving as the Refresh Token) exactly as before. logic remains unchanged for them.
- **New/iOS Clients:** Can utilize the hybrid flow for better stability if needed.

**Files Modified:**
- `utils/generateTokens.js` (New)
- `controller/otp.verification.controller.js`
- `controller/vendor/vendor.auth.controller.js`
- `controller/Admin/admin.controller.js`
- `index.js`

**Next Steps:**
- Deploy to test environment.
- Verify User/Vendor/Admin login flows.
- Check browser console for any CSP violations (though current policy is permissive enough for standard apps).
