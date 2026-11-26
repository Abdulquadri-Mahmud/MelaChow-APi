# Remediation Plan (Ordered by Severity × Effort)

## Group 1: Fix Immediately / Before Next Deploy (Live Prod Emergency + Staging Cutover Blockers)

| Order | Finding | Action | Effort | Dependencies |
|---:|---|---|---|---|
| 1 | **F-01** | Patch `verifyWalletFunding` (`controller/user/wallet.controller.js:93-155`): enforce `data.metadata.type === "wallet_funding"`, `String(data.metadata.userId) === String(req.userId)`, `currency === "NGN"`, global unique `reference` index, atomic `$inc` / Prisma tx, and Postgres branch. | 0.5 day | None — deploy hotfix to LIVE PROD immediately. |
| 2 | **F-02** | Remove legacy `/login`, `/forgot-password`, `/reset-password`, `/logout` from `routes/Admin/admin.routes.js:65-68` (return 410 or delete). | 1 hour | Confirm `MelaChow-Admin` uses `/api/admin/auth/*`. |
| 3 | **F-03** | Remove unauthenticated `POST /api/vendors/create` (`routes/vendor/vendor.routes.js:33`) or gate with `superAdminOnly` + explicit field allowlist. | 1 hour | None. |
| 4 | **F-06** | Remove/disable `DELETE /api/wallet/bank-account` (`routes/wallet/wallet.routes.js:41`) so vendors cannot bypass `BANK_DETAILS_LOCKED`. | 30 min | None. |
| 5 | **F-05** | Add `if (!vendor.isApproved)` guard in `middleware/vendor.middleware.js:70` and `resetVendorPasswordNew` (`vendor.auth.controller.js:735-774`). | 1 hour | None. |
| 6 | **F-08** | Add `order.userId === req.userId` ownership check in `verifyPayment`, `verifyPaymentV2`, and `handlePostgresPaymentVerification` (`orderController.js`). | 1 hour | None. |
| 7 | **F-04** | Add one-time `passwordSetupToken` to customer `verifyRegistration` + `setPassword` (`user.auth.controller.js:118-233`). | 0.5 day | Coordinated deploy with `MelaChow-Frontend` `SetPassword.jsx`. |
| 8 | **F-09** | Remove duplicate `PATCH /api/wallet/admin/withdrawals/:withdrawalId/force-fail`; enforce `financeAdminOnly`/`superAdminOnly` on `creditUserWallet`, `retryWithdrawal`, `approvePendingWithdrawal`, `updateAdminPlatformConfig`, `payouts/trigger`; validate positive `amount` in `creditUserWallet`. | 0.5 day | Confirm admin role matrix. |
| 9 | **F-11** | Rotate historical Paystack live/test keys & MongoDB credentials; remove literal `GOOGLE_MAP_API_KEY` from `MelaChow-APi/.env.example`. | 2 hours | Update Render env vars before revoking old keys. |
| 10 | **F-07** | **Before promoting Staging (Postgres) to Prod:** fix `registerVendor` line 166 order, remove misplaced `saveSubscription` in `forgotRiderPassword` line 212, port `socketServer.js` auth (add `finance-admin` + `isTokenBlocked`), `wallet.controller.js`, `bankAccount.controller.js`, `releaseEscrowToVendor`, and `orderAutoCancelWorker` to Postgres. | 2–3 days | Must pass full end-to-end staging smoke test with `DB_PRIMARY_PROVIDER=postgres`. |

---

## Group 2: Fix This Month

| Order | Finding | Action | Effort | Dependencies |
|---:|---|---|---|---|
| 11 | **F-10** | Block refresh tokens & Bearer tokens on logout (all 4 roles); check `isTokenBlocked` and rotate refresh tokens in all 4 refresh endpoints; fix `clearCookie` `sameSite` mismatch in `logoutAdmin`/`vendorLogout`. | 1 day | None. |
| 12 | **F-12** | Retire legacy routes in `routes/user.routes.js:28-38` (`signup`, `login`, `verify-account`, `forgot-password`, `reset-password`), add `enum: ["user"]` on `UserSchema.role`, fix double-hashing if legacy reset is retained. | 0.5 day | Verify zero mobile/web clients call legacy routes. |
| 13 | **F-13** | Remove `localStorage` JWT storage in web builds of all 4 Next.js apps (rely on `httpOnly` cookies via Next.js proxy); shorten `JWT_EXPIRES_IN` to `15m–1h` for Admin. | 1–2 days | Test iOS Safari + Capacitor native auth flows. |
| 14 | **F-14** | Upgrade vulnerable production dependencies (`mongoose`, `express`, `proxy-addr`, `express-rate-limit`, `axios`, `multer`, `nodemailer`, `cloudinary`, `socket.io`, `next`) across all 5 repos. | 1–2 days | Full regression test in staging. |
| 15 | **F-15** | Fix double-debit accounting in `supportRefundSettlement.service.js:50-96` and implement refund/reassignment workflow in `samkaLogistics.service.js:325-349` (`applyTerminalStatus`). | 1 day | Product/finance sign-off on Samka failure refund policy. |
| 16 | **F-16 (part 1)** | Guard `BYPASS_OTP` with `NODE_ENV !== 'production'`; replace all 8 `Math.random()` OTP generators with `crypto.randomInt`; remove plaintext OTP `console.log`s; use `crypto.timingSafeEqual` in `paystackWebhook`; add `timeout: 15000` to all Paystack `axios` calls; remove `stack: error.stack` leak; add missing routes to `otpLimiter`. | 1 day | None. |

---

## Group 3: Backlog (Hardening & Maintainability)

| Order | Finding | Action | Effort | Dependencies |
|---:|---|---|---|---|
| 17 | **F-16 (part 2)** | Move `express-rate-limit` to a Redis store (`rate-limit-redis`); fix BullMQ connection `.duplicate()` in `scheduledPayout.job.js` and 3 workers; fix `scheduledPayout.job.js:444` queue `.clean()` destroying same-day deduplication; add `ActivityLog` writes to Samka admin mutations; restrict `GET /api/wallet/public/resolve-account`. | 2 days | Redis stability in prod. |
| 18 | **F-16 (part 3)** | Escape `<` as `\u003c` in `JsonLd.jsx`; define explicit CSP in `MelaChow-Vendor/src-tauri/tauri.conf.json`; remove committed `MelaChow-vendor-debug.apk` and stray debug scripts (`debug-cookies.js`, `fix.js`, `fix2.js`, `test-vendor-auth.js`); retire `POST /api/transactions/initialize`; fix `MongoMemoryReplSet` test harness timeout on Windows CI. | 1–2 days | None. |
