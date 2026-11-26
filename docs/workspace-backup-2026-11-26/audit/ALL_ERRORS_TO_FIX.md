# MelaChow Master Error & Fix Tracker

Single consolidated list of every verified error discovered across `MelaChow-API-staging`, `MelaChow-APi`, `MelaChow-Admin`, `MelaChow-Frontend`, `MelaChow-Vendor`, `MelaChow-Rider`, and `SamkaTech.Logistics`.

**Status Legend:** `[ ]` Open · `[~]` In Progress · `[x]` Fixed & Verified · `[!]` Requires Manual Ops Action (Dashboard/Rotation)

---

## CRITICAL Errors (5)

- [x] **F-01 — Infinite free wallet credit via Paystack reference replay & race condition** (`LIVE PROD` / `STAGING`)
  - Fixed in `controller/user/wallet.controller.js` and `services/postgres/wallet.repository.js`: enforces `data.metadata.type === "wallet_funding"`, `metadata.userId === req.userId`, `currency === "NGN"`, `reference` match, globally unique `PaymentAttempt.reference` inside DB transaction + atomic `$inc` / Prisma `increment`, and full PostgreSQL support (including `creditUserWallet`).
- [x] **F-02 — Super-admin MFA, lockout, `isActive` & rate-limit bypass via legacy `POST /api/admin/login`** (`BOTH`)
  - Fixed in `routes/Admin/admin.routes.js` (retired legacy `/login`, `/forgot-password`, `/reset-password`, `/logout` with `410 Gone`, enforcing `/api/admin/auth/*`).
- [x] **F-03 — Unauthenticated vendor creation with full mass assignment (`POST /api/vendors/create`)** (`LIVE PROD`)
  - Fixed in `routes/vendor/vendor.routes.js` (retired `POST /create` with `410 Gone`, enforcing `POST /api/vendor/auth/register`).
- [x] **F-04 — Unauthenticated customer account takeover via `POST /api/user/auth/set-password`** (`BOTH`)
  - Fixed in `controller/user/user.auth.controller.js`, `services/postgres/userIdentity.repository.js`, and `MelaChow-Frontend/src/app/components/users/auth/{VerifyRegistration,SetPassword}.jsx`: `verifyRegistration` issues a 30-min one-time `passwordSetupToken`, stored via `sessionStorage` and verified+consumed in `setPassword`.
- [x] **F-07 — PostgreSQL staging cutover blockers (Mongoose-only paths & undefined vars crash under `DB_PRIMARY_PROVIDER=postgres`)** (`STAGING`)
  - Fixed across:
    - `controller/vendor/vendor.auth.controller.js` (moved `postgresVendorIdentityEnabled()` before Mongoose `Vendor.findOne`)
    - `controller/riderAuth.controller.js` (moved misplaced `saveSubscription` out of `forgotRiderPassword` into `subscribeRider`)
    - `socket/socketServer.js` (added Postgres identity lookups for all 4 roles, added `finance-admin`, added `isTokenBlocked`, added prod domains to CORS)
    - `controller/user/wallet.controller.js` + `services/postgres/wallet.repository.js` (Postgres `verifyWalletFunding` & `creditUserWallet`)
    - `controller/wallet/bankAccount.controller.js` (Postgres `saveBankAccount` with `BANK_DETAILS_LOCKED`)
    - `controller/order/createOrderV2.controller.js` (Postgres `Serializable` `releaseEscrowToVendor`) & `workers/index.js` (`orderAutoCancelWorker` skips Mongoose in Postgres mode)

---

## HIGH Errors (9)

- [x] **F-05 — Unapproved vendor bypasses admin approval via Forgot Password** (`BOTH`)
  - Fixed in `middleware/vendor.middleware.js` (`!vendor.isApproved` -> 403), `controller/vendor/vendor.auth.controller.js` (`resetVendorPasswordNew` blocks unapproved/suspended vendors), and `tests/middleware/vendorAuth.test.js`.
- [x] **F-06 — Vendor bank-account lock (`BANK_DETAILS_LOCKED`) bypassed via `DELETE /api/wallet/bank-account`** (`LIVE PROD`)
  - Fixed in `routes/wallet/wallet.routes.js` (`DELETE /bank-account` now returns `403 BANK_DETAILS_LOCKED`).
- [x] **F-08 — Customer order verification IDOR (`POST /api/orders/v2/verify/:reference` & `/verify/:reference`)** (`BOTH`)
  - Fixed in `controller/order/orderController.js` (`verifyPayment`, `verifyPaymentV2`, and `handlePostgresPaymentVerification` now enforce `order.userId === req.userId`).
- [x] **F-09 — Admin sub-role privilege escalation (`adminAuth` bypasses `superAdminOnly` / `financeAdminOnly`)** (`BOTH`)
  - Fixed in `routes/wallet/wallet.routes.js` (`creditUserWallet` -> `financeAdminOnly`, `forceFailWithdrawal` -> `superAdminOnly`), `routes/Admin/admin.routes.js` (finance/payout routes -> `financeAdminOnly`, `PUT /platform-config` -> `superAdminOnly`), and `controller/user/wallet.controller.js` (`creditUserWallet` validates finite positive `amount`).
- [x] **F-10 — Refresh tokens never revoked on logout & never checked against blocklist (all 4 roles) + `clearCookie` `sameSite` mismatch** (`BOTH`)
  - Fixed in `controller/auth.controller.js`, `controller/user/user.auth.controller.js`, `controller/vendor/vendor.auth.controller.js`, `controller/Admin/admin.auth.controller.js`, and `controller/riderAuth.controller.js` (all 4 logouts block access + refresh + Bearer tokens and clear with matching `sameSite`; all 4 refresh endpoints check `isTokenBlocked` and rotate refresh tokens).
- [!] **F-11 — Live Paystack/Mongo credentials in Git history + uncommitted `GOOGLE_MAP_API_KEY` in `MelaChow-APi/.env.example`** (`BOTH`)
  - Code cleanup DONE: removed literal `GOOGLE_MAP_API_KEY` from `MelaChow-APi/.env.example`. Remaining ops action: rotate historical Paystack & MongoDB credentials in dashboards.
- [x] **F-12 — Legacy `POST /api/user/auth/signup` role mass assignment & legacy password double-hashing** (`LIVE PROD`)
  - Fixed in `model/user.model.js` (`role` enum restricted to `["user"]`) and `controller/user/user.controller.js` (`signup` ignores `req.body.role` and forces `"user"`; legacy `resetPassword` enforces 8+ chars and relies on `pre('save')` without double-hashing).
- [~] **F-13 — Raw 7-day JWT access tokens persisted in `localStorage` across all 4 frontends** (`BOTH`)
  - Partially fixed: lowered default `JWT_EXPIRES_IN` from `7d` to `1h` in `MelaChow-API-staging/utils/jwt.js:7`; removed `localStorage` JWT persistence in `MelaChow-Admin/src/app/lib/auth-token.js` and `MelaChow-Admin/src/app/components/notifications/PushNotificationPrompt.jsx`. Remaining: migrate web builds of `MelaChow-{Frontend,Vendor,Rider}` off `localStorage` while keeping native Capacitor storage.
- [~] **F-14 — Production dependency CVEs (`npm audit --omit=dev`: 54 backend, 9–10 per frontend)** (`BOTH`)
  - Safe non-breaking upgrades applied to `package-lock.json` across all 5 repos via `npm audit fix --package-lock-only`:
    - `MelaChow-Admin` (prod): `9 → 0` (0 critical, 0 high)
    - `MelaChow-Frontend` (prod): `10 → 0` (0 critical, 0 high)
    - `MelaChow-Vendor` (prod): `9 → 0` (0 critical, 0 high)
    - `MelaChow-Rider` (prod): `9 → 0` (0 critical, 0 high)
    - `MelaChow-API-staging` (prod): `54 → 16` (**0 critical**, 8 high, 8 moderate, 0 low) — remaining 16 require separate major-version upgrades (`cloudinary@2.11.0` + `multer-storage-cloudinary@2.2.1`, `nodemailer@10.6.1`, `prisma@7.10.1`, `firebase-admin@14.5.1`, `exceljs@3.4.0`).

---

## MEDIUM Errors (12)

- [x] **F-15a — Support refund accounting double-debit bug (MongoDB)** (`LIVE PROD`)
  - Fixed in `services/supportRefundSettlement.service.js`: `adminWallet` is now debited only by `amount - recoveredFromPartnerWallets`.
- [x] **F-15b — Samka terminal `cancelled`/`failed` delivery does not refund customer or reassign** (`STAGING`)
  - Fixed in `MelaChow-API-staging/services/logistics/samkaLogistics.service.js`: `applyTerminalStatus` now runs inside a `Serializable` transaction and automatically, idempotently refunds paid un-escrow-released orders from `adminWallet` to the customer's `User` wallet (creating a `Refund` record as `completed` or `pending` if `adminWallet` balance is insufficient).
- [x] **F-16.1 — `BYPASS_OTP=true` has no `NODE_ENV !== 'production'` guard** (`BOTH`)
  - Fixed in `services/otp.service.js:104` (gated by `NODE_ENV !== 'production'`).
- [x] **F-16.2 — Non-cryptographic `Math.random()` used for 6-digit OTPs (8 locations)** (`BOTH`)
  - Fixed in `services/otp.service.js`, `controller/Admin/admin.controller.js`, and `controller/user/user.controller.js` (all replaced with `crypto.randomInt(100000, 1000000)`).
- [x] **F-16.3 — Plaintext OTP logged to stdout** (`LIVE PROD`)
  - Fixed in `controller/riderAuth.controller.js` and `controller/user/user.controller.js`.
- [x] **F-16.4 — Non-constant-time Paystack webhook HMAC comparison (`!==`)** (`BOTH`)
  - Fixed in `controller/order/orderController.js` (`crypto.timingSafeEqual` + `secret` guard).
- [x] **F-16.5 — Missing `axios` timeouts on all Paystack HTTP calls** (`BOTH`)
  - Fixed in `orderController.js`, `createOrderV2.controller.js`, `wallet.controller.js`, `withdrawal.controller.js`, and `paymentHardening.service.js` (`timeout: 15000`).
- [x] **F-16.6 — Stack trace leaked in HTTP 500 response** (`BOTH`)
  - Fixed in `controller/wallet/withdrawal.controller.js:302`.
- [x] **F-16.7 — Missing `otpLimiter` on auth aliases** (`BOTH`)
  - Fixed in `index.js` (added `/api/user/auth/verify-account`, `/api/vendor/auth/verify-reset`, `/api/admin/auth/login/verify`, `/api/auth/rider/verify-reset-code` to `otpLimiter`). *(Note: migrating `express-rate-limit` from in-memory to `rate-limit-redis` remains a backlog infra item).*
- [x] **F-16.8 — BullMQ connection sharing violation (missing `.duplicate()`) & queue `.clean()` breaking same-day dedup** (`BOTH`)
  - Fixed in `jobs/scheduledPayout.job.js` (`.duplicate()` + 24h clean window) and `workers/{broadcastTimeout,deliveryWatchdog,disputeEscalation}.worker.js` (`.duplicate()`).
- [x] **F-16.9 — Unauthenticated Nigerian bank account name enumeration (`GET /api/wallet/public/resolve-account`)** (`BOTH`)
  - Fixed in `routes/wallet/wallet.routes.js`: added `publicResolveLimiter` (5 requests per 10 minutes per IP) on `GET /public/resolve-account`.
- [x] **F-16.10 — JSON-LD XSS escaping, legacy `POST /api/transactions/initialize` retirement, & stray debug file cleanup** (`BOTH`)
  - Fixed in `MelaChow-{Frontend,Vendor,Rider}/src/app/components/JsonLd.jsx` (escaped `<` as `\u003c`), `routes/transaction/transaction.routes.js` (`POST /initialize` retired with `410 Gone`), and deleted 12 stray debug scripts (`debug-cookies.js`, `fix.js`, `fix2.js`, `test-vendor-auth.js`) + `MelaChow-Vendor-debug.apk`. *(Backlog: Tauri CSP in `MelaChow-Vendor/src-tauri/tauri.conf.json`).*

---

## Runtime, Logistics & Admin UI Errors (Plain-English Log — Nov 2026)

> Written so anyone — even a kid — can understand what went wrong, why it happened, and how it was fixed.

- [x] **F-17 (CRITICAL) — Ready-for-pickup orders stuck and never reaching Samka riders (`HTTP 500`)** (`SamkaTech.Logistics` — commit `a951eed`)
  - **What went wrong:** When a restaurant marked food as "Ready for Pickup", MelaChow tried to hand the delivery over to SamkaTech Logistics, but SamkaTech crashed with a `500` server error every single time (3 orders retried up to 327 times). Because the orders never got saved in SamkaTech, riders on the Samka Rider app never saw them.
  - **Why it happened (simple explanation):** Before saving a new delivery, SamkaTech opens a second door to its database to put a "lock" on the order so two copies can't be created at the same time. To open that second door, it copied the database address from the first connection — but for safety, the database tool (`Npgsql` 9) **erases the password** when you copy it! So the second connection knocked on the database door with no password and got kicked out.
  - **How we fixed it:** Changed `SamkaTech.Logistics/Infrastructure/Persistence/Repositories/PostgresSourceDeliveryCreationLock.cs` to read the full database address (with its password) directly from app settings (`IConfiguration`), and removed the duplicate registration in `LogisticsPersistenceModule.cs`.

- [x] **F-18 (MEDIUM) — Online riders silently skipped from order broadcasts after 5 minutes** (`SamkaTech.Logistics` — commit `a951eed`)
  - **What went wrong:** A rider could still show up as "Online" and "Available" in the app, yet never receive nearby delivery offers.
  - **Why it happened (simple explanation):** Two parts of the code disagreed on how fresh a rider's GPS location needed to be. One rule said "within 20 minutes" (`Rider.OnlineLocationFreshness`), while the nearby-rider search secretly demanded "within 5 minutes". If a rider's phone sat in their pocket for 6 minutes without sending a GPS ping, the app still called them online, but the dispatcher quietly ignored them.
  - **How we fixed it:** Updated `SamkaTech.Logistics/Infrastructure/Persistence/Repositories/RiderRepository.cs` to use the exact same 20-minute `Rider.OnlineLocationFreshness` rule.

- [x] **F-19 (MEDIUM) — Rider incoming-call notifications ignored Base64 Firebase credentials** (`SamkaTech.Logistics` — commit `a951eed`)
  - **What went wrong:** Wake-up push notifications for incoming customer-to-rider calls could fail to send when Firebase keys were stored in Base64 format.
  - **Why it happened (simple explanation):** The normal job-offer notifier knew how to read both plain JSON (`Firebase:ServiceAccountJson`) and Base64 (`Firebase:ServiceAccountBase64`), but the call notifier only checked for plain JSON.
  - **How we fixed it:** Updated `SamkaTech.Logistics/Infrastructure/Notifications/FirebaseRiderFcmTransport.cs` to use `FirebaseOptions.GetServiceAccountJson()`, so both formats work everywhere.

- [x] **F-20 (LOW) — MelaChow threw away SamkaTech's error details when a delivery failed** (`MelaChow-API-staging` — commit `4866cac`)
  - **What went wrong:** In the `logistics_deliveries` table, failed dispatches only saved `"Samka Logistics request failed with status 500"` while `response_payload` stayed `null`, hiding Samka's `traceId` and error message.
  - **Why it happened (simple explanation):** Like throwing away a receipt after a store declines your card — the `catch` block saved the short error message, but forgot to save the response body Samka sent back.
  - **How we fixed it:** Updated `MelaChow-API-staging/services/logistics/samkaLogistics.service.js` to also save `error.responseBody` into `logistics_deliveries.response_payload`.

- [x] **F-21 (HIGH) — Admin dashboard crashed with `Cannot read properties of undefined (reading 'map')`** (`MelaChow-Admin` — commit `9039d72`)
  - **What went wrong:** Opening redesigned admin pages crashed the screen with an error inside `<AdminSegmentedTabs>`.
  - **Why it happened (simple explanation):** Imagine handing someone a box labeled `options` when they are only looking for a box labeled `tabs`. When `<AdminSegmentedTabs>` tried to list every item inside `tabs` (which didn't exist), JavaScript panicked and crashed. A few other shared admin building blocks (`AdminSelect`, `AdminStatusPill`, `AdminStatCard`, `AdminSlideOver`) had similar small name mismatches (`options` vs `children`, `dot` vs `pulse`, `hint` vs `subtext`, `width`).
  - **How we fixed it:** Updated `MelaChow-Admin/src/app/components/admin/ui/AdminPrimitives.jsx` so every shared component understands **both** old and new prop names cleanly.

- [x] **F-22 (MEDIUM) — Admin app threw a `Runtime Error: Timeout` popup on page load** (`MelaChow-Admin` — commit `e1c1114`)
  - **What went wrong:** Loading the Admin dashboard popped up a red `Runtime Error: Timeout` at `usePushNotifications.js:62`.
  - **Why it happened (simple explanation):** To check if browser push notifications were supported, the code set a 3-second alarm clock that yelled "Timeout error!" if the browser's Service Worker wasn't ready — and forgot to turn off the alarm even when the Service Worker was already working (or when running locally without one).
  - **How we fixed it:** Updated `MelaChow-Admin/src/app/hooks/usePushNotifications.js` to only start the timer if no active Service Worker is found, return `null` calmly instead of crashing on timeout, and always clear the timer in `finally`.

- [!] **F-23 (OPS CHECK) — Verify `LogisticsSafety:EnableExternalSideEffects` is `true` in MonsterASP production** (`SamkaTech.Logistics`)
  - **What to check:** Both background helpers — `DeliveryDispatchWorker` (retries waiting deliveries every minute) and `SourceCallbackOutboxDispatcher` (sends delivery status updates back to MelaChow) — stay turned OFF unless `LogisticsSafety:EnableExternalSideEffects` is explicitly set to `true` on MonsterASP (the template defaults it to `false`).

- [x] **F-24 (HIGH) — Admin app crashed with `module factory is not available` on `lucide-react` / `AdminDashboardLayout`** (`MelaChow-Admin` — commit `a4daad5`)
  - **What went wrong:** Navigating to admin pages (such as `vendors/pending/[vendorId]`) crashed with `Module ... lucide-react ... was instantiated ... but the module factory is not available`.
  - **Why it happened (simple explanation):** The Service Worker (`public/sw.js`) was saving Next.js JavaScript bundles (`/_next/static/*`) in a "cache-first" box — even on `localhost`. When Next.js Turbopack rebuilt the code, the browser asked for the new JavaScript file, but the Service Worker handed back an **old cached file** that didn't have the updated icon module inside it. Also, `chunkRecovery.js` didn't recognize Turbopack's `"module factory is not available"` error message to auto-reload.
  - **How we fixed it:** Updated `MelaChow-Admin/public/sw.js` (bumped to `melachow-v1.4.0`) to never intercept `localhost` or `/_next/` chunks, and updated `MelaChow-Admin/src/app/lib/chunkRecovery.js` to detect `"module factory is not available"` and auto-clear stale caches.

- [x] **F-25 (HIGH) — Riders saw 0 orders after missing a 5-minute push notification (stale expired offers blocked re-offering)** (`SamkaTech.Logistics` — commits `83b5b8a`, `e2a30f5`)
  - **What went wrong:** Riders received push notifications for new deliveries, but when they opened the app more than 5 minutes later, the Jobs screen was empty and the unclaimed orders never re-appeared.
  - **Why it happened (simple explanation):** Each offer ticket had a 5-minute timer. Once the 5 minutes ended, the Offers screen hid the expired ticket — **but** the dispatcher still saw the old ticket sitting in the database without an `"EXPIRED"` stamp and thought someone was still looking at it, so it refused to create a new offer. Plus, a 15-minute cooldown blocked re-offering even to riders who simply missed the notification.
  - **How we fixed it:** Updated `SamkaTech.Logistics/Application/Features/Jobs/Commands/DispatchDeliveryJobOfferBatch.cs` to keep active offers on riders' dashboards for 2 hours (without re-spamming them), auto-expire stale offers inline, and broadcast unclaimed orders to newly available nearby riders.

- [x] **F-26 (HIGH) — Customers received ZERO notifications when Samka rider was assigned, arrived at store, or went on the way** (`MelaChow-API-staging` — commit `3454915`)
  - **What went wrong:** Vendors received all Samka delivery updates, but customers never got notified for *"Rider Assigned"*, *"Rider at Restaurant"*, or *"Order on the Way"*.
  - **Why it happened (simple explanation):** The notification code tried to save the message using 3 labels (`order_rider_assigned`, `order_rider_arrived`, `order_on_the_way`) that **didn't exist** in the Postgres `NotificationType` list! So Postgres rejected the save with an error before any push notification could be sent.
  - **How we fixed it:** Mapped those 3 labels in `MelaChow-API-staging/services/postgres/notification.repository.js` (`typeAliases`) to valid Postgres `NotificationType` values (`order_assigned`, `order_ready`, `order_dispatched`) while preserving the exact milestone titles and messages.

- [x] **F-27 (HIGH) — In-app calling failed with `"Unable to complete your call request right now"` on both mobile & web** (`MelaChow-API-staging`)
  - **What went wrong:** Initiating a call on both the Android APKs and browser returned `500` (`"Unable to complete your call request right now. Please try again."`), and browser calls from `localhost:3001` hit `403 Cross-site request blocked`.
  - **Why it happened (simple explanation):** Two things: (1) The `call_sessions` database table migration (`20261124235900_add_call_sessions`) had not been applied to the staging Postgres database yet, so saving a new call crashed! (2) The cross-site CSRF filter in `index.js` blocked `POST /api/calls/initiate` from browser origins like `localhost:3001` even though it used a Bearer token.
  - **How we fixed it:** Applied `npx prisma migrate deploy` to create the `call_sessions` table in Postgres, and updated `MelaChow-API-staging/index.js` (`8484054`) to allow Bearer-authenticated requests from CORS-allowlisted origins.
