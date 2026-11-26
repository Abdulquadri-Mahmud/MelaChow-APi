# Module Comprehension: Auth, Sessions, OTP & Identity

**Scope:** `middleware/*.js`, `utils/jwt.js`, `utils/generateTokens.js`, `utils/sendTokenCookie.js`, `controller/auth.controller.js`, `controller/otp.verification.controller.js`, `controller/user/user.auth.controller.js`, `controller/user/user.controller.js` (auth handlers), `controller/vendor/vendor.auth.controller.js`, `controller/Admin/admin.auth.controller.js`, `controller/riderAuth.controller.js`, `services/otp.service.js`, `services/postgres/riderOtp.repository.js`, and auth route files.

---

## File-by-File Summary

### `utils/jwt.js` (99 LOC) & `utils/generateTokens.js` (21 LOC) & `utils/sendTokenCookie.js` (63 LOC)
- **Purpose:** Signs/verifies HS256 JWTs for all 4 roles using one shared `JWT_SECRET`, generates 6-digit OTPs (`crypto.randomInt`) and 64-hex reset tokens (`crypto.randomBytes(32)`), and sets `httpOnly` auth cookies.
- **Key functions:**
  - `generateAccessToken(userId, role='user')` (`jwt.js:23-33`): signs `{ id, role, type: 'access' }`, expiry `JWT_EXPIRES_IN || '7d'`.
  - `generateRefreshToken(userId, role='user')` (`jwt.js:41-51`): signs `{ id, role, type: 'refresh' }`, expiry `'30d'`.
  - `sendTokenCookie(res, token, cookieName, maxAge)` (`sendTokenCookie.js:26-50`): sets `httpOnly: true`, `secure: NODE_ENV === 'production'`, `sameSite: isProduction ? 'none' : 'lax'`, `path: '/'`.
- **Hidden coupling:** `JWT_SECRET` is captured at module import time (`const JWT_SECRET = process.env.JWT_SECRET`, `jwt.js:4`), requiring `config/env.js` to be the very first import.

### `middleware/auth.middleware.js` (78 LOC), `vendor.middleware.js` (93 LOC), `adminAuth.js` (73 LOC), `riderAuth.middleware.js` (93 LOC), `multiAuth.middleware.js` (136 LOC), `tokenBlocklist.js` (42 LOC)
- **Purpose:** Authenticate HTTP requests via cookies or `Authorization: Bearer` tokens, check Redis blocklist, and load account state from PostgreSQL or MongoDB.
- **Invariants & anomalies:**
  - `tokenBlocklist.js:28-41`: **Fails open** (`return false`) when `!redisClient.isOpen` or on Redis error.
  - `auth.middleware.js:16`: prefers Bearer header over cookie; checks `decoded.type === 'access'`, `decoded.role === 'user'` (or unset), and `user.isActive && !user.suspended && !user.banned`.
  - `vendor.middleware.js:9,70`: prefers cookie over Bearer; checks `vendor.active && !vendor.suspended && !vendor.deletedAt`, **but does NOT check `vendor.isApproved`**!
  - `adminAuth.js:10,27-39`: prefers cookie over Bearer; allows `admin`, `super-admin`, `finance-admin`; exposes `superAdminOnly`, `financeAdminOnly`, `standardAdminOnly`.
  - `riderAuth.middleware.js:10,55-82`: prefers cookie over Bearer; checks `isActive && !deletedAt && isVerified`.
  - `multiAuth.middleware.js:31-120`: tries user → vendor → admin sequentially; uses unverified `jwt.decode` only to route the Bearer token to the right branch, then verifies with `jwt.verify`.

### `controller/user/user.auth.controller.js` (589 LOC), `controller/user/user.controller.js` (lines 1-350), `controller/auth.controller.js` (56 LOC), `controller/otp.verification.controller.js` (57 LOC)
- **Purpose:** Customer registration, OTP verification, password setup/login/reset, token refresh, and logout (both V2 password flow and legacy OTP flow still mounted in `routes/user.routes.js:28-38`).
- **Critical flaws observed:**
  - `user.auth.controller.js:172-233` (`setPassword`): accepts `{ email, password }` with **no setup token / proof of OTP verification**. Any verified user with `password == null` can be taken over by anyone knowing their email.
  - `user.controller.js:248-275` (`signup`, mounted at `POST /api/user/auth/signup`): passes `role` directly from `req.body` into `new User({ ..., role })` (mass assignment).
  - `user.auth.controller.js:552-589` (`refreshToken`): never checks `isTokenBlocked(token)`, never checks `decoded.role === 'user'`, never checks `user.suspended || user.banned`, never rotates refresh token.
  - `auth.controller.js:8-36` (`logout`): only blocks `req.cookies?.token` (ignores `refreshToken` and `Authorization: Bearer` header).
  - `user.controller.js:127,137,292` uses `Math.random()` for OTPs; `user.controller.js:42` logs plaintext OTP; `user.controller.js:219-227` pre-hashes password with `bcryptjs.hashSync` before `user.save()`.

### `controller/vendor/vendor.auth.controller.js` (860 LOC)
- **Purpose:** Vendor onboarding (including Paystack bank resolution & transfer recipient creation), email OTP, password setup (with `passwordSetupToken`), login, password reset, refresh, and logout.
- **Critical flaws observed:**
  - `vendor.auth.controller.js:166`: calls `await Vendor.findOne({ email })` (Mongoose) **before** checking `if (postgresVendorIdentityEnabled())` at line 175 — crashes with 500 in PostgreSQL mode (`STAGING`).
  - `vendor.auth.controller.js:723-779` (`resetVendorPasswordNew`): issues live vendor `accessToken` + `refreshToken` **without checking `vendor.isApproved` or `vendor.suspended`**. Combined with `vendor.middleware.js:70` not checking `isApproved`, an unapproved vendor can bypass admin approval via Forgot Password → Reset Password.
  - `vendor.auth.controller.js:785-860`: `refreshVendorToken` never checks `isTokenBlocked` or rotates refresh token; `vendorLogout` never blocks `vendorRefreshToken` or Bearer tokens and clears `vendorToken` with `sameSite: "lax"` instead of `"none"` in prod.
  - `routes/vendor/vendor.auth.routes.js:43`: alias `/verify-reset` is missing from `otpLimiter` in `index.js:357-364`.

### `controller/Admin/admin.auth.controller.js` (562 LOC)
- **Purpose:** Admin login (with mandatory email OTP MFA for `super-admin`), password reset, token refresh, and logout.
- **Flaws observed:**
  - `admin.auth.controller.js:478-561`: `refreshAdminToken` never checks `isTokenBlocked` or rotates refresh token; `logoutAdmin` never blocks `adminRefreshToken` or Bearer token, and clears `adminToken` with `sameSite: "lax"` in prod.
  - `admin.auth.controller.js:286,290,296,334`: `forgotAdminPassword` returns distinct messages/fields for existing vs non-existing admin emails (account enumeration).
  - `admin.auth.controller.js:359,372`: `verifyAdminResetCode` has no per-account attempt counter or constant-time comparison.
  - `routes/Admin/admin.auth.routes.js:20`: `/api/admin/auth/login/verify` (super-admin MFA verify) is not on `otpLimiter` (only `authLimiter` = 50/15m, though per-account `loginOtpAttempts >= 5` mitigates brute-force).

### `controller/riderAuth.controller.js` (416 LOC)
- **Purpose:** In-house rider login, logout, refresh, `/me`, push subscribe, and password reset.
- **Critical flaws observed:**
  - `riderAuth.controller.js:212-215`: inside `forgotRiderPassword` (unauthenticated!), dead/misplaced code executes `if (usePostgresNotificationWrites()) { await notificationRepository.saveSubscription("rider", req.rider._id, subscription, deviceType, ...); }` — crashes with `ReferenceError`/`TypeError` on STAGING.
  - `riderAuth.controller.js:256`: logs plaintext password-reset OTP (`console.log`) in production.
  - `riderAuth.controller.js:102-116,137-160`: `logoutRider` does not block `riderRefreshToken`; `refreshRiderToken` does not check `isTokenBlocked` or rotate refresh token.
  - `routes/riderAuth.routes.js:14`: `/api/auth/rider/verify-reset-code` is not covered by `otpLimiter`.

### `services/otp.service.js` (206 LOC) & `services/postgres/riderOtp.repository.js` (108 LOC)
- **Purpose:** Manages 6-digit delivery confirmation OTPs using PostgreSQL (`DeliveryOtpSession` with `pg_advisory_xact_lock`) + Redis cache.
- **Flaws observed:**
  - `otp.service.js:104`: `if (process.env.BYPASS_OTP === 'true')` has **no `NODE_ENV !== 'production'` guard**; sets OTP to hardcoded `'123456'`.
  - `otp.service.js:120`: uses `Math.random()` instead of `crypto.randomInt` when emailing delivery OTPs (unlike `ensureDeliveryOTP` at line 44 which uses `crypto.randomInt`).
  - `otp.service.js:28,40,59,172`: hard-depends on Prisma `deliveryOtpSession` even in Mongo-primary mode.

---

## Comprehension Check (5 Non-Obvious Questions & Verified Answers)

1. **Q: Can an unapproved vendor obtain a valid vendor session and call authenticated vendor routes without admin approval?**
   - **A: YES (VERIFIED).** `loginVendorWithPassword` (`vendor.auth.controller.js:532`) blocks unapproved vendors, and `setVendorPassword` (`line 450`) refuses to issue tokens when `!vendor.isApproved`. However, `vendorForgotPasswordNew` (`line 620`) only requires `verified: true` (not `isApproved`), `verifyVendorResetCode` (`line 669`) issues a `resetToken`, and `resetVendorPasswordNew` (`lines 738-741, 763-774`) mints `accessToken` + `refreshToken` without checking `isApproved`. Then `middleware/vendor.middleware.js:70` only checks `if (!vendor.active || vendor.suspended || vendor.deletedAt)` — never `vendor.isApproved`.
2. **Q: After an admin, vendor, user, or rider logs out, can a stolen `refreshToken` cookie still mint new access tokens?**
   - **A: YES (VERIFIED).** None of the 4 logout handlers (`auth.controller.js:11`, `vendor.auth.controller.js:825`, `admin.auth.controller.js:525`, `riderAuth.controller.js:102`) pass the refresh token to `blockToken()`, and none of the 4 refresh endpoints (`user.auth.controller.js:552`, `vendor.auth.controller.js:785`, `admin.auth.controller.js:478`, `riderAuth.controller.js:137`) call `isTokenBlocked()`.
3. **Q: What happens when a new vendor registers on `MelaChow-API-staging` (`DB_PRIMARY_PROVIDER=postgres`)?**
   - **A: It fails with HTTP 500 (VERIFIED).** `registerVendor` executes `await Vendor.findOne({ email: normalizedEmail })` via Mongoose at `vendor.auth.controller.js:166` BEFORE checking `if (postgresVendorIdentityEnabled())` at line 175. Because `index.js:550` sets `mongoose.set("bufferCommands", false)` and skips `connectDB()`, Mongoose throws immediately.
4. **Q: What happens if a customer verifies their email OTP (`verifyRegistration`) and walks away before setting a password?**
   - **A: Anyone who knows their email can take over the account (VERIFIED).** `verifyRegistration` (`user.auth.controller.js:150-160`) sets `isVerified = true` without issuing a one-time setup token. `POST /api/user/auth/set-password` (`user.auth.controller.js:172-233`) only requires `{ email, password }` and immediately returns live `accessToken` + `refreshToken` cookies.
5. **Q: What happens when a rider triggers `POST /api/auth/rider/forgot-password` on staging (`POSTGRES_MIGRATION_ENABLED=true`, `DB_PRIMARY_PROVIDER=postgres`)?**
   - **A: It crashes with a `TypeError`/`ReferenceError` (VERIFIED).** `riderAuth.controller.js:212-215` contains a copy-pasted `notificationRepository.saveSubscription("rider", req.rider._id, subscription, deviceType, ...)` block inside `forgotRiderPassword`, where `req.rider`, `subscription`, and `deviceType` are all undefined.
