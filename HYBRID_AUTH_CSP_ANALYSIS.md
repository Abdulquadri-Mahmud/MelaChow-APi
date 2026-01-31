# Secure Hybrid Auth + CSP/XSS Hardening - Analysis

## Current State Audit

### Authentication Flow
1. **Primary:** HttpOnly cookies (token, vendorToken, adminToken)
2. **JWT Expiration:** 7 days
3. **Cookie Attributes:** HttpOnly, Secure (prod), SameSite=None, Partitioned (iOS)
4. **CORS:** Credentials enabled for allowed origins

### Security Headers (Current)
- ✅ Helmet enabled (CSP disabled for iOS compatibility)
- ❌ No explicit CSP policy
- ❌ No X-Content-Type-Options
- ❌ No X-Frame-Options
- ❌ No Referrer-Policy

### Identified Gaps
1. **No access token fallback** - Only HttpOnly cookies
2. **No CSP** - Disabled for iOS compatibility
3. **Missing security headers** - XSS/clickjacking vulnerable
4. **Long JWT expiration** - 7 days is too long for access tokens

---

## Proposed Hybrid Model

### Two-Token System

#### 1. **HttpOnly Cookie (Primary Authority)**
- **Purpose:** Session persistence, refresh authority
- **Expiration:** 7 days
- **Attributes:** HttpOnly, Secure, SameSite=None, Partitioned
- **Usage:** Server-side validation only
- **Name:** `refreshToken` (renamed from `token`)

#### 2. **Short-Lived Access Token (Fallback)**
- **Purpose:** Request authorization, client-side checks
- **Expiration:** 30 minutes
- **Delivery:** Response body (NOT cookie)
- **Usage:** Authorization header for API calls
- **Refresh:** Via HttpOnly cookie endpoint

### Benefits
✅ iOS cookie compatibility maintained  
✅ Client-side auth state checking  
✅ Reduced token theft impact (30min vs 7 days)  
✅ Backward compatible (cookies still work)  
✅ No architectural changes  

---

## CSP Strategy

### Challenge
- iOS Safari blocks cookies when CSP is too strict
- Need CSP for XSS protection
- Must not break existing functionality

### Solution: Targeted CSP
```javascript
{
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "https://grub-dash-frontend-xi.vercel.app"],
  styleSrc: ["'self'", "'unsafe-inline'"], // Required for inline styles
  imgSrc: ["'self'", "data:", "https:"], // Allow external images
  connectSrc: ["'self'", "https://grub-dash-frontend-xi.vercel.app"],
  fontSrc: ["'self'", "data:"],
  objectSrc: ["'none'"],
  upgradeInsecureRequests: [],
}
```

**Key Points:**
- Allows frontend origin for API calls
- Permits inline styles (common in React/Next.js)
- Blocks unsafe-eval and most inline scripts
- Upgrades HTTP to HTTPS

---

## Security Headers Implementation

### 1. X-Content-Type-Options
```
X-Content-Type-Options: nosniff
```
Prevents MIME-type sniffing attacks.

### 2. X-Frame-Options
```
X-Frame-Options: DENY
```
Prevents clickjacking attacks.

### 3. Referrer-Policy
```
Referrer-Policy: strict-origin-when-cross-origin
```
Limits referrer information leakage.

### 4. Strict-Transport-Security
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
Enforces HTTPS.

### 5. X-XSS-Protection
```
X-XSS-Protection: 1; mode=block
```
Legacy XSS protection (still useful for older browsers).

---

## Implementation Plan

### Phase 1: Access Token Generation (Non-Breaking)
1. Create utility to generate short-lived access tokens
2. Update auth responses to include access token in body
3. Maintain HttpOnly cookie as primary auth
4. **Backward Compatible:** Existing cookie-only flow still works

### Phase 2: Security Headers (Additive)
1. Enable CSP with targeted policy
2. Add X-Content-Type-Options
3. Add X-Frame-Options
4. Add Referrer-Policy
5. **Non-Breaking:** Headers are additive

### Phase 3: Token Refresh Endpoint (New)
1. Create `/auth/refresh` endpoint
2. Validates HttpOnly cookie
3. Issues new short-lived access token
4. **Non-Breaking:** New endpoint, doesn't affect existing flows

### Phase 4: Validation & Testing
1. Test iOS Safari cookie persistence
2. Verify CSP doesn't block legitimate requests
3. Confirm Android compatibility
4. Validate security headers

---

## Risk Assessment

### Low Risk Changes
✅ Adding access token to response body (additive)  
✅ Adding security headers (additive)  
✅ Creating new refresh endpoint (new feature)  

### Medium Risk Changes
⚠️ Enabling CSP (could block legitimate requests)  
**Mitigation:** Targeted policy, extensive testing  

### Zero Risk
✅ HttpOnly cookies unchanged  
✅ Existing auth flow preserved  
✅ API contracts maintained  

---

## Backward Compatibility Strategy

### Existing Clients (Cookie-Only)
- Continue to work without changes
- HttpOnly cookie remains primary auth
- No breaking changes

### New Clients (Hybrid)
- Can use access token for client-side checks
- Can refresh via `/auth/refresh` endpoint
- Fallback to cookie if token expires

### Migration Path
1. Deploy backend with hybrid support
2. Update frontend to use access tokens (optional)
3. Monitor both flows
4. Gradually migrate clients

---

## Success Criteria

### Authentication
✅ iOS Safari cookie persistence maintained  
✅ Access tokens issued on login/refresh  
✅ 30-minute access token expiration  
✅ 7-day refresh token (cookie) expiration  
✅ No regression on Android  

### Security
✅ CSP enabled without breaking functionality  
✅ All security headers present  
✅ No XSS vulnerabilities  
✅ No clickjacking vulnerabilities  
✅ HTTPS enforced  

### Compatibility
✅ Existing cookie-only clients work  
✅ New hybrid clients work  
✅ No API contract changes  
✅ No architectural changes  

---

## Next Steps

1. Implement access token generation utility
2. Update auth controllers to issue access tokens
3. Create token refresh endpoint
4. Configure CSP with targeted policy
5. Add security headers
6. Test on iOS/Android
7. Deploy and monitor
