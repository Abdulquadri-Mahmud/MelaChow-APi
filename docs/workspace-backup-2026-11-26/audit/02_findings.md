# Phase 3 & 4: Adversarial Security & Quality Findings

**Scope:** `MelaChow-API-staging` (canonical backend), `MelaChow-Admin`, `MelaChow-Frontend`, `MelaChow-Vendor`, `MelaChow-Rider`, plus diff-only check of `MelaChow-APi`.
**Deployment mapping (user-confirmed):**
- **LIVE PROD:** MongoDB + in-house MelaChow riders (`MelaChow-Rider`).
- **STAGING / NEXT RELEASE:** PostgreSQL (`DB_PRIMARY_PROVIDER=postgres`) + SamkaTech logistics (`DELIVERY_PROVIDER=samka`).

All CRITICAL and HIGH findings below are **VERIFIED** by line-level code inspection and automated assertions in [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) (output in [repro_output.txt](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/evidence/repro_output.txt)).

---

## F-01: Infinite Free Wallet Credit via Paystack Reference Replay & Race Condition
- **Severity:** **CRITICAL** (Impact: direct unlimited financial theft / balance inflation × Exploitability: trivial, single authenticated GET request × Likelihood: high)
- **Confidence:** **VERIFIED**
- **Affects:** **LIVE PROD (MongoDB)** (and crashes on STAGING because no Postgres branch exists)
- **Location:** `MelaChow-API-staging/controller/user/wallet.controller.js:93-155`, `routes/wallet/wallet.routes.js:28`
- **What is wrong:** `GET /api/wallet/verify/:reference` (`verifyWalletFunding`) verifies a Paystack reference and credits `req.userId`'s wallet with `data.amount / 100` whenever `data.status === "success"`. It **never** checks:
  1. `data.metadata?.type === "wallet_funding"` (any paid food-order reference `PSK_...` is accepted),
  2. `data.metadata?.userId === String(req.userId)` (any other user's reference is accepted),
  3. `data.currency === "NGN"`,
  4. Global uniqueness of `reference` across all wallets (line 126 only checks `wallet.transactions.find(t => t.description === description)` on the **caller's own wallet**),
  5. Atomic credit (lines 116-141 perform non-atomic `Wallet.findOne` → `wallet.balance += amountPaid` → `wallet.save()`).
- **Attack scenario:**
  1. Attacker places a ₦50,000 food order via Paystack (reference `PSK_ORD123_...`), receives the food, then calls `GET /api/wallet/verify/PSK_ORD123_...`. Their wallet is credited ₦50,000 for free.
  2. Attacker registers Accounts B, C, D and calls `GET /api/wallet/verify/PSK_ORD123_...` (or a single ₦10,000 `W_FUND_...` ref) from each account. Each account is credited the full amount because idempotency is checked only on each caller's own `wallet.transactions` array.
  3. Alternatively, attacker sends 10 concurrent `GET /api/wallet/verify/W_FUND_...` requests from one account to race `Wallet.findOne` / `wallet.save()`.
- **Evidence:** `controller/user/wallet.controller.js:108-141`; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 1.
- **Recommended fix:**
  1. Require `data.metadata?.type === "wallet_funding"`, `String(data.metadata?.userId) === String(req.userId)`, and `String(data.currency).toUpperCase() === "NGN"`.
  2. Store a unique `reference` in a dedicated `WalletFunding` / `PaymentAttempt` collection/table with a **unique index** on `reference` (inserted inside the same transaction as the atomic `$inc` / Prisma `increment` wallet credit).
  3. Add the PostgreSQL implementation before switching production to Postgres.
- **Fix risk:** Low. Legitimate wallet top-ups always set `metadata: { userId, type: "wallet_funding" }` (`wallet.controller.js:64-67`).

---

## F-02: Super-Admin MFA, Lockout, Active-Check & Rate-Limit Bypass via Legacy `POST /api/admin/login`
- **Severity:** **CRITICAL** (Impact: full platform & financial takeover of `super-admin` × Exploitability: trivial HTTP POST × Likelihood: high)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:** `MelaChow-API-staging/routes/Admin/admin.routes.js:65-68`, `controller/Admin/admin.controller.js:98-179`, `index.js:355`
- **What is wrong:** While `POST /api/admin/auth/login` (`admin.auth.controller.js:86-95,147-166`) enforces mandatory email OTP MFA for `super-admin`, checks `admin.isActive`, enforces 5-attempt lockout, and is protected by `authLimiter`, the legacy route `POST /api/admin/login` (`admin.routes.js:65` → `admin.controller.js:98-132`) is **still mounted** and:
  - Issues live `super-admin` `accessToken` + `adminToken`/`adminRefreshToken` cookies **without MFA** (in both MongoDB and PostgreSQL modes),
  - Never checks `admin.isActive` (deactivated admins can still log in),
  - Never checks or increments `loginAttempts`/`lockUntil`,
  - Is **not** covered by `authLimiter` (`index.js:355` only limits `/api/admin/auth`).
  Additionally, legacy `POST /api/admin/forgot-password` and `POST /api/admin/reset-password` (`admin.routes.js:66-67` → `admin.controller.js:137-179`) use `Math.random()` OTPs, have no `otpLimiter`, no attempt counter, and no password minimum length check.
- **Attack scenario:**
  1. Attacker obtains a `super-admin` password (or brute-forces it via `/api/admin/login` at 300 req/15m without lockout).
  2. Attacker sends `POST /api/admin/login` with `{ email, password }`.
  3. Server skips email OTP MFA completely and returns a valid `super-admin` JWT + cookies, granting control over payouts, admin creation, vendor bank details, and platform config.
- **Evidence:** `routes/Admin/admin.routes.js:65-68`, `controller/Admin/admin.controller.js:98-132`; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 2.
- **Recommended fix:** Delete `router.post("/login")`, `router.post("/forgot-password")`, `router.post("/reset-password")`, and `router.post("/logout")` from `routes/Admin/admin.routes.js:65-68` (or return `410 Gone`) so all admin auth flows exclusively through `/api/admin/auth/*`.
- **Fix risk:** Low — verify `MelaChow-Admin` frontend only calls `/api/admin/auth/*` before removing.

---

## F-03: Unauthenticated Vendor Creation with Full Mass Assignment (`POST /api/vendors/create`)
- **Severity:** **CRITICAL** (Impact: arbitrary pre-approved live vendor creation, storefront/payout abuse × Exploitability: trivial unauthenticated POST × Likelihood: high)
- **Confidence:** **VERIFIED**
- **Affects:** **LIVE PROD (MongoDB)**
- **Location:** `MelaChow-API-staging/routes/vendor/vendor.routes.js:33`, `controller/vendor/vendor.controller.js:115-170`
- **What is wrong:** `POST /api/vendors/create` has **no authentication middleware** and spreads raw `req.body` directly into `vendorModel.create(enrichedVendorData)` (`vendor.controller.js:118,151-169`).
- **Attack scenario:**
  1. Unauthenticated attacker sends `POST /api/vendors/create` with `{ email, password, storeName, verified: true, isApproved: true, isLive: true, active: true, payoutDetails: { payoutEnabled: true, ... } }`.
  2. Server creates the vendor document with attacker-controlled approval/verification/live flags and auto-creates a vendor wallet (`lines 171-181`).
  3. Attacker logs in immediately via `POST /api/vendor/auth/login` as an approved, live restaurant without OTP verification or admin review.
- **Evidence:** `routes/vendor/vendor.routes.js:33`, `controller/vendor/vendor.controller.js:115-182`; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 3.
- **Recommended fix:** Remove `POST /api/vendors/create` (all onboarding must use `POST /api/vendor/auth/register`) or restrict it to `superAdminOnly` with an explicit field allowlist.
- **Fix risk:** Low if no frontend calls `/api/vendors/create`.

---

## F-04: Unauthenticated Customer Account Takeover via `POST /api/user/auth/set-password`
- **Severity:** **CRITICAL** (Impact: customer account + wallet takeover × Exploitability: trivial unauthenticated POST knowing only victim email × Likelihood: medium-high for legacy OTP users or users mid-signup)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:** `MelaChow-API-staging/controller/user/user.auth.controller.js:118-233`, `routes/user/user.auth.routes.js:25`
- **What is wrong:** Unlike vendor registration (which issues a one-time `passwordSetupToken`), customer `verifyRegistration` (`lines 150-160`) marks `isVerified = true` with no setup token, and `POST /api/user/auth/set-password` (`lines 172-233`) accepts only `{ email, password }`. If `user.isVerified === true` and `!user.password` (true for all legacy OTP-only users who haven't migrated and any user between OTP verification and password setup), it sets the attacker's password and returns live `accessToken` + `refreshToken` cookies.
- **Attack scenario:**
  1. Attacker submits `POST /api/user/auth/set-password` with `{ email: "victim@example.com", password: "AttackerPassword123" }`.
  2. If the victim is a verified user without a password set, the attacker immediately hijacks the account and receives a valid 7-day JWT and 30-day refresh cookie, gaining access to the victim's wallet balance and saved addresses.
- **Evidence:** `controller/user/user.auth.controller.js:172-233`; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 4.
- **Recommended fix:** Mirror `vendor.auth.controller.js:353-436`: issue a cryptographically random 30-minute `passwordSetupToken` from `verifyRegistration` and require a matching, unexpired `passwordSetupToken` in `setPassword`.
- **Fix risk:** Medium — requires coordinated update to `MelaChow-Frontend` `SetPassword.jsx` to pass `passwordSetupToken`.

---

## F-05: Unapproved Vendor Bypasses Admin Approval via Forgot Password
- **Severity:** **HIGH** (Impact: unapproved vendors gain live authenticated vendor sessions × Exploitability: trivial × Likelihood: high)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:** `MelaChow-API-staging/controller/vendor/vendor.auth.controller.js:609-779`, `middleware/vendor.middleware.js:70`
- **What is wrong:** `loginVendorWithPassword` (`line 532`) and `setVendorPassword` (`line 450`) block unapproved vendors (`!vendor.isApproved`). However, `vendorForgotPasswordNew` (`line 620`) only requires `verified: true`, and `resetVendorPasswordNew` (`lines 738-741, 763-774`) issues live `accessToken` + `refreshToken` **without checking `vendor.isApproved` or `vendor.suspended`**. Worse, `middleware/vendor.middleware.js:70` only checks `if (!vendor.active || vendor.suspended || vendor.deletedAt)` — it **never** checks `vendor.isApproved`.
- **Attack scenario:**
  1. Attacker registers a vendor, verifies email OTP (`verified: true`, `isApproved: false`).
  2. Attacker calls `POST /api/vendor/auth/forgot-password` → `/verify-reset-code` → `/reset-password`.
  3. Server returns a live vendor JWT + cookies. Attacker calls authenticated `/api/vendors/*` and `/v1/menu/*` endpoints, passing `authVendor`.
- **Evidence:** `controller/vendor/vendor.auth.controller.js:735-774`, `middleware/vendor.middleware.js:70`; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 5.
- **Recommended fix:** Add `if (!vendor.isApproved)` check in both `middleware/vendor.middleware.js:70` and `resetVendorPasswordNew` (`lines 737, 762`) — and also check `vendor.suspended || !vendor.active` in `resetVendorPasswordNew`.
- **Fix risk:** Low. Unapproved vendors are already supposed to be blocked from logging in.

---

## F-06: Vendor Bank-Account Lock (`BANK_DETAILS_LOCKED`) Completely Bypassed via `DELETE /api/wallet/bank-account`
- **Severity:** **HIGH** (Impact: compromised vendor account can swap payout bank details and drain earnings × Exploitability: trivial 2-step API call × Likelihood: medium-high)
- **Confidence:** **VERIFIED**
- **Affects:** **LIVE PROD (MongoDB)** (and crashes on STAGING because Mongoose-only)
- **Location:** `MelaChow-API-staging/routes/wallet/wallet.routes.js:40-41`, `controller/wallet/bankAccount.controller.js:80-85, 122-153`
- **What is wrong:** `saveBankAccount` (`lines 77-85`) explicitly locks registered bank details so vendors cannot self-service change them (`BANK_DETAILS_LOCKED`). Directly underneath, `removeBankAccount` (`lines 122-153`, mounted at `DELETE /api/wallet/bank-account`) allows any authenticated vendor to delete their own bank details (`payoutEnabled: false`, `accountNumber: ""`), immediately unlocking `POST /api/wallet/bank-account`.
- **Attack scenario:**
  1. Attacker compromises a vendor session (e.g., via XSS stealing `localStorage` token).
  2. Attacker calls `DELETE /api/wallet/bank-account` → bank details cleared.
  3. Attacker calls `POST /api/wallet/bank-account` with attacker's NUBAN → then `POST /api/wallet/withdraw` drains the vendor's wallet.
- **Evidence:** `routes/wallet/wallet.routes.js:41`, `controller/wallet/bankAccount.controller.js:80-85,122-148`; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 6.
- **Recommended fix:** Remove `DELETE /api/wallet/bank-account` (or restrict bank removal/changes to `superAdminOnly` via `/api/admin/vendors/payout-details`).
- **Fix risk:** Low — intended policy already requires admin intervention for bank changes.

---

## F-07: Staging (PostgreSQL) Release Blockers — Core Paths Still Hardcoded to Disconnected Mongoose
- **Severity:** **CRITICAL (for Staging → Prod Migration)** (Impact: vendor signup, Socket.IO real-time updates, wallet funding, bank management, rider password reset, and BullMQ escrow/auto-cancel workers all crash with 500/errors when `DB_PRIMARY_PROVIDER=postgres` × Exploitability: automatic on normal user flows × Likelihood: 100%)
- **Confidence:** **VERIFIED**
- **Affects:** **STAGING / NEXT RELEASE (PostgreSQL mode)**
- **Location:**
  - `controller/vendor/vendor.auth.controller.js:166` (`registerVendor` calls `Vendor.findOne` before `if (postgresVendorIdentityEnabled())` at line 175)
  - `controller/riderAuth.controller.js:212-215` (`forgotRiderPassword` references undefined `req.rider._id`, `subscription`, `deviceType`)
  - `socket/socketServer.js:110-118` (Socket.IO auth queries Mongoose `Rider`/`Vendor`/`Admin`/`User` directly; also omits `finance-admin` and `isTokenBlocked`)
  - `controller/user/wallet.controller.js:116,168` (`verifyWalletFunding` & `creditUserWallet` are Mongoose-only)
  - `controller/wallet/bankAccount.controller.js:72,124` (`saveBankAccount` & `removeBankAccount` are Mongoose-only)
  - `controller/order/createOrderV2.controller.js:1963` (`releaseEscrowToVendor` called by `workers/index.js:22` is Mongoose-only)
  - `workers/index.js:64-108` (`orderAutoCancelWorker` is Mongoose-only)
- **Attack / failure scenario:** When `DB_PRIMARY_PROVIDER=postgres`, `index.js:547-550` skips `connectDB()` and sets `mongoose.set("bufferCommands", false)`. Every Mongoose call throws immediately. Every new vendor signup returns HTTP 500, every WebSocket connection fails auth, wallet top-ups fail, and rider password resets throw `TypeError`.
- **Evidence:** Cited lines above; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 8.
- **Recommended fix:**
  1. Move `if (postgresVendorIdentityEnabled())` above line 166 in `vendor.auth.controller.js`.
  2. Remove misplaced `notificationRepository.saveSubscription` from `forgotRiderPassword` (`riderAuth.controller.js:212-215`) and move it into `subscribeRider`.
  3. Port `socketServer.js` auth (including `finance-admin` + `isTokenBlocked`), `wallet.controller.js`, `bankAccount.controller.js`, `releaseEscrowToVendor`, and `orderAutoCancelWorker` to PostgreSQL repositories.
- **Fix risk:** Medium — requires integration testing under `DB_PRIMARY_PROVIDER=postgres` before cutover.

---

## F-08: Customer Order Verification IDOR (`POST /api/orders/v2/verify/:reference` & `/verify/:reference`)
- **Severity:** **HIGH** (Impact: cross-customer PII disclosure — delivery address, phone, order contents — plus ability to force-fail pending orders × Exploitability: low-medium, requires payment reference × Likelihood: medium)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:** `MelaChow-API-staging/controller/order/orderController.js:67-172, 967-1058, 1171-1366`
- **What is wrong:** `verifyPayment`, `verifyPaymentV2`, and `handlePostgresPaymentVerification` look up the order by `req.params.reference` without checking that `String(order.userId) === String(req.userId)`. They return the full `order` object (including PII) to any authenticated customer.
- **Attack scenario:** Customer A calls `POST /api/orders/v2/verify/<CustomerB_Reference>` with their own Bearer token and receives Customer B's full order and delivery address/phone.
- **Evidence:** `controller/order/orderController.js:1190-1213, 1347-1356`; [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs) REPRO 7.
- **Recommended fix:** Immediately after loading `order`, verify `String(order.userId) === String(req.userId)` (or `order.user?.legacyMongoId === String(req.userId)` in Postgres); return `403` otherwise.
- **Fix risk:** Low.

---

## F-09: Admin Sub-Role Escalation (`adminAuth` Bypasses `superAdminOnly` & `financeAdminOnly`)
- **Severity:** **HIGH** (Impact: standard ops admin can force-fail withdrawals, credit arbitrary wallet amounts, approve/retry payouts, trigger payout sweeps, and mutate platform config × Exploitability: trivial for any standard `admin` account × Likelihood: medium)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:**
  - `routes/wallet/wallet.routes.js:46` (`PATCH /api/wallet/admin/withdrawals/:withdrawalId/force-fail` uses `adminAuth`, bypassing `superAdminOnly` on `routes/Admin/admin.routes.js:123`)
  - `routes/wallet/wallet.routes.js:31` (`POST /api/wallet/admin/credit` uses `adminAuth`, no positive-number validation, no `ActivityLog`)
  - `routes/Admin/admin.routes.js:120-122, 131, 140` (`retryWithdrawal`, `approvePendingWithdrawal`, `updateAdminPlatformConfig`, `POST /api/admin/payouts/trigger` all use `adminAuth`)
  - `routes/Admin/samkaLogisticsAdmin.routes.js:6` (all Samka rider/delivery mutations use `adminAuth`, no `ActivityLog`)
- **Attack scenario:** A standard `admin` (who is intentionally barred from `PATCH /api/admin/withdrawals/:id/force-fail` by `superAdminOnly`) simply calls `PATCH /api/wallet/admin/withdrawals/:id/force-fail` or `POST /api/wallet/admin/credit` to inflate wallets or trigger payouts.
- **Evidence:** Cited route lines above.
- **Recommended fix:** Remove duplicate `/api/wallet/admin/withdrawals/:withdrawalId/force-fail`, enforce `superAdminOnly` or `financeAdminOnly` on all financial/config mutations, validate `Number.isFinite(amount) && amount > 0` in `creditUserWallet`, and write `ActivityLog` entries.
- **Fix risk:** Low — verify admin role matrix with ops team.

---

## F-10: Refresh Tokens Are Never Revoked on Logout & Never Checked Against Blocklist (All 4 Roles)
- **Severity:** **HIGH** (Impact: 30-day stolen refresh token stays valid forever after logout, continuously minting 7-day access tokens × Exploitability: moderate, requires stolen cookie × Likelihood: medium)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:**
  - Logout handlers: `controller/auth.controller.js:11`, `controller/vendor/vendor.auth.controller.js:825,840`, `controller/Admin/admin.auth.controller.js:525,540`, `controller/riderAuth.controller.js:102`
  - Refresh handlers: `controller/user/user.auth.controller.js:552-589`, `controller/vendor/vendor.auth.controller.js:785-818`, `controller/Admin/admin.auth.controller.js:478-518`, `controller/riderAuth.controller.js:137-160`
  - `middleware/tokenBlocklist.js:28-41` (fails open if Redis is down)
- **What is wrong:** None of the 4 logout handlers block the `*RefreshToken` cookie (or Bearer tokens in user/vendor/admin logout). None of the 4 refresh handlers call `isTokenBlocked(token)` or rotate the refresh token. `logoutAdmin` and `vendorLogout` also clear cookies with `sameSite: "lax"` instead of `"none"` in production.
- **Recommended fix:** Block both access and refresh tokens on logout; check `isTokenBlocked(token)` in all 4 refresh endpoints; rotate refresh tokens on use (and block the old one); align `clearCookie` attributes with `sendTokenCookie.js`.
- **Fix risk:** Low.

---

## F-11: Live Secrets Committed in Git History + Uncommitted Google Maps Key in `MelaChow-APi/.env.example`
- **Severity:** **HIGH** (Impact: credential compromise of Paystack live/test keys, MongoDB URI, and Google Maps billing × Exploitability: trivial for anyone with git read access × Likelihood: medium-high)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:**
  - `MelaChow-API-staging` git history: `sk_live_` in commits `e469672`, `584d962`; `sk_test_` in 4 commits; `mongodb+srv://` in 3 commits ([git_history_secrets.txt](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/evidence/git_history_secrets.txt)).
  - `MelaChow-APi/.env.example` (uncommitted working-tree edit): literal `GOOGLE_MAP_API_KEY=AIzaSy...` pasted into tracked template file.
- **Recommended fix:** Rotate all historically committed Paystack live/test keys and MongoDB credentials immediately (if not already rotated), remove the literal Google Maps key from `MelaChow-APi/.env.example`, and consider rewriting history with `git filter-repo` if repo access is broad.
- **Fix risk:** Medium during rotation (coordinate Render env var updates before revoking old keys).

---

## F-12: `POST /api/user/auth/signup` Role Mass Assignment & Legacy User Password Double-Hashing
- **Severity:** **HIGH** (Impact: unauthenticated registration with arbitrary `role: "admin"` in `User` collection; legacy password reset locks users out via double bcrypt hashing × Exploitability: trivial × Likelihood: medium)
- **Confidence:** **VERIFIED**
- **Affects:** **LIVE PROD (MongoDB)**
- **Location:** `routes/user.routes.js:28,37-38`, `controller/user/user.controller.js:193-234, 248-275`, `model/user.model.js:69,81-96`
- **What is wrong:** `POST /api/user/auth/signup` passes `req.body.role` directly to `new User({ ..., role })`, and `UserSchema` (`model/user.model.js:69`) has no `enum` on `role`. Meanwhile, legacy `POST /api/user/auth/reset-password` (`user.controller.js:219-227`) manually calls `bcryptjs.hashSync(password, 10)` and assigns it to `user.password` before `await user.save()`, triggering `UserSchema.pre('save')` (`model/user.model.js:81-96`) which bcrypt-hashes the hash a second time.
- **Recommended fix:** Remove or disable (`410 Gone`) legacy routes in `routes/user.routes.js:28-38` (`signup`, `login`, `verify-account`, `forgot-password`, `reset-password`), and add `enum: ["user"]` on `UserSchema.role`.
- **Fix risk:** Low if `MelaChow-Frontend` uses `/register`, `/login-password`, `/forgot-password-new`, `/reset-password-new`.

---

## F-13: Raw JWT Access Tokens Persisted in `localStorage` Across All 4 Frontends (Defeating `httpOnly` Cookies)
- **Severity:** **HIGH** (Impact: any XSS in Admin, Vendor, Customer, or Rider web apps immediately steals 7-day JWTs × Exploitability: requires XSS, e.g., via unescaped `<` in `JsonLd.jsx:12` or compromised dependency × Likelihood: medium)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:** `MelaChow-{Admin,Frontend,Vendor,Rider}/src/app/lib/auth-token.js:8-44`, `MelaChow-Frontend/src/app/lib/api.js:9-29`, `MelaChow-Admin/src/app/lib/adminApi.js:20-29`, `MelaChow-API-staging/utils/jwt.js:7`
- **What is wrong:** Despite comments claiming `httpOnly` cookie XSS protection and "short-lived" access tokens, every frontend persists raw 7-day JWTs in `localStorage` (`melachow_*_token_v1`) and sends `Authorization: Bearer`. Web apps already proxy `/api/*` through Next.js rewrites specifically to make `httpOnly` cookies first-party!
- **Recommended fix:** Remove `localStorage` JWT persistence for web builds (rely on first-party `httpOnly` cookies via Next.js proxy; keep Bearer tokens only in Capacitor native secure storage), and reduce `JWT_EXPIRES_IN` from `7d` to `15m–1h` (especially for Admin).
- **Fix risk:** Medium — verify iOS Safari PWA cookie flow after removing `localStorage` fallback.

---

## F-14: Production Dependency Vulnerabilities (`npm audit`: 54 Backend, 9–10 per Frontend)
- **Severity:** **HIGH** (Impact: known CVEs in `mongoose` [CRITICAL], `proxy-addr` [CRITICAL], `axios`, `express-rate-limit`, `multer`, `nodemailer`, `cloudinary`, `socket.io-parser`, `ws`, `jws` × Exploitability: varies by vector × Likelihood: medium-high)
- **Confidence:** **VERIFIED**
- **Affects:** **BOTH LIVE PROD & STAGING**
- **Location:** `MelaChow-API-staging/package-lock.json` (`2 CRITICAL, 22 HIGH, 29 MODERATE, 1 LOW`), `MelaChow-Admin/package-lock.json` (`1 CRITICAL, 5 HIGH`), `MelaChow-Frontend/package-lock.json` (`1 CRITICAL, 6 HIGH`), `MelaChow-Vendor/package-lock.json` (`1 CRITICAL, 5 HIGH`).
- **Evidence:** Raw JSON outputs saved in `audit/evidence/npm_audit_*.json`. Notable live-reachable advisories: `proxy-addr` IPv4-mapped IPv6 IP spoofing (critical for `trust proxy: 1` + rate limiting), `express-rate-limit` IPv4-mapped IPv6 bypass, `mongoose` prototype pollution / `$nor` filter sanitization bypass, `multer` DoS, `cloudinary` argument injection.
- **Recommended fix:** Upgrade `mongoose`, `axios`, `express-rate-limit`, `multer`, `nodemailer`, `cloudinary`, `socket.io`, `next` (and lockfiles) to patched releases, then re-run `npm audit --omit=dev`.
- **Fix risk:** Medium — test Express 5 / Mongoose / Next.js upgrades in staging first.

---

## F-15: Support Refund Accounting Double-Debit Bug (MongoDB) & Missing Samka Cancellation Refund (Staging)
- **Severity:** **MEDIUM-HIGH** (Impact: financial ledger corruption / stranded customer funds × Exploitability: operational trigger × Likelihood: high on refunds/cancellations)
- **Confidence:** **VERIFIED**
- **Affects:** `supportRefundSettlement.service.js` → **LIVE PROD (MongoDB)**; `samkaLogistics.service.js` → **STAGING (Samka)**
- **Location:**
  - `MelaChow-API-staging/services/supportRefundSettlement.service.js:50-96`
  - `MelaChow-API-staging/services/logistics/samkaLogistics.service.js:325-349`
- **What is wrong:**
  1. In `settleSupportRefund` (Mongo), when vendor/rider liability is debited from their wallet (`lines 72, 82`), `adminWallet` is still debited for the full `amount` (`line 91`) without crediting `adminWallet` back for the recovered partner share — causing net money destruction in the ledger.
  2. In `samkaLogistics.service.js:325-349` (`applyTerminalStatus`), when Samka cancels or fails a delivery (`status 9` or `10`), MelaChow marks the order `cancelled`/`failed` **without refunding the customer's wallet or reassigning**, stranding customer funds in `adminWallet`.
- **Recommended fix:** (1) In `settleSupportRefund`, debit `adminWallet` only for `(amount - totalRecoveredFromPartnerWallets)` or credit `adminWallet` for partner wallet recoveries; (2) define and implement explicit refund/reassignment behavior on Samka terminal `cancelled`/`failed` statuses.
- **Fix risk:** Medium — reconcile existing historical `SupportRefundSettlement` ledger entries after fixing.

---

## F-16: Cryptographic & Operational Hygiene Issues (Grouped MEDIUM Findings)
- **Severity:** **MEDIUM** | **Confidence:** **VERIFIED** | **Affects:** **BOTH**
1. **`BYPASS_OTP=true` has no `NODE_ENV !== 'production'` guard** (`services/otp.service.js:104`): if accidentally set in prod, all delivery OTPs become `'123456'`.
2. **Non-cryptographic `Math.random()` used for 6-digit OTPs in 8 locations** (`services/otp.service.js:120`, `controller/Admin/admin.controller.js:140,144`, `controller/user/user.controller.js:33,127,137,292,355`). Replace with `crypto.randomInt(100000, 1000000)`.
3. **Plaintext OTP logged to stdout** (`controller/riderAuth.controller.js:256`, `controller/user/user.controller.js:42`).
4. **Non-constant-time Paystack webhook HMAC comparison (`!==`)** (`controller/order/orderController.js:2287`) — replace with `crypto.timingSafeEqual`.
5. **Missing `axios` timeouts on all Paystack HTTP calls** (`orderController.js:82,1048,1251`, `createOrderV2.controller.js:2287,2399`, `wallet.controller.js:57,99`, `withdrawal.controller.js:205`) — a Paystack stall hangs Express workers indefinitely.
6. **Stack trace leaked in HTTP 500 response** (`controller/wallet/withdrawal.controller.js:302`: `stack: error.stack`).
7. **In-memory rate limiting & missing `otpLimiter` on aliases** (`index.js:254-364`): rate limiters reset on restart and don't share state across instances; `/api/vendor/auth/verify-reset`, `/api/auth/rider/verify-reset-code`, `/api/admin/auth/login/verify`, and `/api/user/auth/verify-account` are omitted from `otpLimiter`.
8. **BullMQ connection sharing violation** (`jobs/scheduledPayout.job.js:108,285`, `workers/broadcastTimeout.worker.js:87`, `deliveryWatchdog.worker.js:154`, `disputeEscalation.worker.js:65`): Workers/Queues share `bullmqRedisConnection` without `.duplicate()`.
9. **Unauthenticated Nigerian bank account name enumeration** (`routes/wallet/wallet.routes.js:35`: `GET /api/wallet/public/resolve-account`).
10. **Tauri Vendor Desktop WebView has `"csp": null` pointing at remote URL** (`MelaChow-Vendor/src-tauri/tauri.conf.json:552,569`) and **JSON-LD XSS edge case** (`JsonLd.jsx:12` does not escape `<` as `\u003c`).
11. **Dead/unmounted & stray artifacts:** `MelaChow-Vendor/MelaChow-vendor-debug.apk` committed to git; stray `debug-cookies.js`, `fix.js`, `fix2.js`, `test-vendor-auth.js` committed across Frontend/Vendor/Rider; `POST /api/transactions/initialize` (`transaction.controller.js:12-69`) still accepts client-controlled `amount`.
