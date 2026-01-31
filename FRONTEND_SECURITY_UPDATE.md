# Backend Security Update: Hybrid Auth & CSP

## Context
We have updated the backend to support a **Secure Hybrid Authentication** model and enforced stricter **Content Security Policies (CSP)**. These changes improve security and cross-platform stability (especially for iOS) while maintaining backward compatibility.

## Changes for Frontend Awareness

### 1. Authentication Response Update
Login endpoints now return an **Access Token** in the JSON response body, in addition to setting the HttpOnly cookie.

**Endpoints Affected:**
- `POST /api/user/auth/login` (Verification step)
- `POST /api/vendor/auth/login` (Verification step)
- `POST /api/admin/auth/login`

**New Response Shape:**
```json
{
  "success": true,
  "message": "Login successful...",
  "accessToken": "eyJhbG...", // <--- NEW Short-lived token (30 mins)
  "user": { ... }
}
```

**Frontend Action:**
- **No breaking change:** You can continue relying entirely on the HttpOnly cookie (`refreshToken`) as before. exist code should work fine.
- **Optional Enhancement:** You *can* store this `accessToken` in memory (e.g., React Context/State) and send it in the `Authorization: Bearer <token>` header for API requests. This is useful for:
  - Immediate auth state checks without waiting for a profile fetch.
  - scenarios where cookies might be unstable (though our iOS cookie fixes should prevent that).

### 2. CSP & Security Headers
The backend now enforces strict security headers.

**Headers:**
- `Content-Security-Policy`: Restricts where scripts, styles, and images can load from.
- `X-Frame-Options: DENY`: The app cannot be embedded in an iframe (clickjacking protection).

**Frontend Action:**
- **Check External Assets:** Ensure you aren't loading scripts/images from unauthorized 3rd-party domains (e.g., random CDNs) not whitelisted in our CSP.
  - Allowed: `'self'`, `https://grub-dash-frontend-xi.vercel.app`, `data:` images.
- **Inline Styles:** We allow `'unsafe-inline'` for styles, so Styled Components / Emotion should work fine.
- **Iframes:** If you intentionally embed the app inside another site, this will now fail.

## Summary
These changes are **non-breaking**. Verification is recommended to ensure no aggressive CSP rules are blocking legitimate frontend resources.
