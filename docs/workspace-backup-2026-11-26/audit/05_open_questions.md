# Open Questions, Coverage Gaps & Phase 5 Self-Critique

## 1. Open Questions (Could Not Determine From Static Inspection Alone)

1. **Have the historically committed Paystack live/test keys and MongoDB credentials been rotated?**
   - `git log --all -S` in `MelaChow-API-staging` proved `sk_live_` (2 commits), `sk_test_` (4 commits), and `mongodb+srv://` (3 commits) exist in git history. Only the infrastructure owner (checking Paystack Dashboard & MongoDB Atlas audit logs) can confirm whether those exact credentials were revoked.
2. **What is the exact live production environment configuration on Render?**
   - We could not inspect Render's live dashboard env vars (e.g., whether `NODE_ENV=production`, `BYPASS_OTP`, `JWT_EXPIRES_IN`, `REDIS_URL`, and `SENTRY_DSN` are properly set, or whether prod runs a single Render instance or multiple instances where in-memory rate limits and in-memory Socket.IO fallback diverge).
3. **Is `MelaChow-API-staging` (`staging` branch) the exact code running on Render staging, and which commit/branch is deployed on Render live production?**
   - `MelaChow-APi` is on `feature/customer-care-settlement` (85 commits behind `staging` with 7 dirty edits); `origin/main` is at `01c256d`. Confirm the exact deployed commit SHA on live production so F-01–F-06 hotfixes target the right branch.
4. **Are any mobile or web clients still calling legacy endpoints (`POST /api/vendors/create`, `POST /api/admin/login`, `POST /api/user/auth/signup`, `POST /api/transactions/initialize`)?**
   - Access logs from Render/Cloudflare for the last 30 days should be checked before deleting or returning `410 Gone` on these routes.
5. **Has `GET /api/wallet/verify/:reference` (F-01) already been exploited in live production?**
   - Run a production MongoDB audit query checking for duplicate Paystack references across `wallets.transactions` and any `W_FUND_*` or `PSK_*` reference credited more than once or credited to a wallet whose owner doesn't match the Paystack transaction's `metadata.userId`.
6. **SamkaTech Logistics C# backend (`Samkatech-Codebase/SamkaTech.Logistics`)** was explicitly excluded from this audit per user scope; end-to-end callback signing, pickup/delivery code validation on Samka's side, and rider settlement remain unverified.

---

## 2. Phase 4 Execution Gaps

- **Full Jest suite in `MelaChow-API-staging`:** `tests/setup.js:18` launches `MongoMemoryReplSet.create({ replSet: { count: 1 } })` with a 10s startup timeout, which timed out on this Windows host (`GenericMMSError: Instance failed to start within 10000ms`, raw log in [api_staging_jest.txt](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/evidence/api_staging_jest.txt)). Non-Mongo unit tests (`tests/deliveryPricing.test.js` — 8/8 passed) and `MelaChow-Frontend` mobile tests (`npm run test:mobile` — 6/6 passed) executed cleanly.
- **Live exploit testing:** Per Hard Rule 1 (read-only), no live HTTP requests were sent to production or staging servers; all 8 CRITICAL/HIGH repros were verified deterministically via [repro_critical_findings.mjs](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/repros/repro_critical_findings.mjs).

---

## 3. Phase 5: Mandatory Self-Critique

### Findings Re-Verified & False Positives Eliminated
- **`POST /api/transactions/webhook`:** Initially looked vulnerable because `index.js` didn't exempt it from `express.json`/`mongoSanitize`. Reading `transaction.controller.js:145` proved it unconditionally returns `410 Gone` — **excluded from findings**.
- **Concurrent vendor withdrawals in MongoDB:** Initially suspected a race condition in `withdrawal.controller.js:172-199`. Reading `Withdrawal.model.js:68` proved `activePayoutKey` has a `unique: true, sparse: true` index — **downgraded** from double-withdrawal to non-atomic wallet balance overwrite risk.
- **Unencoded Paystack `reference` URL interpolation:** Initially suspected SSRF/path traversal on `orderController.js:1251` and `transaction.controller.js:91`. Verified that both query the DB for `reference` first, blocking `../` paths — **excluded**.
- **`prisma.$queryRawUnsafe` (`geography.js:7`):** Verified it executes a static constant string — **excluded**.

### Areas Read Fastest / Residual Risk
- **P2/P3 files (UI components, menu/search/recommendation/review controllers, `prisma/` migration import scripts, and `MelaChow-Rider` pages):** Not read line-by-line per agreed prioritized scope (final coverage reported in [00_coverage_ledger.md](file:///c:/Users/adeye/OneDrive/Documents/AdeyemiCode/MelaChow-Codebase/audit/00_coverage_ledger.md)). Residual risk includes potential IDORs or stored XSS in non-payment CRUD routes (e.g., reviews, support tickets, menu items, banners) and business-logic bugs in promo/discount stacking (`services/discount.service.js`).
- **Bugs static reading cannot detect:** Live Paystack dashboard configuration (fee bearer, webhook URL, IP allowlist), PostgreSQL index performance at 10× load, Redis eviction/memory exhaustion behavior under Render free/starter tier, and race conditions across multiple Render web instances.

### What a Skeptical Senior Engineer Might Push Back On
- **F-04 (`setPassword`) exploitability window:** Only affects verified users whose `password` is still `null` (legacy OTP users or users mid-registration). Still **CRITICAL** because any existing unmigrated user with wallet funds is immediately hijackable knowing only their email.
- **F-13 (`localStorage` JWTs):** Requires an XSS primitive to exploit. Still **HIGH** because it completely negates the `httpOnly` cookie architecture already built via Next.js rewrites, and `JsonLd.jsx` + unpatched frontend dependencies keep XSS risk non-zero.
