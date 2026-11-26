# Module Comprehension: Routes/RBAC, Workers, Socket.IO & Frontends (P1)

**Scope:** All Express route files (`routes/**`, 480 route lines audited), `workers/*.js`, `socket/socketServer.js`, `socket/rider.socket.js`, and P1 frontend auth/API/Tauri/Capacitor files across `MelaChow-Admin`, `MelaChow-Frontend`, `MelaChow-Vendor`, `MelaChow-Rider`.

---

## 1. Route & RBAC Audit Summary (480 Route Definitions Checked)

### Critical / High Authorization Gaps (VERIFIED)
1. **`POST /api/admin/login`, `POST /api/admin/forgot-password`, `POST /api/admin/reset-password`** (`routes/Admin/admin.routes.js:65-68` → `controller/Admin/admin.controller.js:98-179`):
   - Legacy admin auth routes remain mounted alongside `/api/admin/auth/*`.
   - `loginAdmin` (`admin.controller.js:98-132`) **bypasses `super-admin` email OTP MFA**, **skips `isActive` check**, **skips account lockout**, and **bypasses `authLimiter`** (only `globalLimiter` applies).
   - `forgotPassword` / `resetPassword` (`lines 137-179`) use `Math.random()` OTPs, have no `otpLimiter`, no attempt limit, and no password strength check.
2. **`POST /api/vendors/create`** (`routes/vendor/vendor.routes.js:33` → `controller/vendor/vendor.controller.js:115-170`):
   - **Unauthenticated** endpoint that spreads raw `req.body` into `vendorModel.create(enrichedVendorData)` (mass assignment of `verified`, `isApproved`, `isLive`, `active`, `payoutDetails`, etc.).
3. **`POST /api/user/auth/signup`** (`routes/user.routes.js:28` → `controller/user/user.controller.js:248-275`):
   - **Unauthenticated** legacy route that accepts `role` directly from `req.body` (`model/user.model.js:69` has no enum restriction).
4. **Admin Sub-Role Escalation (`adminAuth` vs `superAdminOnly` / `financeAdminOnly`)**:
   - `PATCH /api/wallet/admin/withdrawals/:withdrawalId/force-fail` (`routes/wallet/wallet.routes.js:46`) uses `adminAuth`, bypassing the `superAdminOnly` guard on the identical `PATCH /api/admin/withdrawals/:withdrawalId/force-fail` (`routes/Admin/admin.routes.js:123`).
   - `POST /api/wallet/admin/credit` (`routes/wallet/wallet.routes.js:31`), `POST /api/admin/finance/withdrawals/:id/retry` (`admin.routes.js:121`), `PATCH /api/admin/finance/withdrawals/:id/approve` (`admin.routes.js:122`), `PUT /api/admin/platform-config` (`admin.routes.js:131`), and `POST /api/admin/payouts/trigger` (`admin.routes.js:140`) all use `adminAuth` rather than `financeAdminOnly` or `superAdminOnly`.
5. **`GET /api/wallet/public/resolve-account`** (`routes/wallet/wallet.routes.js:35`):
   - Unauthenticated Paystack bank account name resolution endpoint (enables Nigerian bank account holder PII enumeration).

## 2. Workers & Socket.IO Comprehension

- **`socket/socketServer.js:110-118`:** Authenticates Socket.IO handshakes by querying Mongoose (`Rider.findById`, `Vendor.findById`, `Admin.findById`, `User.findById`) directly.
  - Does **not** check `isTokenBlocked(token)`.
  - Does **not** include `'finance-admin'` in the admin branch (`line 114`: `role === 'admin' || role === 'super-admin'`) — a `finance-admin` falls into the `else` branch and fails `User.findById`!
  - In **STAGING (`DB_PRIMARY_PROVIDER=postgres`)**, `mongoose.set("bufferCommands", false)` causes **all Socket.IO connections to fail** because MongoDB is not connected.
  - `socket/socketServer.js:20-29`: Socket CORS allowlist omits `https://www.melachow.com`, `https://melachow.com`, `https://admin.melachow.com`, `https://vendor.melachow.com`, `https://rider.melachow.com` (relies only on single `process.env.CLIENT_URL`!).
- **`socket/rider.socket.js:88-135`:** `RIDER_PICKED_UP` and `RIDER_TOGGLE_AVAILABILITY` also query Mongoose directly; `RIDER_DELIVERED` is properly disabled (`lines 152-158`) to force REST OTP confirmation.
- **`workers/index.js:10-134`:** `escrowReleaseWorker` calls Mongoose-only `releaseEscrowToVendor`; `orderAutoCancelWorker` queries Mongoose `Order`/`VendorOrder` directly. In STAGING (Postgres), `cancelStalePostgresOrders` cron handles timeouts, but any job enqueued to `order-auto-cancel` or `escrow-release` will fail.
- **`workers/broadcastTimeout.worker.js`, `deliveryWatchdog.worker.js`, `disputeEscalation.worker.js`:** All three DO have Postgres branches (`usePostgresRiderAssignmentWrites()`), **but** all three share the single `redisConnection` without `.duplicate()` (`broadcastTimeout.worker.js:87`, `deliveryWatchdog.worker.js:154`, `disputeEscalation.worker.js:65`), violating BullMQ's requirement for separate connections per worker/queue.

## 3. Frontends (P1 Surface)

- **Token storage (`MelaChow-{Admin,Frontend,Vendor,Rider}/src/app/lib/auth-token.js`):** All 4 apps persist raw JWT access tokens in `localStorage` (`melachow_*_token_v1`) and attach `Authorization: Bearer` headers (`api.js:9-29`, `adminApi.js:20-29`). Any XSS compromises the 7-day JWT across all roles.
- **Tauri Desktop (`MelaChow-Vendor/src-tauri/tauri.conf.json:552,569`):** Loads remote URL `https://vendors.melachow.com/vendors/dashboard` with `"csp": null`. (Rust backend `src-tauri/src/lib.rs:1-16` exposes no custom IPC commands, limiting native RCE surface, but `"csp": null` weakens WebView XSS defense.)
- **Stray debug/migration scripts committed in Frontend, Vendor, and Rider repos:** `debug-cookies.js`, `fix.js`, `fix2.js`, `test-vendor-auth.js`, `EXAMPLE_API_MIGRATION.js`, `MelaChow-vendor-debug.apk` (binary APK committed to `MelaChow-Vendor`!).

---

## Comprehension Check (5 Non-Obvious Questions & Verified Answers)

1. **Q: Can an attacker who stole a `super-admin`'s password (without access to their email inbox) sign in as `super-admin`?**
   - **A: YES (VERIFIED).** Calling `POST /api/admin/login` (`routes/Admin/admin.routes.js:65` → `controller/Admin/admin.controller.js:98-132`) skips the email OTP MFA enforced by `POST /api/admin/auth/login` and immediately issues `adminToken` + `adminRefreshToken` cookies and `accessToken` in both Mongo (LIVE PROD) and Postgres (STAGING).
2. **Q: Can a standard `admin` (without `super-admin` role) force-fail a withdrawal and restore wallet funds?**
   - **A: YES (VERIFIED).** While `PATCH /api/admin/withdrawals/:withdrawalId/force-fail` requires `superAdminOnly` (`routes/Admin/admin.routes.js:123`), the identical controller `forceFailWithdrawal` is also mounted at `PATCH /api/wallet/admin/withdrawals/:withdrawalId/force-fail` with only `adminAuth` (`routes/wallet/wallet.routes.js:46`).
3. **Q: Why will Socket.IO fail for every user when `MelaChow-API-staging` runs with `DB_PRIMARY_PROVIDER=postgres`?**
   - **A: `socket/socketServer.js:110-118` queries Mongoose (`User.findById`, `Vendor.findById`, `Admin.findById`, `Rider.findById`) directly (VERIFIED).** In Postgres mode, `index.js:547-550` never connects MongoDB and sets `mongoose.set("bufferCommands", false)`, causing every Socket.IO handshake to fail auth.
4. **Q: Can a `finance-admin` connect to Socket.IO even in LIVE PROD (MongoDB)?**
   - **A: NO (VERIFIED).** `socket/socketServer.js:114` only checks `role === 'admin' || role === 'super-admin'`; a `finance-admin` JWT falls into the `else` branch and fails `User.findById(targetId)`.
5. **Q: Can an unauthenticated user create a pre-approved, live vendor in LIVE PROD?**
   - **A: YES (VERIFIED).** `routes/vendor/vendor.routes.js:33` mounts `POST /api/vendors/create` without auth middleware, and `controller/vendor/vendor.controller.js:118,151-169` passes `{ ...req.body, ... }` directly to `vendorModel.create(...)`.
