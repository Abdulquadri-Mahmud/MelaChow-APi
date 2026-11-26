# Phase 0: Inventory and Coverage Ledger

**Generated:** 2026-11-24 (Final Phase 5 checkpoint)
**Workspace root:** `c:\Users\adeye\OneDrive\Documents\AdeyemiCode\MelaChow-Codebase`
**Audit scope (confirmed by user):**
- **In-scope first-party repos:** `MelaChow-API-staging` (canonical prod-closest backend, branch `staging`), `MelaChow-Admin`, `MelaChow-Frontend`, `MelaChow-Vendor`, `MelaChow-Rider`.
- **Diff-only reference:** `MelaChow-APi` (branch `feature/customer-care-settlement`, 85 commits behind `staging`, 7 uncommitted local edits).
- **Out-of-scope (inventoried at repo level only):** `postgres-local-test/*` (5 pre-migration local snapshots), `Samkatech-Codebase/SamkaTech.Logistics` (external C#/.NET repo), `Samkatech-Codebase/Samka-Rider` (external rider app), `.build/` (local APK/registration build scratch).
- **Workspace-root files (inventoried):** `.env.samkatech.local` (READ_FULL, non-secret staging vars), `dump.rdb` (SKIPPED: Redis binary dump, 1253B), `SAMKATECH_LOGISTICS_INTEGRATION_AUDIT.md` (READ_FULL), `POSTGRES_MOBILE_ROLLOUT_CHECKLIST.md` (PENDING), `SAMKATECH_STAGING_HANDOFF.md` (PENDING), `SAMKA_RIDER_INTEGRATION.md` (PENDING), `SAMKA_RIDER_REGISTRATION_FIX.md` (PENDING), `Tauri.md` (PENDING).

## Coverage Summary (Final Audit Coverage)

| Metric | Count | % of Auditable |
|---|---:|---:|
| Total entries inventoried (5 in-scope repos) | 2102 | - |
| Skipped (binaries + ignored/vendored/build dirs) | 647 | - |
| **Auditable text/code/config/lock files** | **1455** | **100%** |
| READ_FULL (so far) | 86 | 5.91% |
| READ_PARTIAL (so far) | 62 | 4.26% |
| PENDING (queued for Phase 2/3) | 1307 | 89.83% |
| **Touched (Full + Partial)** | **148** | **10.17%** |

### Per-Repo Breakdown

| Repo | Branch | Tracked Files | P1 (Security/Money/Config) | P2 (Domain/UI) | P3 (Scripts/Tests/Native) | Binaries/Ignored Dirs |
|---|---|---:|---:|---:|---:|---:|
| `MelaChow-API-staging` | `staging` | 454 | 234 | 152 | 69 | 3 |
| `MelaChow-Admin` | `staging` | 210 | 24 | 69 | 0 | 120 |
| `MelaChow-Frontend` | `staging` | 546 | 106 | 250 | 38 | 178 |
| `MelaChow-Vendor` | `staging` | 548 | 105 | 208 | 39 | 225 |
| `MelaChow-Rider` | `main` | 282 | 51 | 110 | 0 | 121 |

## Out-of-Scope Workspace Repos (Inventoried Only)

| Path | Git Branch / HEAD | Tracked Files | Reason Excluded |
|---|---|---:|---|
| `MelaChow-APi` | `feature/customer-care-settlement` @ `564c5a4` (7 dirty) | 367 | Older worktree (85 commits behind `MelaChow-API-staging`); diff-only reference per user scope |
| `postgres-local-test/*` (5 repos) | `local/postgres-testing` | 1,586 | Pre-centralized-rider local migration snapshots |
| `Samkatech-Codebase/SamkaTech.Logistics` | `main` @ `fc5b924` | 257 | Third-party/partner C#/.NET logistics backend |
| `Samkatech-Codebase/Samka-Rider` | `codex/pickup-verification-errors` @ `ee22372` | 368 | Third-party/partner rider frontend |
| `.build/` | (no git) | - | Local build/registration check scratch artifacts |

## File-by-File Ledger (All 5 In-Scope Repos)

| Path | Language | LOC | Purpose | Status | Reason / Tier |
|---|---|---:|---|---|---|
| `MelaChow-API-staging/.agent/verify-delivery-system.js` | JavaScript | 130 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/.env.example` | ENV | 131 | Environment configuration (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/.gitignore` | Ignore | 22 | Ignore file (tracked) | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/Admin/admin.mailer.js` | JavaScript | 111 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/Admin/user_mailer/sendUser.ban.email.js` | JavaScript | 71 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/Admin/user_mailer/sendUser.reactivation.email.js` | JavaScript | 43 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/Admin/user_mailer/sendUser.suspension.email.js` | JavaScript | 36 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/Admin/vendor_mailer/sendVendorApprovalEmail.js` | JavaScript | 23 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/Admin/vendor_mailer/sendVendorReactivationEmail.js` | JavaScript | 21 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/Admin/vendor_mailer/sendVendorRejectionEmail.js` | JavaScript | 21 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/Admin/vendor_mailer/sendVendorSuspensionEmail.js` | JavaScript | 26 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/categorySeed.js` | JavaScript | 57 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/cloudinary.js` | JavaScript | 11 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/db.js` | JavaScript | 15 | Backend configuration / mailer / queue | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/env.js` | JavaScript | 2 | Backend configuration / mailer / queue | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/logger.js` | JavaScript | 17 | Backend configuration / mailer / queue | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/mailer.js` | JavaScript | 49 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/orderStatusTemplate.js` | JavaScript | 82 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/payouts.js` | JavaScript | 44 | Backend configuration / mailer / queue | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/prisma.js` | JavaScript | 18 | Backend configuration / mailer / queue | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/queue.js` | JavaScript | 117 | Backend configuration / mailer / queue | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/redis.js` | JavaScript | 113 | Backend configuration / mailer / queue | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/config/riderAccount.mailer.js` | JavaScript | 27 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/vendorAccountCreated.mailer.js` | JavaScript | 40 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/config/vendors.mailer.js` | JavaScript | 88 | Backend configuration / mailer / queue | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/admin.auth.controller.js` | JavaScript | 562 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/Admin/admin.controller.js` | JavaScript | 282 | Express request controller | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/controller/Admin/admin.notification.controller.js` | JavaScript | 201 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/banner.controller.js` | JavaScript | 27 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/categoryMetrics.controller.js` | JavaScript | 42 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/dashboard.controller.js` | JavaScript | 42 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/finance.controller.js` | JavaScript | - | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/finance/payoutFeeOverride.controller.js` | JavaScript | 222 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/finance/paystackOperations.controller.js` | JavaScript | 72 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/finance/paystackTransactions.controller.js` | JavaScript | 73 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/finance/platformFinance.controller.js` | JavaScript | 1791 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/location.controller.js` | JavaScript | 349 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/locationMetrics.controller.js` | JavaScript | 35 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/order.controller.js` | JavaScript | - | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/order_management/adminOrder.controller.js` | JavaScript | 1196 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/Admin/platform/deliveryPricing.controller.js` | JavaScript | 50 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/platform/platformConfig.controller.js` | JavaScript | 200 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/platformPromo.controller.js` | JavaScript | 308 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/samkaLogisticsAdmin.controller.js` | JavaScript | 43 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/Admin/userMetrics.controller.js` | JavaScript | 41 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/user_management/user.management.controller.js` | JavaScript | 276 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/vendorMetrics.controller.js` | JavaScript | 91 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/vendorPromo.controller.js` | JavaScript | 290 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/Admin/vendors_management/vendor.controller.js` | JavaScript | 973 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/auth.controller.js` | JavaScript | 56 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/category.controller.js` | JavaScript | 308 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/cloudinaryUpload.js` | JavaScript | 15 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/discount/discount.controller.js` | JavaScript | 320 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/finance/adminFinanceSummary.controller.js` | JavaScript | 266 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/integrations/samkaLogistics.controller.js` | JavaScript | 134 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/invoice.controller.js` | JavaScript | 22 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/location/googleLocation.controller.js` | JavaScript | 25 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/location/location.controller.js` | JavaScript | 149 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/menu/cartController.js` | JavaScript | 138 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/menu/choiceGroupTemplateController.js` | JavaScript | 207 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/menu/customerMenuController.js` | JavaScript | 907 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/menu/platformCategories.controller.js` | JavaScript | 15 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/menu/vendorComboController.js` | JavaScript | 493 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/menu/vendorMenuController.js` | JavaScript | 1461 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/notification/nativePush.controller.js` | JavaScript | 57 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/notification/notification.controller.js` | JavaScript | 327 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/notification/riderNotification.controller.js` | JavaScript | 222 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/order/createOrderV2.controller.js` | JavaScript | 2472 | Express request controller | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/controller/order/orderController.js` | JavaScript | 2596 | Express request controller | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/controller/otp.verification.controller.js` | JavaScript | 57 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/payment/payment.controller.js` | JavaScript | 25 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/promo/publicPromo.controller.js` | JavaScript | 132 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/public/publicPlatformConfig.controller.js` | JavaScript | 31 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/qr.controller.js` | JavaScript | 132 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/recommendation/recommendation.controller.js` | JavaScript | 443 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/rider.controller.js` | JavaScript | 2036 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/rider/riderWithdrawal.controller.js` | JavaScript | 557 | Express request controller | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/controller/riderAuth.controller.js` | JavaScript | 416 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/search/searchFood.controller.js` | JavaScript | 853 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/supportChat.controller.js` | JavaScript | 312 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/supportKnowledge.controller.js` | JavaScript | 72 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/supportTicket.controller.js` | JavaScript | 413 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/transaction/transaction.controller.js` | JavaScript | 226 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/user/getAllVendors.controller.js` | JavaScript | 56 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/getFoodsByLocation.controller.js` | JavaScript | 314 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/getNearbyVendors.controller.js` | JavaScript | 167 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/getTrendingSearch.controller.js` | JavaScript | 292 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/getVendorLocations.controller.js` | JavaScript | 185 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/public.reviews.controller.js` | JavaScript | 485 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/user.auth.controller.js` | JavaScript | 589 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/user/user.controller.js` | JavaScript | 823 | Express request controller | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/controller/user/user.report.controller.js` | JavaScript | 173 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/user.reviews.controller.js` | JavaScript | 329 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/user/wallet.controller.js` | JavaScript | 193 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/vendor/food.controller.js` | JavaScript | 320 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/vendor/pickupCode.controller.js` | JavaScript | 13 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/vendor/vendor.auth.controller.js` | JavaScript | 860 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/vendor/vendor.controller.js` | JavaScript | 1296 | Express request controller | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/controller/vendor/vendor.notification.controller.js` | JavaScript | 179 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/controller/wallet/bankAccount.controller.js` | JavaScript | 153 | Express request controller | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/controller/wallet/wallet.controller.js` | JavaScript | 28 | Express request controller | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/controller/wallet/withdrawal.controller.js` | JavaScript | 854 | Express request controller | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/debug_menu.js` | JavaScript | 38 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/env.example` | Other | 23 | Other file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/index.js` | JavaScript | 756 | JavaScript file (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/jest.config.js` | JavaScript | 13 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/jobs/postgresOrderTimeout.job.js` | JavaScript | 16 | Scheduled cron job | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/jobs/riderAssignmentRetry.job.js` | JavaScript | 47 | Scheduled cron job | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/jobs/riderAssignmentTimeout.job.js` | JavaScript | 136 | Scheduled cron job | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/jobs/scheduledPayout.job.js` | JavaScript | 474 | Scheduled cron job | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/lib/support/faqContent.js` | JavaScript | 207 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/lib/support/knowledgeBase.js` | JavaScript | 63 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/middleware/adminAuth.js` | JavaScript | 73 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/auth.middleware.js` | JavaScript | 78 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/multiAuth.middleware.js` | JavaScript | 136 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/optionalAuth.middleware.js` | JavaScript | 32 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/riderAuth.middleware.js` | JavaScript | 93 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/role.middleware.js` | JavaScript | 10 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/tokenBlocklist.js` | JavaScript | 42 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/validate.middleware.js` | JavaScript | 21 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/middleware/vendor.middleware.js` | JavaScript | 93 | Express authentication/validation middleware | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/model/ActivityLog.js` | JavaScript | 63 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/Admin/admin.model.js` | JavaScript | 128 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/Admin/vendor.model.js` | JavaScript | - | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/Admin/wallet.model.js` | JavaScript | - | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/OrderBroadcastQueue.js` | JavaScript | 38 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/OrderTermination.js` | JavaScript | 61 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/banner.model.js` | JavaScript | 18 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/category.model.js` | JavaScript | 68 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/delivery.agent.model.js` | JavaScript | 27 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/discount/Discount.js` | JavaScript | 127 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/invoice.model.js` | JavaScript | 47 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/location/City.js` | JavaScript | 43 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/location/State.js` | JavaScript | 31 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/menu/Cart.js` | JavaScript | 158 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/menu/ChoiceGroupTemplate.js` | JavaScript | 74 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/menu/ComboItem.js` | JavaScript | 91 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/menu/MenuItem.js` | JavaScript | 145 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/menu/MenuItemChoice.js` | JavaScript | 99 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/menu/MenuItemPortion.js` | JavaScript | 68 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/menu/VendorMenuSection.js` | JavaScript | 43 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/notification/adminPushSubscription.model.js` | JavaScript | 34 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/notification/notification.model.js` | JavaScript | 124 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/notification/pushSubscription.model.js` | JavaScript | 39 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/notification/riderPushSubscription.model.js` | JavaScript | 35 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/notification/vendorPushSubscription.model.js` | JavaScript | 38 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/order/Order.js` | JavaScript | 361 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/order/PaymentAttempt.js` | JavaScript | 88 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/order/PaymentLock.js` | JavaScript | 30 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/order/PendingOrder.js` | JavaScript | 26 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/order/order.model.js` | JavaScript | - | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/platform/PlatformConfig.model.js` | JavaScript | 144 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/platformVehicle.model.js` | JavaScript | 17 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/promo/FreeDeliveryClaim.js` | JavaScript | 71 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/promo/FreeDeliveryPromo.js` | JavaScript | 19 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/promo/VendorDeliveryClaim.js` | JavaScript | 65 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/promo/VendorDeliveryPromo.js` | JavaScript | 36 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/qrScanEvent.model.js` | JavaScript | 27 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/refund.model.js` | JavaScript | 55 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/reports/report.model.js` | JavaScript | 26 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/reviews/review.model.js` | JavaScript | 25 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/rider.model.js` | JavaScript | 277 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/riderAssignment.model.js` | JavaScript | 68 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/search/analytics/searchTrend.model.js` | JavaScript | 56 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/supportKnowledge.model.js` | JavaScript | 20 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/supportRefundSettlement.model.js` | JavaScript | 29 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/supportTicket.model.js` | JavaScript | 143 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/transacrion/transaction.models.js` | JavaScript | 50 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/user.model.js` | JavaScript | 174 | Legacy Mongoose schema/model | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/model/vendor/VendorOrder.js` | JavaScript | 150 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/vendor/food.model.js` | JavaScript | 228 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/vendor/vendor.model.js` | JavaScript | 430 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/model/wallet/RiderWithdrawal.model.js` | JavaScript | 82 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/model/wallet/Withdrawal.model.js` | JavaScript | 85 | Legacy Mongoose schema/model | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/model/wallet/wallet.mode.js` | JavaScript | 90 | Legacy Mongoose schema/model | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/package-lock.json` | JSON | 11700 | NPM lockfile (dependency pinning/integrity) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/package.json` | JSON | 121 | Package manifest and scripts | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/prisma/backfill-user-password-hashes.js` | JavaScript | 54 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-admin-finance-parity.js` | JavaScript | 131 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/check-admin-orders-parity.js` | JavaScript | 162 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/check-admin-riders-parity.js` | JavaScript | 149 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-category-metrics-parity.js` | JavaScript | 131 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-finance-payments-parity.js` | JavaScript | 156 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/check-foods-by-location-parity.js` | JavaScript | 325 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-logistics-support-parity.js` | JavaScript | 135 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/check-menu-response-parity.js` | JavaScript | 690 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-platform-config-parity.js` | JavaScript | 118 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-public-reviews-parity.js` | JavaScript | 158 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-recommendation-response-parity.js` | JavaScript | 143 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-review-management-parity.js` | JavaScript | 154 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-rider-self-parity.js` | JavaScript | 165 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-search-response-parity.js` | JavaScript | 421 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-user-metrics-parity.js` | JavaScript | 134 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-vendor-metrics-parity.js` | JavaScript | 135 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/check-vendor-orders-parity.js` | JavaScript | 141 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/check-wallet-parity.js` | JavaScript | 160 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/import-admins-from-mongo.js` | JavaScript | 102 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/import-engagement-support-from-mongo.js` | JavaScript | 270 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/import-finance-payments-from-mongo.js` | JavaScript | 347 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/import-logistics-support-from-mongo.js` | JavaScript | 315 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/import-menu-from-mongo.js` | JavaScript | 658 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/import-orders-from-mongo.js` | JavaScript | 283 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/import-reviews-from-mongo.js` | JavaScript | 180 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/import-users-from-mongo.js` | JavaScript | 230 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/import-vendor-orders-from-mongo.js` | JavaScript | 182 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/import-wallets-from-mongo.js` | JavaScript | 286 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260522000000_init_full_schema/migration.sql` | SQL | 1955 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260522000100_add_menu_portion_max_quantity/migration.sql` | SQL | 3 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260522000200_expand_finance_kobo_columns/migration.sql` | SQL | 14 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260714000000_add_choice_group_image_url/migration.sql` | SQL | 2 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260715000000_remove_choice_group_image_url/migration.sql` | SQL | 2 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260813000000_add_migration_control_plane/migration.sql` | SQL | 42 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260813010000_add_order_contract_fields/migration.sql` | SQL | 17 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260813020000_add_menu_stock_template_fields/migration.sql` | SQL | 10 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260815000000_add_vendor_identity_contract_fields/migration.sql` | SQL | 8 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260815010000_add_choice_template_inventory/migration.sql` | SQL | 49 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260815020000_add_withdrawal_safety_fields/migration.sql` | SQL | 24 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822062718_add_support_workflow_fields/migration.sql` | SQL | 70 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822062848_add_support_escalated_status/migration.sql` | SQL | 2 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822100550_add_postgres_banners/migration.sql` | SQL | 45 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822102359_add_order_terminations/migration.sql` | SQL | 49 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822103344_add_disputed_delivery_status/migration.sql` | SQL | 2 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822132542_add_order_broadcast_queue/migration.sql` | SQL | 36 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822134621_add_rider_payout_fee_override/migration.sql` | SQL | 2 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822134857_add_admin_login_mfa_fields/migration.sql` | SQL | 4 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260822135545_move_login_mfa_fields_to_admin/migration.sql` | SQL | 4 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260826170000_add_delivery_otp_sessions/migration.sql` | SQL | 12 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260827090000_add_distance_delivery_pricing/migration.sql` | SQL | 32 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260928120000_add_external_logistics_delivery/migration.sql` | SQL | 27 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20260929170000_default_vendor_delivery_radius_15km/migration.sql` | SQL | 2 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/20261001230000_add_samka_callbacks_and_rider_tracking/migration.sql` | SQL | 19 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/migrations/migration_lock.toml` | TOML | 3 | SQL schema migration | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/reconcile-core.js` | JavaScript | 62 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/repair-legacy-money-units.js` | JavaScript | 74 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/schema.prisma` | Prisma | 1938 | PostgreSQL Prisma schema | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/prisma/seed-local-test.js` | JavaScript | 125 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/seed-samka-integration.js` | JavaScript | 50 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/seed-superadmin.js` | JavaScript | 34 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/seed.js` | JavaScript | 118 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-admin-mutations.js` | JavaScript | 24 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-cart-flow.js` | JavaScript | 148 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-discount-mutations.js` | JavaScript | 27 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-menu-mutations.js` | JavaScript | 45 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-notification-mutations.js` | JavaScript | 6 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-order-creation-flow.js` | JavaScript | 197 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/smoke-payment-fulfillment-flow.js` | JavaScript | 248 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/smoke-payment-initialization-flow.js` | JavaScript | 219 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/smoke-payment-verification-flow.js` | JavaScript | 187 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/smoke-payout-reservation.js` | JavaScript | 37 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/prisma/smoke-promo-mutations.js` | JavaScript | 39 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-rider-assignment-flow.js` | JavaScript | 435 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-rider-delivery-preflight.js` | JavaScript | 170 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-rider-termination-flow.js` | JavaScript | 96 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/smoke-support-mutations.js` | JavaScript | 13 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/prisma/sync-mongo-changes.js` | JavaScript | 207 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/render.yaml` | YAML | 13 | YAML file (tracked) | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/Admin/admin.auth.routes.js` | JavaScript | 33 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/Admin/admin.notification.routes.js` | JavaScript | 27 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/admin.routes.js` | JavaScript | 157 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/Admin/adminOrder.routes.js` | JavaScript | 34 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/banner.routes.js` | JavaScript | 9 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/discount.routes.js` | JavaScript | 21 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/location.routes.js` | JavaScript | 26 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/platformFinance.routes.js` | JavaScript | 90 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/Admin/platformPromo.routes.js` | JavaScript | 21 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/samkaLogisticsAdmin.routes.js` | JavaScript | 19 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/Admin/supportKnowledge.routes.js` | JavaScript | 10 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/supportTicket.routes.js` | JavaScript | 21 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/user_management_route/user.management.routes.js` | JavaScript | 25 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/Admin/vendorPromo.routes.js` | JavaScript | 17 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/admin.routes.js` | JavaScript | 16 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/category.routes.js` | JavaScript | 28 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/integrations/samkaLogistics.routes.js` | JavaScript | 13 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/location/location.routes.js` | JavaScript | 15 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/meat.routes.js` | JavaScript | 25 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/menu/cart.routes.js` | JavaScript | 20 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/menu/comboRoutes.js` | JavaScript | 22 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/menu/customerMenu.routes.js` | JavaScript | 27 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/menu/vendorMenu.routes.js` | JavaScript | 112 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/notification.routes.js` | JavaScript | 35 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/order/orderRoutes.js` | JavaScript | 54 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/payment/payment.routes.js` | JavaScript | 22 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/paystack/webhook.js` | JavaScript | 14 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/promo/publicPromo.routes.js` | JavaScript | 10 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/public/platformConfig.public.routes.js` | JavaScript | 8 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/qr.routes.js` | JavaScript | 13 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/rider.routes.js` | JavaScript | 89 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/riderAuth.routes.js` | JavaScript | 17 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/riderNotification.routes.js` | JavaScript | 42 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/socket.routes.js` | JavaScript | 55 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/supportTicket.routes.js` | JavaScript | 22 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/transaction/transaction.routes.js` | JavaScript | 22 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/user.routes.js` | JavaScript | 54 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/user/discount.routes.js` | JavaScript | 12 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/user/public.reviews.routes.js` | JavaScript | 19 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/user/public.routes.js` | JavaScript | 121 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/user/recommendation.routes.js` | JavaScript | 14 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/user/user.auth.routes.js` | JavaScript | 46 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/user/user.report.routes.js` | JavaScript | 29 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/user/user.reviews.routes.js` | JavaScript | 28 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/vendor/food.routes.js` | JavaScript | 19 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/vendor/food.search.routes.js` | JavaScript | 41 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/vendor/vendor.auth.routes.js` | JavaScript | 52 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/routes/vendor/vendor.notification.routes.js` | JavaScript | 26 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/vendor/vendor.routes.js` | JavaScript | 55 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/vendor/vendorOrder.routes.js` | JavaScript | 19 | Express route definitions | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/routes/wallet/wallet.routes.js` | JavaScript | 48 | Express route definitions | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/scratch/check_indexes.js` | JavaScript | 23 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scratch/fix_admin_order_controller.js` | JavaScript | 618 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/scratch/fix_rider_service.js` | JavaScript | 46 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scratch/inspect_vendor_order.js` | JavaScript | 44 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/scratch/inspect_vendor_order_with_commission.js` | JavaScript | 46 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/scripts/check_count.js` | JavaScript | 18 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/generate-vapid-keys.js` | JavaScript | 30 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/generateVapidKeys.js` | JavaScript | 12 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/generateVendorQr.js` | JavaScript | 35 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/import-rider-by-phone.js` | JavaScript | 57 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/migrateUsers.js` | JavaScript | 113 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/migrateVendorsAndAdmins.js` | JavaScript | 94 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/migrate_schemas.js` | JavaScript | 89 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/patch-platform-config.js` | JavaScript | 44 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/scripts/reconcile-amount-mismatch-payments.js` | JavaScript | 214 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/seed_categories.js` | JavaScript | 29 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/services/bank.service.js` | JavaScript | 87 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/cart.service.js` | JavaScript | 208 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/choiceGroupTemplate.service.js` | JavaScript | 103 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/choiceGroupTemplateSync.service.js` | JavaScript | 42 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/deliveryPricing.service.js` | JavaScript | 121 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/discount.service.js` | JavaScript | 279 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/emailTemplate.service.js` | JavaScript | 160 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/firebasePush.service.js` | JavaScript | 41 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/invoice.service.js` | JavaScript | 105 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/locationService.js` | JavaScript | 134 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/logistics/deliveryContents.js` | JavaScript | 22 | SamkaTech logistics integration service | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/logistics/pickupCode.service.js` | JavaScript | 101 | SamkaTech logistics integration service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/logistics/samkaLogistics.service.js` | JavaScript | 511 | SamkaTech logistics integration service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/logistics/samkaLogisticsAdmin.service.js` | JavaScript | 56 | SamkaTech logistics integration service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/menu.service.js` | JavaScript | 95 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/notification.service.js` | JavaScript | 1013 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/optionStock.service.js` | JavaScript | 269 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/order.v1.service.js` | JavaScript | 176 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/otp.service.js` | JavaScript | 206 | Backend domain service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/paymentHardening.service.js` | JavaScript | 325 | Backend domain service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/paystackTransactions.service.js` | JavaScript | 267 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/paystackTransfer.service.js` | JavaScript | 159 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/platformConfig.service.js` | JavaScript | 72 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/adminAccount.repository.js` | JavaScript | 36 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/adminDirectory.repository.js` | JavaScript | 136 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/adminFinance.repository.js` | JavaScript | 732 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/postgres/adminMutation.repository.js` | JavaScript | 18 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/adminOrders.repository.js` | JavaScript | 1204 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/postgres/adminRiders.repository.js` | JavaScript | 642 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/banner.repository.js` | JavaScript | 16 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/cart.repository.js` | JavaScript | 412 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/categoryMetrics.repository.js` | JavaScript | 35 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/compat.js` | JavaScript | 124 | PostgreSQL repository / migration adapter | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/postgres/discount.repository.js` | JavaScript | 37 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/dispute.repository.js` | JavaScript | 46 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/foodsByLocation.repository.js` | JavaScript | 262 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/geography.js` | JavaScript | 37 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/locationCategory.repository.js` | JavaScript | 108 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/locationMutation.repository.js` | JavaScript | 17 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/menuCatalog.repository.js` | JavaScript | 914 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/menuMutation.repository.js` | JavaScript | 86 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/migrationControl.js` | JavaScript | 70 | PostgreSQL repository / migration adapter | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/postgres/nearbyVendors.repository.js` | JavaScript | 73 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/notification.repository.js` | JavaScript | 143 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/orderCreation.repository.js` | JavaScript | 641 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/postgres/payment.repository.js` | JavaScript | 862 | PostgreSQL repository / migration adapter | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/services/postgres/payout.repository.js` | JavaScript | 204 | PostgreSQL repository / migration adapter | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/postgres/platformConfig.repository.js` | JavaScript | 112 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/promo.repository.js` | JavaScript | 29 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/publicReviews.repository.js` | JavaScript | 363 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/recommendation.repository.js` | JavaScript | 377 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/reviewManagement.repository.js` | JavaScript | 314 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/riderAccounts.repository.js` | JavaScript | 228 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/riderBroadcast.repository.js` | JavaScript | 52 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/riderHistory.repository.js` | JavaScript | 51 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/riderOtp.repository.js` | JavaScript | 108 | PostgreSQL repository / migration adapter | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/postgres/riderPayout.js` | JavaScript | 42 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/postgres/riderSelf.repository.js` | JavaScript | 1284 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/search.repository.js` | JavaScript | 531 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/shadowCompare.js` | JavaScript | 50 | PostgreSQL repository / migration adapter | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/postgres/support.repository.js` | JavaScript | 38 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/userIdentity.repository.js` | JavaScript | 300 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/userMetrics.repository.js` | JavaScript | 32 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/vendorIdentity.repository.js` | JavaScript | 318 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/vendorMetrics.repository.js` | JavaScript | 94 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/postgres/vendorOrders.repository.js` | JavaScript | 360 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/postgres/wallet.repository.js` | JavaScript | 233 | PostgreSQL repository / migration adapter | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/services/pushNotificationService.js` | JavaScript | 128 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/refund.service.js` | JavaScript | 202 | Backend domain service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/rider.service.js` | JavaScript | 1653 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/riderAssignment.service.js` | JavaScript | 420 | Backend domain service | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/services/supportRefundSettlement.service.js` | JavaScript | 114 | Backend domain service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/services/transferReconciliation.service.js` | JavaScript | 184 | Backend domain service | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/socket/events/orderEvents.js` | JavaScript | 103 | Socket.IO real-time handler | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/socket/rider.events.js` | JavaScript | 85 | Socket.IO real-time handler | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/socket/rider.socket.js` | JavaScript | 159 | Socket.IO real-time handler | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/socket/socketServer.js` | JavaScript | 414 | Socket.IO real-time handler | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/tests/__mocks__/ioredis.cjs` | JavaScript | 40 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/adminAuth.postgresIdentity.test.js` | JavaScript | 31 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/deliveryPricing.test.js` | JavaScript | 74 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/finance/paystackTransactions.test.js` | JavaScript | 85 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/helpers/factories.js` | JavaScript | 120 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/menu/choiceGroupTemplate.service.test.js` | JavaScript | 86 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/menu/optionStock.service.test.js` | JavaScript | 60 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/menuCategories.test.js` | JavaScript | 25 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/middleware/auth.test.js` | JavaScript | 269 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/middleware/riderAuth.test.js` | JavaScript | 136 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/middleware/tokenBlocklist.test.js` | JavaScript | 100 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/middleware/vendorAuth.test.js` | JavaScript | 187 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/order/payment.test.js` | JavaScript | 81 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/order/paymentFeeBearer.test.js` | JavaScript | 109 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/order/refund.test.js` | JavaScript | 108 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/orders/platform-money-calculations.test.js` | JavaScript | 29 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/payouts/scheduled-postgres-payout.test.js` | JavaScript | 25 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/qr.controller.test.js` | JavaScript | 233 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/rider/adminWithdrawals.test.js` | JavaScript | 476 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/rider/delivery.test.js` | JavaScript | 115 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/rider/overhaul.test.js` | JavaScript | 441 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/rider/rider-operational-regressions.test.js` | JavaScript | 91 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/rider/rider-payout-calculator.test.js` | JavaScript | 30 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/rider/termination-reoffer.test.js` | JavaScript | 25 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/samkaDeliveryContents.test.js` | JavaScript | 11 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/samkaDeliveryContentsBackfill.test.js` | JavaScript | 13 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/samkaHandoffRecovery.test.js` | JavaScript | 61 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/samkaLogisticsAdmin.controller.test.js` | JavaScript | 42 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tests/samkaPickupCodes.test.js` | JavaScript | 27 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/samkaPickupSignature.test.js` | JavaScript | 16 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/setup.js` | JavaScript | 90 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/supportChat.controller.test.js` | JavaScript | 147 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/vendor/onboardingReminder.test.js` | JavaScript | 101 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tests/vendor/vendorAvailability.test.js` | JavaScript | 25 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tmp/audit_admin_wallet.cjs` | JavaScript | 77 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tmp/audit_financial_paths.cjs` | JavaScript | 130 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/tmp/audit_missing_payout.cjs` | JavaScript | 78 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tmp/check_wallets.cjs` | JavaScript | 29 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/tmp/list_collections.cjs` | JavaScript | 17 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-API-staging/utils/errorHandler.js` | JavaScript | 7 | Backend utility helper | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/utils/generateTokens.js` | JavaScript | 21 | Backend utility helper | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/utils/jwt.js` | JavaScript | 99 | Backend utility helper | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/utils/moneyContract.js` | JavaScript | 56 | Backend utility helper | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/utils/payoutSchedule.js` | JavaScript | 30 | Backend utility helper | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/utils/paystackFees.js` | JavaScript | 95 | Backend utility helper | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/utils/promoIdentity.js` | JavaScript | 29 | Backend utility helper | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/utils/sendTokenCookie.js` | JavaScript | 63 | Backend utility helper | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/utils/token.js` | JavaScript | - | Backend utility helper | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-API-staging/utils/vendorAvailability.js` | JavaScript | 19 | Backend utility helper | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/utils/vendorOpenStatus.js` | JavaScript | 185 | Backend utility helper | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-API-staging/workers/broadcastTimeout.worker.js` | JavaScript | 89 | BullMQ background worker | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/workers/deliveryWatchdog.worker.js` | JavaScript | 157 | BullMQ background worker | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/workers/disputeEscalation.worker.js` | JavaScript | 67 | BullMQ background worker | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/workers/index.js` | JavaScript | 151 | BullMQ background worker | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-API-staging/.env.samkatech.local` | ENV | 3 | Environment configuration (ignored) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-API-staging/generated/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-API-staging/generated/prisma/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-API-staging/node_modules/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Admin/.env.example` | ENV | 3 | Environment configuration (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Admin/.gitignore` | Ignore | 28 | Ignore file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/eslint.config.mjs` | JavaScript | 23 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/jsconfig.json` | JSON | 7 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/next.config.mjs` | JavaScript | 145 | JavaScript file (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Admin/package-lock.json` | JSON | 9332 | NPM lockfile (dependency pinning/integrity) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/package.json` | JSON | 1 | Package manifest and scripts | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Admin/postcss.config.mjs` | JavaScript | 7 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/public/favicon.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/file.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/globe.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/android/launchericon-144x144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/android/launchericon-192x192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/android/launchericon-48x48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/android/launchericon-512x512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/android/launchericon-72x72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/android/launchericon-96x96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/icons.json` | JSON | 452 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/public/icons/ios/100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/1024.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/114.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/120.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/128.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/152.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/167.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/180.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/29.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/50.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/57.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/58.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/76.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/ios/87.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/LargeTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/LargeTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/LargeTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/LargeTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/LargeTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SmallTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SmallTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SmallTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SmallTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SmallTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SplashScreen.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SplashScreen.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SplashScreen.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SplashScreen.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/SplashScreen.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square150x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square150x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square150x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square150x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square150x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Square44x44Logo.targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/StoreLogo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/StoreLogo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/StoreLogo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/StoreLogo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/StoreLogo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Wide310x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Wide310x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Wide310x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Wide310x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/icons/windows/Wide310x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/logo.jpeg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/manifest.json` | JSON | 65 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/public/placeholder.jpg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Admin/public/sw.js` | JavaScript | 455 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/audit-logs/page.jsx` | JSX | 769 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/auth/login/page.jsx` | JSX | 164 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/admin/auth/verify/page.jsx` | JSX | 98 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/admin/banners/page.jsx` | JSX | 1219 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/categories/page.jsx` | JSX | 322 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/components/AdminLogoutHandler.jsx` | JSX | 40 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/coupons/page.jsx` | JSX | 647 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/dashboard/page.jsx` | JSX | 127 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/finance/page.jsx` | JSX | 1482 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/finance/payment-recovery/page.jsx` | JSX | 310 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/admin/finance/paystack/page.jsx` | JSX | 366 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/admin/layout.jsx` | JSX | 26 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/locations/page.jsx` | JSX | 805 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/logistics/deliveries/[deliveryId]/page.jsx` | JSX | 10 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/logistics/riders/[riderId]/page.jsx` | JSX | 238 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/logistics/riders/page.jsx` | JSX | 126 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/not-found.jsx` | JSX | 62 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/notifications/page.jsx` | JSX | 293 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/orders/[orderId]/page.jsx` | JSX | 901 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/orders/commission/page.jsx` | JSX | 448 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/orders/page.jsx` | JSX | 745 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/orders/pending/page.jsx` | JSX | 308 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/orders/platform/page.jsx` | JSX | 903 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/orders/refunds/page.jsx` | JSX | 302 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/payments/page.jsx` | JSX | 406 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/admin/promos/platform-delivery/page.jsx` | JSX | 856 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/promos/vendor-delivery/page.jsx` | JSX | 399 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/qr/page.jsx` | JSX | 313 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/reviews/page.jsx` | JSX | 332 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/riders/history/page.jsx` | JSX | 423 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/riders/page.jsx` | JSX | 1077 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/settings/platform/page.jsx` | JSX | 459 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/support/knowledge/page.jsx` | JSX | 40 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/support/page.jsx` | JSX | 959 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/users/page.jsx` | JSX | 892 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/vendors/[vendorId]/page.jsx` | JSX | 921 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/vendors/page.jsx` | JSX | 902 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/vendors/pending/[vendorId]/page.jsx` | JSX | 645 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/admin/vendors/pending/page.jsx` | JSX | 253 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/ChunkLoadRecovery.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/NavigationFeedback.jsx` | JSX | 45 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/NotificationBell.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/PWA/AdminPWABootstrap.jsx` | JSX | 13 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/PWA/PWAUpdateManager.jsx` | JSX | 121 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/PermanentInstallButton.jsx` | JSX | 160 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/ThemeToggle.jsx` | JSX | 46 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/admin/AdminDashboardLayout.jsx` | JSX | 706 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/admin/AdminProtectedRoute.jsx` | JSX | 37 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/admin/AdminRiderAssignmentModal.jsx` | JSX | 305 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/admin/CategoryModal.jsx` | JSX | 420 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/admin/CategoryTable.jsx` | JSX | 211 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/admin/DeleteConfirmationModal.jsx` | JSX | 61 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/admin/FeeOverrideModal.jsx` | JSX | 204 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/notifications/ClearNotificationsModal.jsx` | JSX | 80 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/notifications/NotificationPromptBanner.jsx` | JSX | 141 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/notifications/NotificationSettings.jsx` | JSX | 235 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/notifications/PushNotificationPrompt.jsx` | JSX | 166 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/components/notifications/RealtimeNotificationListener.jsx` | JSX | 95 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/components/toast/SwipeableToaster.jsx` | JSX | 61 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/context/AdminContext.jsx` | JSX | 153 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/context/ApiContext.jsx` | JSX | 34 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/context/SocketContext.jsx` | JSX | 359 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/context/ThemeContext.jsx` | JSX | 56 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/error.jsx` | JSX | 49 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/globals.css` | CSS | 520 | CSS file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/hooks/useNotificationManager.js` | JavaScript | 337 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/hooks/usePWAInstall.js` | JavaScript | 76 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/hooks/usePushNotifications.js` | JavaScript | 198 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/hooks/useRealtimeNotifications.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/layout.jsx` | JSX | 72 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/lib/adminApi.js` | JavaScript | 1114 | Frontend API/auth/runtime library | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Admin/src/app/lib/api.js` | JavaScript | 563 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/lib/apiConfig.js` | JavaScript | 151 | Frontend API/auth/runtime library | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Admin/src/app/lib/auth-token.js` | JavaScript | 102 | Frontend API/auth/runtime library | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Admin/src/app/lib/chunkRecovery.js` | JavaScript | 49 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/lib/push-notification-service.js` | JavaScript | 246 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/lib/pwa-utils.js` | JavaScript | 51 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/lib/socketService.js` | JavaScript | 224 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/lib/utils.js` | JavaScript | 55 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Admin/src/app/page.jsx` | JSX | 5 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/src/app/providers/QueryProvider.jsx` | JSX | 23 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Admin/.env.local` | ENV | 3 | Environment configuration (ignored) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Admin/.next/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Admin/node_modules/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/.env.example` | ENV | 1 | Environment configuration (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Frontend/.env.mobile.example` | ENV | 4 | Environment configuration (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Frontend/.gitignore` | Ignore | 59 | Ignore file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/.vscode/settings.json` | JSON | 3 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/CAPACITOR.md` | Markdown | 192 | Markdown file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/EXAMPLE_API_MIGRATION.js` | JavaScript | 315 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/.gitignore` | Ignore | 101 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/.gitignore` | Ignore | 2 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/build.gradle` | Gradle | 54 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/capacitor.build.gradle` | Gradle | 24 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/google-services.json` | JSON | 29 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/proguard-rules.pro` | Other | 21 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | Java/Kotlin | 26 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/src/main/AndroidManifest.xml` | XML | 51 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/src/main/java/com/melachow/customer/MainActivity.java` | Java/Kotlin | 170 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/drawable-land-hdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-land-mdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-land-xhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-land-xxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-land-xxxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-nodpi/logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-nodpi/melachow_splash.jpg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-nodpi/native_startup_splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-port-hdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-port-mdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-port-xhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-port-xxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-port-xxxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | XML | 34 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/drawable/ic_launcher_background.xml` | XML | 170 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/drawable/melachow_launcher.xml` | XML | 1 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/drawable/native_startup_background.xml` | XML | 8 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/src/main/res/drawable/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/layout/activity_main.xml` | XML | 12 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | XML | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | XML | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-hdpi/melachow_logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-mdpi/melachow_logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xhdpi/melachow_logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxhdpi/melachow_logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/mipmap-xxxhdpi/melachow_logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/app/src/main/res/values-v35/styles.xml` | XML | 14 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/values/ic_launcher_background.xml` | XML | 4 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/values/strings.xml` | XML | 7 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/values/styles.xml` | XML | 36 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/main/res/xml/file_paths.xml` | XML | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | Java/Kotlin | 18 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/build.gradle` | Gradle | 29 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/capacitor.settings.gradle` | Gradle | 21 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/gradle.properties` | Properties | 22 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/gradle/wrapper/gradle-wrapper.jar` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/android/gradle/wrapper/gradle-wrapper.properties` | Properties | 7 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/gradlew` | Gradle | 251 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/gradlew.bat` | Gradle | 94 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/settings.gradle` | Gradle | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/variables.gradle` | Gradle | 16 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/build.log` | Text | 362 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/capacitor.config.json` | JSON | 24 | JSON file (tracked) | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Frontend/components.json` | JSON | 22 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/debug-cookies.js` | JavaScript | 93 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/eslint.config.mjs` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/fix-cache.ps1` | PowerShell | 37 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/fix.js` | JavaScript | 44 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/fix2.js` | JavaScript | 48 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/git_status.txt` | Text | 20 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/ios/.gitignore` | Ignore | 13 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/ios/App/App.xcodeproj/project.pbxproj` | Other | 380 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | XML | 8 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/AppDelegate.swift` | Swift | 44 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json` | JSON | 14 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/Contents.json` | JSON | 6 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/Splash.imageset/Contents.json` | JSON | 13 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-reference.jpeg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/ios/App/App/Base.lproj/LaunchScreen.storyboard` | XML | 32 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/Base.lproj/Main.storyboard` | XML | 19 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/Info.plist` | XML | 83 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/ios/App/App/SceneDelegate.swift` | Swift | 24 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/CapApp-SPM/.gitignore` | Ignore | 9 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/ios/App/CapApp-SPM/Package.swift` | Swift | 37 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift` | Swift | 1 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/debug.xcconfig` | Other | 1 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/jsconfig.json` | JSON | 7 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/migrate-api-urls.ps1` | PowerShell | 120 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/mobile/Link.jsx` | JSX | 7 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/mobile/NativeRuntime.jsx` | JSX | 152 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/mobile/StartupFallback.jsx` | JSX | 18 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/mobile/api-url.mjs` | JavaScript | 22 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/mobile/axios.js` | JavaScript | 24 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/mobile/empty-component.jsx` | JSX | 2 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/mobile/geolocation.js` | JavaScript | 45 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/mobile/navigation.jsx` | JSX | 30 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/mobile/payment-state.mjs` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/mobile/payment.js` | JavaScript | 21 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/mobile/routes.mjs` | JavaScript | 59 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/mobile/transport.js` | JavaScript | 21 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/mobile/usePushNotifications.js` | JavaScript | 46 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/next.config.mjs` | JavaScript | 172 | JavaScript file (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Frontend/package-lock.json` | JSON | 10505 | NPM lockfile (dependency pinning/integrity) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/package.json` | JSON | 73 | Package manifest and scripts | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Frontend/playwright.mobile.config.mjs` | JavaScript | 17 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/postcss.config.mjs` | JavaScript | 7 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/public/favicon.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/file.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/globe.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/android/launchericon-144x144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/android/launchericon-192x192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/android/launchericon-48x48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/android/launchericon-512x512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/android/launchericon-72x72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/android/launchericon-96x96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/icons.json` | JSON | 452 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/public/icons/ios/100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/1024.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/114.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/120.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/128.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/152.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/167.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/180.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/29.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/50.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/57.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/58.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/76.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/ios/87.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/LargeTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/LargeTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/LargeTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/LargeTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/LargeTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SmallTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SmallTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SmallTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SmallTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SmallTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SplashScreen.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SplashScreen.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SplashScreen.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SplashScreen.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/SplashScreen.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square150x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square150x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square150x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square150x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square150x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Square44x44Logo.targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/StoreLogo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/StoreLogo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/StoreLogo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/StoreLogo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/StoreLogo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Wide310x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Wide310x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Wide310x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Wide310x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/icons/windows/Wide310x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/logo.jpeg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/manifest.json` | JSON | 64 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/public/melachow-splash-clean.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/melachow-vendor-splash-clean.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/placeholder.jpg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/public/sw.js` | JavaScript | 489 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/quick-fix-api-urls.ps1` | PowerShell | 165 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/scratch/preview_sitemap.js` | JavaScript | 69 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/scratch/sitemap_preview.xml` | XML | 43 | XML file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/scripts/build-mobile.mjs` | JavaScript | 131 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/scripts/mobile-doctor.mjs` | JavaScript | 24 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/scripts/serve-mobile.mjs` | JavaScript | 17 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-foods/layout.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-foods/layout.jsx` | JSX | 19 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-foods/metadata.js` | JavaScript | 15 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-foods/page.jsx` | JSX | 276 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-restaurants/layout.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-restaurants/layout.jsx` | JSX | 19 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-restaurants/metadata.js` | JavaScript | 15 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/all-restaurants/page.jsx` | JSX | 405 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/auth/forgot-password/page.jsx` | JSX | 15 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/auth/reset-password/page.jsx` | JSX | 20 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/auth/set-password/page.jsx` | JSX | 17 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/auth/signin/layout.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/auth/signin/page.jsx` | JSX | 15 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/auth/signup/page.jsx` | JSX | 16 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/auth/verify-account/page.jsx` | JSX | 20 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/auth/verify-registration/page.jsx` | JSX | 17 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/cart/page.jsx` | JSX | 23 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/checkout/page.jsx` | JSX | 834 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/combo-details/[comboId]/ComboDetailsClient.jsx` | JSX | 751 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/combo-details/[comboId]/page.jsx` | JSX | 65 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/components/CustomerBootstrapper.jsx` | JSX | 110 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/components/CustomerLogoutHandler.jsx` | JSX | 33 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/faqs/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/faqs/layout.jsx` | JSX | 18 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/faqs/metadata.js` | JavaScript | 14 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/faqs/page.jsx` | JSX | 430 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/food-details/[foodId]/FoodDetailsClient.jsx` | JSX | 1231 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/food-details/[foodId]/page.jsx` | JSX | 67 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/get-help/page.jsx` | JSX | 15 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/get-help/tickets/[ticketId]/page.jsx` | JSX | 24 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/home/layout.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/home/layout.jsx` | JSX | 20 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/home/metadata.js` | JavaScript | 17 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/home/page.jsx` | JSX | 60 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/install/InstallClient.jsx` | JSX | 314 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/install/page.jsx` | JSX | 37 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/layout.jsx` | JSX | 86 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/notifications/page.jsx` | JSX | 270 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/orders/page.jsx` | JSX | 536 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/page.jsx` | JSX | 64 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/profile/address/page.jsx` | JSX | 12 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/profile/edit/page.jsx` | JSX | 350 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/profile/need_help_contact_info/NeedHelp.jsx` | JSX | 137 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/profile/notification-settings/page.jsx` | JSX | 19 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/profile/page.jsx` | JSX | 108 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/profile/reviews/page.jsx` | JSX | 148 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/profile/wallet/page.jsx` | JSX | 606 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/profile/wallet/verify/page.jsx` | JSX | 114 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/restaurants/[vendorId]/RestaurantClient.jsx` | JSX | 449 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/restaurants/[vendorId]/page.jsx` | JSX | 39 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/search/layout.js` | JavaScript | 16 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/search/layout.jsx` | JSX | 16 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/search/metadata.js` | JavaScript | 12 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/search/page.jsx` | JSX | 17 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/splash/page.jsx` | JSX | 9 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/support/page.jsx` | JSX | 235 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/track-orders/[orderId]/page.jsx` | JSX | 19 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/trending-foods/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/trending-foods/layout.jsx` | JSX | 18 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/trending-foods/metadata.js` | JavaScript | 14 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/trending-foods/page.jsx` | JSX | 266 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/trending-restaurants/layout.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/trending-restaurants/layout.jsx` | JSX | 18 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/trending-restaurants/page.jsx` | JSX | 263 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/(customer)/user/wallet/page.jsx` | JSX | 461 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/(customer)/verify-payment/page.jsx` | JSX | 19 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/GrubDashLogo/GrubDashLogo.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/apple-icon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/src/app/auth/partner/page.jsx` | JSX | 96 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/AddressAutocomplete.jsx` | JSX | 72 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/App_Header/Header.jsx` | JSX | 142 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/App_Header/Header2.jsx` | JSX | 61 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/App_Header/ProfileIconWithBadge.jsx` | JSX | 45 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/BackButton.jsx` | JSX | 33 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/BottomNav.jsx` | JSX | 161 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Cart/AddToCartModal.jsx` | JSX | 132 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Cart/CartValidator.jsx` | JSX | 175 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Cart/ComboCustomizationModal.jsx` | JSX | 404 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Cart/FoodCustomizationModal.jsx` | JSX | 580 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Checkout/OrderErrorDisplay.jsx` | JSX | 206 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/Checkout/OrderProcessingLoader.jsx` | JSX | 137 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/ChunkLoadRecovery.jsx` | JSX | 30 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/DeliveryPinField.jsx` | JSX | 46 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/Category.jsx` | JSX | 164 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/DynamicBannerCarousel.jsx` | JSX | 206 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/FeatureSlider.jsx` | JSX | 76 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/FoodList.jsx` | JSX | 214 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/HomeHeader.jsx` | JSX | 129 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/PromoAnnouncementBanner.jsx` | JSX | 195 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/PromoBanner.jsx` | JSX | 53 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/RecommendedList.jsx` | JSX | 64 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/SearchBar.jsx` | JSX | 48 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/SmartRecommendations.jsx` | JSX | 214 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/TrendingFoods.jsx` | JSX | 211 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Home_Components/VendorList.jsx` | JSX | 443 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/InstallPWA.jsx` | JSX | 168 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/JsonLd.jsx` | JSX | 15 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/LocationSelector.jsx` | JSX | 294 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/NativePushRuntime.jsx` | JSX | 74 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/NavigationFeedback.jsx` | JSX | 45 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/NoFoodsFound.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/NotificationBell.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/PWA/PWAInstallPrompt.jsx` | JSX | 271 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/PWA/PWAUpdateManager.jsx` | JSX | 192 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/PermanentInstallButton.jsx` | JSX | 148 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/RoutePrefetcher.jsx` | JSX | 54 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/SplashScreen.jsx` | JSX | 56 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/Support/ChatWidget.jsx` | JSX | 282 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/VerifyPayment.jsx` | JSX | 429 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/conditional_bottom_nav/ConditionalBottomNav.jsx` | JSX | 64 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-combo/wizard/Step1BasicInfo.jsx` | JSX | 243 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-combo/wizard/Step2Categories.jsx` | JSX | 175 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-combo/wizard/Step3Pricing.jsx` | JSX | 110 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-combo/wizard/Step4AddOnsAndReview.jsx` | JSX | 679 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-combo/wizard/Step5Review.jsx` | JSX | 232 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/ChoiceGroupsSection.jsx` | JSX | 410 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/DetailsSection.jsx` | JSX | 168 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/ImagesSection.jsx` | JSX | 113 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/InventorySection.jsx` | JSX | 169 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/MetadataSection.jsx` | JSX | 360 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/PortionsSection.jsx` | JSX | 157 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/PricingSection.jsx` | JSX | 150 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/SectionHeader.jsx` | JSX | 117 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/TagsSection.jsx` | JSX | 143 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/wizard/Step1BasicInfo.jsx` | JSX | 274 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/wizard/Step1BasicInfo_copy.jsx` | JSX | 251 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/wizard/Step2Categories.jsx` | JSX | 175 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/wizard/Step3Portions.jsx` | JSX | 361 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/wizard/Step4AddOns.jsx` | JSX | 681 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/create-food/wizard/Step5Review.jsx` | JSX | 229 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/logo/Logo.jsx` | JSX | 15 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/modals/GlobalComboModal.jsx` | JSX | 31 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/modals/GlobalFoodModal.jsx` | JSX | 22 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/notifications/ClearNotificationsModal.jsx` | JSX | 80 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/notifications/NotificationSettings.jsx` | JSX | 38 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/notifications/PushNotificationPrompt.jsx` | JSX | 156 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/notifications/RealtimeNotificationListener.jsx` | JSX | 95 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/order/StatusBadge.jsx` | JSX | 16 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/order/StatusButtons.jsx` | JSX | 35 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/order/VendorOrderCard.jsx` | JSX | 381 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/protected-route/ProtectedRoute.jsx` | JSX | 47 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/restaurants/FoodCard.jsx` | JSX | 38 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/restaurants/FoodDrawer.jsx` | JSX | - | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/restaurants/RestaurantList.jsx` | JSX | 28 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/restaurants/ReviewsSection.jsx` | JSX | 618 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/restaurants/ReviewsSectionFixed.jsx` | JSX | 905 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/rider/NewOrderModal.jsx` | JSX | 183 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/searchs/Searchs.jsx` | JSX | 697 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/shared/PlatformCategoryPicker.jsx` | JSX | 291 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/skeleton/AddressSkeleton.jsx` | JSX | 30 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/skeleton/CheckoutPageSkeleton.jsx` | JSX | 73 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/skeleton/OrderCardSkeleton.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/skeleton/OrderTrackingSkeleton.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/support_component/GetHelp.jsx` | JSX | 423 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/toast/SwipeableToaster.jsx` | JSX | 62 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/toast/showAnimatedToast.jsx` | JSX | 65 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/track/TrackOrder.jsx` | JSX | 973 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/AddressList.jsx` | JSX | 51 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/AddressModal.jsx` | JSX | 139 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/DeleteModal.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/ProfileForm.jsx` | JSX | 104 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/SidebarContent.jsx` | JSX | 129 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/UserAddress.jsx` | JSX | 461 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/User_Profile.jsx` | JSX | 302 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/user_profile/helpers/uploadToCloudinary.js` | JavaScript | 29 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/users/FoodList/FoodList.jsx` | JSX | 154 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/users/auth/AuthFrame.jsx` | JSX | 29 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/users/auth/ForgotPassword.jsx` | JSX | 207 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/users/auth/ResetPassword.jsx` | JSX | 408 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/users/auth/SetPassword.jsx` | JSX | 245 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/users/auth/SignUp.jsx` | JSX | 250 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/users/auth/Signin.jsx` | JSX | 179 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/users/auth/VerifyAccount.jsx` | JSX | 354 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/users/auth/VerifyRegistration.jsx` | JSX | 335 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/vendors_component/VendorDashboardHeader.jsx` | JSX | 152 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/auth/ForgotPassword.jsx` | JSX | 129 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/vendors_component/auth/ResetPassword.jsx` | JSX | 168 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/vendors_component/auth/SetPassword.jsx` | JSX | 190 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/vendors_component/auth/VerifyAccount.jsx` | JSX | 335 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/vendors_component/auth/VerifyRegistration.jsx` | JSX | 231 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/components/vendors_component/foods/AddFoodModal.jsx` | JSX | 235 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/foods/DeleteModal.jsx` | JSX | - | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/foods/EditFoodModal.jsx` | JSX | 112 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/foods/FoodTable.jsx` | JSX | 54 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/layout/DashboardLayout.jsx` | JSX | 65 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/layout/Header.jsx` | JSX | 178 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/layout/Sidebar.jsx` | JSX | 325 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/components/vendors_component/profile/profile.jsx` | JSX | 559 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/context/ApiContext.jsx` | JSX | 36 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/context/CartContext.js` | JavaScript | 455 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/context/CreateComboStore.jsx` | JSX | 296 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/context/CreateFoodStore.js` | JavaScript | 225 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/context/ProfileContext.jsx` | JSX | 203 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/context/RiderContext.jsx` | JSX | 261 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/context/SocketContext.jsx` | JSX | 361 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/context/ThemeContext.jsx` | JSX | 47 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/context/VendorProfileContext.jsx` | JSX | 211 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/error.jsx` | JSX | 57 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/favicon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/src/app/favicon_backup.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/src/app/globals.css` | CSS | 450 | CSS file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useActivePromos.js` | JavaScript | 42 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useCategories.js` | JavaScript | 37 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useComboById.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useMenu.js` | JavaScript | 267 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useNotificationManager.js` | JavaScript | 337 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useOrderTracking.js` | JavaScript | 45 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/usePWAInstall.js` | JavaScript | 76 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/usePromoEligibility.js` | JavaScript | 56 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/usePushNotifications.js` | JavaScript | 181 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/hooks/useRealtimeNotifications.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useUserStorage.js` | JavaScript | 89 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/hooks/useVendorCombos.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useVendorFoodQuery.js` | JavaScript | 31 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useVendorFoods.js` | JavaScript | 14 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/useVendorQueries.js` | JavaScript | 154 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/hooks/vendorStorage.js` | JavaScript | 96 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/layout.jsx` | JSX | 239 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/lib/addressUtils.js` | JavaScript | 23 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/adminApi.js` | JavaScript | 592 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/api.js` | JavaScript | 681 | Frontend API/auth/runtime library | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Frontend/src/app/lib/apiConfig.js` | JavaScript | 151 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/auth-token.js` | JavaScript | 104 | Frontend API/auth/runtime library | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Frontend/src/app/lib/chunkRecovery.js` | JavaScript | 57 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/customerApi.js` | JavaScript | 63 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/deliveryEta.js` | JavaScript | 59 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/deliveryGeolocation.js` | JavaScript | 87 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/locationService.js` | JavaScript | 425 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/menuApi.js` | JavaScript | 562 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/native-push-client.js` | JavaScript | 37 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/nigeriaStates.js` | JavaScript | 303 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/orderService.js` | JavaScript | 220 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/orderTransformers.js` | JavaScript | 392 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/promoDevice.js` | JavaScript | 24 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/push-notification-service.js` | JavaScript | 235 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/pwa-utils.js` | JavaScript | 116 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/riderApi.js` | JavaScript | 158 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/shareCustomerContent.js` | JavaScript | 32 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/socketService.js` | JavaScript | 224 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/userApi.js` | JavaScript | 54 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/utils.js` | JavaScript | 55 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/vendor-time/OpenOrClose.js` | JavaScript | 7 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/vendor-time/vendorTime.js` | JavaScript | 171 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/vendorApi.js` | JavaScript | 206 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/vendorId.js` | JavaScript | 20 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/lib/vendorProfileApi.js` | JavaScript | 132 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/app/loading.jsx` | JSX | 27 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/AddressModal.jsx` | JSX | 223 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/DeleteConfirmModal.jsx` | JSX | 137 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/FoodDetailsModal.jsx` | JSX | 304 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/ReviewModal.jsx` | JSX | 143 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/create/MetadataModal.jsx` | JSX | 106 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/create/PreviewModal.jsx` | JSX | 430 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/create/VariantsModal.jsx` | JSX | 183 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/update/MetadataModal.jsx` | JSX | 106 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/update/PreviewModal.jsx` | JSX | 67 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/modals/update/VariantsModal.jsx` | JSX | 279 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/not-found.jsx` | JSX | 84 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/offline/page.jsx` | JSX | 73 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/providers/QueryProvider.jsx` | JSX | 28 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/robots.js` | JavaScript | 65 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/sitemap.js` | JavaScript | 84 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/FoodDetailsSkeleton.jsx` | JSX | 97 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/FoodListSkeleton.jsx` | JSX | 91 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/HomeFoodListSkeleton.jsx` | JSX | 53 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/ProfilePageSkeleton.jsx` | JSX | 7 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/SearchFoodSkeleton.jsx` | JSX | 34 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/SearchPageSkeleton.jsx` | JSX | 97 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/UpdateFoodSkeleton.jsx` | JSX | 119 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/VendorCardSkeleton.jsx` | JSX | 47 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/VendorDashboardSkeleton.jsx` | JSX | 114 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/VendorProfileImageSkeleton.jsx` | JSX | 8 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/VendorProfileSkeleton.jsx` | JSX | 55 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/VendorSkeleton.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/skeleton/ViewVendorSkeleton.jsx` | JSX | 76 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/store/comboModalStore.js` | JavaScript | 9 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/store/foodModalStore.js` | JavaScript | 9 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/app/store/userLocationStore.js` | JavaScript | 48 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/FreeDeliveryBadge.jsx` | JSX | 18 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/avatar.jsx` | JSX | 47 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/badge.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/button.jsx` | JSX | 56 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/card.jsx` | JSX | 101 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/input.jsx` | JSX | 24 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/label.jsx` | JSX | 23 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/ui/switch.jsx` | JSX | 29 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/components/vendor/VendorPromoStatus.jsx` | JSX | 53 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/src/lib/api/promos.js` | JavaScript | 74 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/lib/utils.js` | JavaScript | 6 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/src/proxy.js` | JavaScript | 16 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/test-vendor-auth.js` | JavaScript | 365 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/tests/mobile-browser/app.spec.mjs` | JavaScript | 68 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/tests/mobile-payment.test.mjs` | JavaScript | 23 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/tests/mobile.test.mjs` | JavaScript | 34 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/tree.txt` | Text | 218 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/tsconfig.json` | JSON | 42 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/vendors_orders_backup/[id]/page.jsx` | JSX | 1006 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/scratch/device-screen.png` | Binary | - | Binary asset or artifact (untracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/.env.android-signing.json` | JSON | 4 | Environment configuration (ignored) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/.env.local` | ENV | 3 | Environment configuration (ignored) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Frontend/.env.mobile.local` | ENV | 1 | Environment configuration (ignored) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Frontend/.mobile-build/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/.next/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/android/.gradle/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/android/app/build/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/android/app/src/main/assets/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/android/app/src/main/assets/capacitor.config.json` | JSON | 24 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/src/main/assets/capacitor.plugins.json` | JSON | 26 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/android/app/src/main/assets/public/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/android/app/src/main/res/xml/config.xml` | XML | 6 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/build/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/android/capacitor-cordova-android-plugins/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/android/local.properties` | Properties | 1 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/android/melachow-upload.jks` | Binary | - | Binary asset or artifact (ignored) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/ios/App/App/capacitor.config.json` | JSON | 32 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Frontend/ios/App/App/config.xml` | XML | 6 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/App/App/public/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/ios/App/CapApp-SPM/README.md` | Markdown | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Frontend/ios/capacitor-cordova-ios-plugins/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/next-env.d.ts` | TypeScript | 7 | TypeScript file (ignored) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Frontend/node_modules/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Frontend/scratch/app-debug-before-share.apk` | Binary | - | Binary asset or artifact (ignored) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Frontend/test-results/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/.env.native.example` | ENV | 2 | Environment configuration (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Vendor/.gitignore` | Ignore | 51 | Ignore file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/EXAMPLE_API_MIGRATION.js` | JavaScript | 315 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/.gitignore` | Ignore | 101 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/.gitignore` | Ignore | 2 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/build.gradle` | Gradle | 54 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/capacitor.build.gradle` | Gradle | 23 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/google-services.json` | JSON | 48 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/proguard-rules.pro` | Other | 21 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | Java/Kotlin | 26 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/src/main/AndroidManifest.xml` | XML | 43 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/src/main/java/com/melachow/vendor/MainActivity.java` | Java/Kotlin | 68 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/java/com/melachow/vendor/ReceiptPrinterPlugin.java` | Java/Kotlin | 36 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/drawable-land-hdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-land-mdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-land-xhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-land-xxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-land-xxxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-port-hdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-port-mdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-port-xhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-port-xxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-port-xxxhdpi/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | XML | 34 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/drawable/ic_launcher_background.xml` | XML | 170 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/drawable/splash.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/layout/activity_main.xml` | XML | 12 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | XML | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | XML | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/values-v35/styles.xml` | XML | 26 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/values/ic_launcher_background.xml` | XML | 4 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/values/strings.xml` | XML | 7 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/values/styles.xml` | XML | 34 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/main/res/xml/file_paths.xml` | XML | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | Java/Kotlin | 18 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/build.gradle` | Gradle | 29 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/capacitor.settings.gradle` | Gradle | 18 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/gradle.properties` | Properties | 22 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/gradle/wrapper/gradle-wrapper.jar` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/gradle/wrapper/gradle-wrapper.properties` | Properties | 7 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/gradlew` | Gradle | 251 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/gradlew.bat` | Gradle | 94 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/settings.gradle` | Gradle | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/variables.gradle` | Gradle | 16 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/capacitor.config.ts` | TypeScript | 16 | TypeScript file (tracked) | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Vendor/components.json` | JSON | 22 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/debug-cookies.js` | JavaScript | 93 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/eslint.config.mjs` | JavaScript | 16 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/fix-cache.ps1` | PowerShell | 37 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/fix.js` | JavaScript | 44 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/fix2.js` | JavaScript | 48 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/ios/.gitignore` | Ignore | 13 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/ios/App/App.xcodeproj/project.pbxproj` | Other | 380 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | XML | 8 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/AppDelegate.swift` | Swift | 44 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json` | JSON | 14 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/Contents.json` | JSON | 6 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/Splash.imageset/Contents.json` | JSON | 13 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/Splash.imageset/splash-clean.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/ios/App/App/Assets.xcassets/Splash.imageset/splash-reference.jpeg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/ios/App/App/Base.lproj/LaunchScreen.storyboard` | XML | 32 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/Base.lproj/Main.storyboard` | XML | 19 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/Info.plist` | XML | 72 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/ios/App/App/SceneDelegate.swift` | Swift | 24 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/CapApp-SPM/.gitignore` | Ignore | 9 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/ios/App/CapApp-SPM/Package.swift` | Swift | 35 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift` | Swift | 1 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/debug.xcconfig` | Other | 1 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/jsconfig.json` | JSON | 7 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/migrate-api-urls.ps1` | PowerShell | 120 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/Link.jsx` | JSX | 4 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/NativeRuntime.jsx` | JSX | 21 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/VendorStartup.jsx` | JSX | 39 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/api-url.mjs` | JavaScript | 13 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/axios.js` | JavaScript | 20 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/empty-component.jsx` | JSX | 2 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/navigation.jsx` | JSX | 20 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/routes.mjs` | JavaScript | 36 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/transport.js` | JavaScript | 15 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/native/vendor-app-icon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/next.config.mjs` | JavaScript | 146 | JavaScript file (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Vendor/package-lock.json` | JSON | 10682 | NPM lockfile (dependency pinning/integrity) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/package.json` | JSON | 1 | Package manifest and scripts | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Vendor/postcss.config.mjs` | JavaScript | 7 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/public/favicon.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/file.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/globe.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/android/launchericon-144x144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/android/launchericon-192x192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/android/launchericon-48x48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/android/launchericon-512x512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/android/launchericon-72x72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/android/launchericon-96x96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/icons.json` | JSON | 452 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/public/icons/ios/100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/1024.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/114.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/120.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/128.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/152.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/167.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/180.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/29.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/50.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/57.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/58.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/76.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/ios/87.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/LargeTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/LargeTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/LargeTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/LargeTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/LargeTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SmallTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SmallTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SmallTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SmallTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SmallTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SplashScreen.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SplashScreen.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SplashScreen.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SplashScreen.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/SplashScreen.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square150x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square150x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square150x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square150x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square150x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Square44x44Logo.targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/StoreLogo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/StoreLogo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/StoreLogo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/StoreLogo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/StoreLogo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Wide310x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Wide310x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Wide310x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Wide310x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/icons/windows/Wide310x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/logo.jpeg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/manifest.json` | JSON | 62 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/public/melachow-splash.jpeg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/melachow-vendor-splash-clean.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/placeholder.jpg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/public/sw.js` | JavaScript | 444 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/quick-fix-api-urls.ps1` | PowerShell | 165 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/scripts/build-native.mjs` | JavaScript | 32 | Operational or build script | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/.gitignore` | Ignore | 4 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/Cargo.lock` | Other | 4468 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/Cargo.toml` | TOML | 26 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/build.rs` | Rust | 3 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/capabilities/default.json` | JSON | 11 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/icons/128x128.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/128x128@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/32x32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/64x64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square107x107Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square142x142Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square150x150Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square284x284Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square30x30Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square310x310Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square44x44Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square71x71Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/Square89x89Logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/StoreLogo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-anydpi-v26/ic_launcher.xml` | XML | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-hdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-hdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-hdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-mdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-mdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_round.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/android/values/ic_launcher_background.xml` | XML | 4 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/icons/icon.icns` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/icon.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/icon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-20x20@1x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-20x20@2x-1.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-20x20@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-20x20@3x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-29x29@1x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-29x29@2x-1.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-29x29@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-29x29@3x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-40x40@1x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-40x40@2x-1.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-40x40@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-40x40@3x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-512@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-60x60@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-60x60@3x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-76x76@1x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-76x76@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/icons/ios/AppIcon-83.5x83.5@2x.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src-tauri/src/lib.rs` | Rust | 16 | Native mobile/desktop wrapper file | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Vendor/src-tauri/src/main.rs` | Rust | 6 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src-tauri/tauri.conf.json` | JSON | 43 | Native mobile/desktop wrapper file | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Vendor/src/app/GrubDashLogo/GrubDashLogo.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/apple-icon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src/app/components/BackButton.jsx` | JSX | 33 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/BottomNav.jsx` | JSX | 146 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/ChunkLoadRecovery.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/InstallPWA.jsx` | JSX | 168 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/JsonLd.jsx` | JSX | 15 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/LocationSelector.jsx` | JSX | 294 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/NativePushRuntime.jsx` | JSX | 70 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/NavigationFeedback.jsx` | JSX | 45 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/NoFoodsFound.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/NotificationBell.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/PWA/PWAInstallPrompt.jsx` | JSX | 271 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/PWA/PWAUpdateManager.jsx` | JSX | 183 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/PermanentInstallButton.jsx` | JSX | 148 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/SplashScreen.jsx` | JSX | 67 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/VerifyPayment.jsx` | JSX | 311 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/create-combo/wizard/Step1BasicInfo.jsx` | JSX | 243 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-combo/wizard/Step2Categories.jsx` | JSX | 175 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-combo/wizard/Step3Pricing.jsx` | JSX | 110 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-combo/wizard/Step4AddOnsAndReview.jsx` | JSX | 701 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-combo/wizard/Step5Review.jsx` | JSX | 236 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/ChoiceGroupsSection.jsx` | JSX | 410 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/DetailsSection.jsx` | JSX | 168 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/ImagesSection.jsx` | JSX | 113 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/InventorySection.jsx` | JSX | 169 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/MetadataSection.jsx` | JSX | 360 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/PortionsSection.jsx` | JSX | 157 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/PricingSection.jsx` | JSX | 150 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/SectionHeader.jsx` | JSX | 117 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/TagsSection.jsx` | JSX | 143 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/MenuBasics.jsx` | JSX | 232 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/MenuCategories.jsx` | JSX | 170 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/MenuChoices.jsx` | JSX | 451 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/MenuPricing.jsx` | JSX | 147 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/MenuReview.jsx` | JSX | 180 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/Step1BasicInfo.jsx` | JSX | 274 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/Step1BasicInfo_copy.jsx` | JSX | 251 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/Step2Categories.jsx` | JSX | 175 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/Step3Portions.jsx` | JSX | 361 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/Step3Price.jsx` | JSX | 70 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/Step4AddOns.jsx` | JSX | 731 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/create-food/wizard/Step5Review.jsx` | JSX | 188 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/logo/Logo.jsx` | JSX | 15 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/notifications/ClearNotificationsModal.jsx` | JSX | 80 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/notifications/NotificationPromptBanner.jsx` | JSX | 143 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/notifications/NotificationSettings.jsx` | JSX | 235 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/notifications/PushNotificationPrompt.jsx` | JSX | 156 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/notifications/RealtimeNotificationListener.jsx` | JSX | 95 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/IncomingOrders.jsx` | JSX | 85 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/OrderActions.jsx` | JSX | 113 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/OrderReceiptItems.jsx` | JSX | 89 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/PickupCodeControl.jsx` | JSX | 58 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/StatusBadge.jsx` | JSX | 16 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/StatusButtons.jsx` | JSX | 35 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/VendorOrderCard.jsx` | JSX | 95 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/order/vendor-orders.css` | CSS | 1174 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/protected-route/ProtectedRoute.jsx` | JSX | 47 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/rider/NewOrderModal.jsx` | JSX | 183 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/searchs/Searchs.jsx` | JSX | 532 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/shared/PlatformCategoryPicker.jsx` | JSX | 121 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/shared/SavedChoiceGroupPicker.jsx` | JSX | 178 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/shared/category-picker.css` | CSS | 142 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/skeleton/AddressSkeleton.jsx` | JSX | 30 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/skeleton/CheckoutPageSkeleton.jsx` | JSX | 73 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/skeleton/OrderCardSkeleton.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/skeleton/OrderTrackingSkeleton.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/support_component/GetHelp.jsx` | JSX | 176 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/toast/SwipeableToaster.jsx` | JSX | 62 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/toast/showAnimatedToast.jsx` | JSX | 61 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/track/TrackOrder.jsx` | JSX | 854 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/user_profile/helpers/uploadToCloudinary.js` | JavaScript | 27 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendor-workspace/vendor-workspace.css` | CSS | 103 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/VendorDashboardHeader.jsx` | JSX | 370 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/auth/ForgotPassword.jsx` | JSX | 130 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/vendors_component/auth/ResetPassword.jsx` | JSX | 167 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/vendors_component/auth/SetPassword.jsx` | JSX | 191 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/vendors_component/auth/VerifyAccount.jsx` | JSX | 335 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/vendors_component/auth/VerifyRegistration.jsx` | JSX | 231 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/components/vendors_component/foods/AddFoodModal.jsx` | JSX | 235 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/foods/DeleteModal.jsx` | JSX | - | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/foods/EditFoodModal.jsx` | JSX | 112 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/foods/FoodTable.jsx` | JSX | 54 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/layout/DashboardLayout.jsx` | JSX | 65 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/layout/Header.jsx` | JSX | 178 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/layout/Sidebar.jsx` | JSX | 399 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/location/VendorLocationNotice.jsx` | JSX | 132 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/components/vendors_component/profile/profile.jsx` | JSX | 620 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/context/ApiContext.jsx` | JSX | 34 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/context/CartContext.js` | JavaScript | 244 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/context/CreateComboStore.jsx` | JSX | 296 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/context/CreateFoodStore.js` | JavaScript | 234 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/context/ProfileContext.jsx` | JSX | 186 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/context/RiderContext.jsx` | JSX | 261 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/context/SocketContext.jsx` | JSX | 367 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/context/ThemeContext.jsx` | JSX | 45 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/context/VendorProfileContext.jsx` | JSX | 213 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/error.jsx` | JSX | 57 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/favicon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src/app/favicon_backup.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/src/app/globals.css` | CSS | 292 | CSS file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useActivePromos.js` | JavaScript | 40 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useCategories.js` | JavaScript | 37 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useComboById.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useMenu.js` | JavaScript | 182 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useNotificationManager.js` | JavaScript | 338 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useOrderTracking.js` | JavaScript | 45 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/usePWAInstall.js` | JavaScript | 76 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/usePromoEligibility.js` | JavaScript | 56 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/usePushNotifications.js` | JavaScript | 216 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/hooks/useRealtimeNotifications.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useUserStorage.js` | JavaScript | 101 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/hooks/useVendorCombos.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useVendorFoodQuery.js` | JavaScript | 31 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useVendorFoods.js` | JavaScript | 14 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useVendorOrders.js` | JavaScript | 38 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/useVendorQueries.js` | JavaScript | 152 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/hooks/vendorStorage.js` | JavaScript | 97 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/layout.jsx` | JSX | 99 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/lib/adminApi.js` | JavaScript | 592 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/api.js` | JavaScript | 572 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/apiConfig.js` | JavaScript | 151 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/auth-token.js` | JavaScript | 104 | Frontend API/auth/runtime library | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Vendor/src/app/lib/capturePreciseLocation.js` | JavaScript | 99 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/choiceGroupTemplates.js` | JavaScript | 24 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/chunkRecovery.js` | JavaScript | 49 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/locationService.js` | JavaScript | 425 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/menuApi.js` | JavaScript | 572 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/menuCategories.mjs` | JavaScript | 50 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/menuDraft.mjs` | JavaScript | 87 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/native-push-client.js` | JavaScript | 37 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/nigeriaStates.js` | JavaScript | 303 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/orderReceipt.mjs` | JavaScript | 240 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/orderService.js` | JavaScript | 134 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/orderTransformers.js` | JavaScript | 388 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/promoDevice.js` | JavaScript | 24 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/publishMenuItem.mjs` | JavaScript | 91 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/push-notification-service.js` | JavaScript | 238 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/pwa-utils.js` | JavaScript | 116 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/riderApi.js` | JavaScript | 158 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/saveMenuEdit.mjs` | JavaScript | 49 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/socketService.js` | JavaScript | 224 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/userApi.js` | JavaScript | 54 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/utils.js` | JavaScript | 83 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/vendor-time/OpenOrClose.js` | JavaScript | 7 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/vendor-time/vendorTime.js` | JavaScript | 169 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/vendorAlertSettings.js` | JavaScript | 77 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/vendorApi.js` | JavaScript | 213 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/vendorId.js` | JavaScript | 20 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/lib/vendorProfileApi.js` | JavaScript | 141 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/modals/AddressModal.jsx` | JSX | 230 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/DeleteConfirmModal.jsx` | JSX | 137 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/FoodDetailsModal.jsx` | JSX | 264 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/ReviewModal.jsx` | JSX | 143 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/create/MetadataModal.jsx` | JSX | 106 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/create/PreviewModal.jsx` | JSX | 430 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/create/VariantsModal.jsx` | JSX | 183 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/update/MetadataModal.jsx` | JSX | 106 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/update/PreviewModal.jsx` | JSX | 67 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/modals/update/VariantsModal.jsx` | JSX | 279 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/not-found.jsx` | JSX | 84 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/offline/page.jsx` | JSX | 73 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/page.jsx` | JSX | 5 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/providers/QueryProvider.jsx` | JSX | 23 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/robots.js` | JavaScript | 8 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/sitemap.js` | JavaScript | 3 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/FoodDetailsSkeleton.jsx` | JSX | 97 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/FoodListSkeleton.jsx` | JSX | 91 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/HomeFoodListSkeleton.jsx` | JSX | 53 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/SearchFoodSkeleton.jsx` | JSX | 8 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/SearchPageSkeleton.jsx` | JSX | 59 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/UpdateFoodSkeleton.jsx` | JSX | 119 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/VendorCardSkeleton.jsx` | JSX | 47 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/VendorDashboardSkeleton.jsx` | JSX | 114 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/VendorProfileImageSkeleton.jsx` | JSX | 8 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/VendorProfileSkeleton.jsx` | JSX | 55 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/VendorSkeleton.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/skeleton/ViewVendorSkeleton.jsx` | JSX | 76 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/store/comboModalStore.js` | JavaScript | 9 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/store/foodModalStore.js` | JavaScript | 9 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/store/userLocationStore.js` | JavaScript | 45 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendor-terms/page.jsx` | JSX | 5 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/auth/forgot-password/page.jsx` | JSX | 17 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/layout.jsx` | JSX | 5 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/login/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/login/page.jsx` | JSX | 262 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/register/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/register/page.jsx` | JSX | 1062 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/reset-password/page.jsx` | JSX | 17 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/set-password/page.jsx` | JSX | 17 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/verify-account/page.jsx` | JSX | 18 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/auth/verify-registration/page.jsx` | JSX | 17 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/components/VendorBootstrapper.jsx` | JSX | 91 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/components/VendorLogoutHandler.jsx` | JSX | 32 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/components/VendorSocketManager.jsx` | JSX | 39 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/coupons/page.jsx` | JSX | 32 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/create-food/create-menu.css` | CSS | 1148 | CSS file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/create-food/page.jsx` | JSX | 278 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/dashboard/page.jsx` | JSX | 589 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/faqs/page.jsx` | JSX | 299 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/food-details/[id]/page.jsx` | JSX | 378 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/layout.jsx` | JSX | 85 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/menu-guide/page.jsx` | JSX | 538 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/menu/create-combo/components/ComboStep1Basics.jsx` | JSX | 157 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/menu/create-combo/components/ComboStep2Components.jsx` | JSX | 503 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/menu/create-combo/components/ComboStep3Swaps.jsx` | JSX | 305 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/menu/create-combo/page.jsx` | JSX | 311 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-combos/[id]/edit/page.jsx` | JSX | 323 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-combos/[id]/page.jsx` | JSX | 513 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-combos/components/ComboCard.jsx` | JSX | 198 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-combos/components/ComboCardSkeleton.jsx` | JSX | 37 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-combos/components/EmptyCombos.jsx` | JSX | 43 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-combos/create/page.jsx` | JSX | 296 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-combos/page.jsx` | JSX | 249 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/[id]/edit/page.jsx` | JSX | 42 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/[id]/page.jsx` | JSX | 1112 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/components/EmptyFoods.jsx` | JSX | 37 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/components/FoodCard.jsx` | JSX | 158 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/components/FoodCardSkeleton.jsx` | JSX | 15 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/components/FoodsFilterBar.jsx` | JSX | 127 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/filter-section.txt` | Text | 104 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/page.jsx` | JSX | 348 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/page_new.jsx` | JSX | 599 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/page_part1.txt` | Text | 243 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/my-foods/page_part2.txt` | Text | 252 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/not-found.jsx` | JSX | 57 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/notifications/page.jsx` | JSX | 557 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/options-library/page.jsx` | JSX | 432 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/order/[id]/page.jsx` | JSX | 360 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/order/components/VendorOrderDeskCard.jsx` | JSX | 433 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/order/page.jsx` | JSX | 190 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/orders/[id]/page.jsx` | JSX | 1 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/pending-approval/page.jsx` | JSX | 92 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/products/[productId]/page.jsx` | JSX | - | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/profile/page.jsx` | JSX | 28 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/reviews/page.jsx` | JSX | 175 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/terms-and-policy/layout.js` | JavaScript | 12 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/terms-and-policy/page.jsx` | JSX | 437 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/transactions/components/PayoutModals.jsx` | JSX | 344 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/app/vendors/transactions/page.jsx` | JSX | 1486 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/app/vendors/vendor-terms/page.jsx` | JSX | 5 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/FreeDeliveryBadge.jsx` | JSX | 16 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/avatar.jsx` | JSX | 47 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/badge.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/button.jsx` | JSX | 56 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/card.jsx` | JSX | 101 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/input.jsx` | JSX | 24 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/label.jsx` | JSX | 23 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/ui/switch.jsx` | JSX | 29 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/vendor/Support/ChatWidget.jsx` | JSX | 231 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/components/vendor/VendorPromoStatus.jsx` | JSX | 53 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/src/lib/api/promos.js` | JavaScript | 74 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/lib/utils.js` | JavaScript | 6 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/src/proxy.js` | JavaScript | 16 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/test-vendor-auth.js` | JavaScript | 365 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/tests/menuCreation.test.mjs` | JavaScript | 164 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/tests/orderReceipt.test.mjs` | JavaScript | 164 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/tests/saveMenuEdit.test.mjs` | JavaScript | 8 | Automated test suite file | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/tree.txt` | Text | 218 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/tsconfig.json` | JSON | 42 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/android/app/src/main/res/drawable-nodpi/melachow_native_splash.png` | Binary | - | Binary asset or artifact (untracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/app/src/main/res/drawable/melachow_native_launch_background.xml` | XML | 9 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/src/main/res/values/colors.xml` | XML | 4 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/.env.local` | ENV | 3 | Environment configuration (ignored) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Vendor/.native-build/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/.next/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/MelaChow-vendor-debug.apk` | Binary | - | Binary asset or artifact (ignored) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/android/.gradle/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/android/app/build/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/android/app/src/main/assets/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/android/app/src/main/assets/capacitor.config.json` | JSON | 12 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/src/main/assets/capacitor.plugins.json` | JSON | 22 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/android/app/src/main/assets/public/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/android/app/src/main/res/xml/config.xml` | XML | 6 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/android/build/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/android/capacitor-cordova-android-plugins/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/android/local.properties` | Properties | 1 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/artifacts/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/artifacts/MelaChow-Vendor-debug.apk` | Binary | - | Binary asset or artifact (ignored) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Vendor/ios/App/App/capacitor.config.json` | JSON | 19 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Vendor/ios/App/App/config.xml` | XML | 6 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/App/App/public/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/ios/App/CapApp-SPM/README.md` | Markdown | 5 | Native mobile/desktop wrapper file | PENDING | Queued for Phase 2/3 (Tier P3) |
| `MelaChow-Vendor/ios/capacitor-cordova-ios-plugins/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/next-env.d.ts` | TypeScript | 7 | TypeScript file (ignored) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Vendor/node_modules/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/src-tauri/gen/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/src-tauri/gen/schemas/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Vendor/src-tauri/target/` | Directory | - | Ignored/build/vendored directory (ignored) | SKIPPED | Ignored/vendored/build directory (node_modules, .next, generated, etc.) |
| `MelaChow-Rider/.gitignore` | Ignore | 46 | Ignore file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/EXAMPLE_API_MIGRATION.js` | JavaScript | 315 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/components.json` | JSON | 22 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/debug-cookies.js` | JavaScript | 93 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/eslint.config.mjs` | JavaScript | 16 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/fix-cache.ps1` | PowerShell | 37 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/fix.js` | JavaScript | 44 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/fix2.js` | JavaScript | 48 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/jsconfig.json` | JSON | 7 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/migrate-api-urls.ps1` | PowerShell | 120 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/next.config.mjs` | JavaScript | 146 | JavaScript file (tracked) | READ_PARTIAL | Partially read in Phase 0/1 (keys/headers/diff); full read queued in Phase 2 |
| `MelaChow-Rider/package-lock.json` | JSON | 9473 | NPM lockfile (dependency pinning/integrity) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/package.json` | JSON | 1 | Package manifest and scripts | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Rider/postcss.config.mjs` | JavaScript | 7 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/public/favicon.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/file.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/globe.svg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/android/launchericon-144x144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/android/launchericon-192x192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/android/launchericon-48x48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/android/launchericon-512x512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/android/launchericon-72x72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/android/launchericon-96x96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/icons.json` | JSON | 452 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/public/icons/ios/100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/1024.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/114.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/120.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/128.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/144.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/152.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/167.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/180.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/192.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/29.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/50.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/512.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/57.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/58.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/76.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/ios/87.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/LargeTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/LargeTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/LargeTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/LargeTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/LargeTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SmallTile.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SmallTile.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SmallTile.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SmallTile.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SmallTile.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SplashScreen.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SplashScreen.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SplashScreen.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SplashScreen.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/SplashScreen.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square150x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square150x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square150x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square150x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square150x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-lightunplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.altform-unplated_targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-16.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-20.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-24.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-256.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-30.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-32.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-36.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-40.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-44.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-48.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-60.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-64.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-72.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-80.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Square44x44Logo.targetsize-96.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/StoreLogo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/StoreLogo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/StoreLogo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/StoreLogo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/StoreLogo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Wide310x150Logo.scale-100.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Wide310x150Logo.scale-125.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Wide310x150Logo.scale-150.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Wide310x150Logo.scale-200.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/icons/windows/Wide310x150Logo.scale-400.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/logo.jpeg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/logo.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/manifest.json` | JSON | 62 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/public/placeholder.jpg` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/public/sw.js` | JavaScript | 444 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/quick-fix-api-urls.ps1` | PowerShell | 165 | PowerShell file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/GrubDashLogo/GrubDashLogo.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/apple-icon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/src/app/auth/rider/forgot-password/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/auth/rider/forgot-password/page.jsx` | JSX | 184 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/auth/rider/login/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/auth/rider/login/page.jsx` | JSX | 214 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/auth/rider/register/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/auth/rider/register/page.jsx` | JSX | 652 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/auth/rider/reset-password/layout.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/auth/rider/reset-password/page.jsx` | JSX | 345 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/components/BackButton.jsx` | JSX | 33 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/BottomNav.jsx` | JSX | 146 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/ChunkLoadRecovery.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/InstallPWA.jsx` | JSX | 168 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/JsonLd.jsx` | JSX | 15 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/LocationSelector.jsx` | JSX | 294 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/NoFoodsFound.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/NotificationBell.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/PWA/PWAInstallPrompt.jsx` | JSX | 271 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/PWA/PWAUpdateManager.jsx` | JSX | 183 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/PermanentInstallButton.jsx` | JSX | 160 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/SplashScreen.jsx` | JSX | 221 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/VerifyPayment.jsx` | JSX | 311 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/components/logo/Logo.jsx` | JSX | 15 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/notifications/ClearNotificationsModal.jsx` | JSX | 80 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/notifications/NotificationPromptBanner.jsx` | JSX | 143 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/notifications/NotificationSettings.jsx` | JSX | 245 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/notifications/PushNotificationPrompt.jsx` | JSX | 156 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/components/notifications/RealtimeNotificationListener.jsx` | JSX | 95 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/order/StatusBadge.jsx` | JSX | 16 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/order/StatusButtons.jsx` | JSX | 35 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/order/VendorOrderCard.jsx` | JSX | 373 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/protected-route/ProtectedRoute.jsx` | JSX | 47 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/rider/NewOrderModal.jsx` | JSX | 301 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/searchs/Searchs.jsx` | JSX | 532 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/shared/PlatformCategoryPicker.jsx` | JSX | 291 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/skeleton/AddressSkeleton.jsx` | JSX | 30 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/skeleton/CheckoutPageSkeleton.jsx` | JSX | 73 | React UI component | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/components/skeleton/OrderCardSkeleton.jsx` | JSX | 26 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/skeleton/OrderTrackingSkeleton.jsx` | JSX | 57 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/support_component/GetHelp.jsx` | JSX | 176 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/toast/SwipeableToaster.jsx` | JSX | 62 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/components/toast/showAnimatedToast.jsx` | JSX | 61 | React UI component | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/context/ApiContext.jsx` | JSX | 34 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/context/CartContext.js` | JavaScript | 244 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/context/CreateComboStore.jsx` | JSX | 296 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/context/CreateFoodStore.js` | JavaScript | 225 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/context/ProfileContext.jsx` | JSX | 186 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/context/RiderContext.jsx` | JSX | 322 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/context/SocketContext.jsx` | JSX | 381 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/context/ThemeContext.jsx` | JSX | 47 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/context/VendorProfileContext.jsx` | JSX | 211 | React state/auth/socket context | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/error.jsx` | JSX | 57 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/favicon.png` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/src/app/favicon_backup.ico` | Binary | - | Binary asset or artifact (tracked) | SKIPPED | Binary asset/APK/image/font |
| `MelaChow-Rider/src/app/globals.css` | CSS | 315 | CSS file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useActivePromos.js` | JavaScript | 40 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useCategories.js` | JavaScript | 37 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useComboById.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useDeliveryCountdown.js` | JavaScript | 46 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useMenu.js` | JavaScript | 267 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useNotificationManager.js` | JavaScript | 341 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useOrderTracking.js` | JavaScript | 45 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/usePWAInstall.js` | JavaScript | 76 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/usePromoEligibility.js` | JavaScript | 56 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/usePushNotifications.js` | JavaScript | 181 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/hooks/useRealtimeNotifications.js` | JavaScript | 18 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useUserStorage.js` | JavaScript | 101 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/hooks/useVendorCombos.js` | JavaScript | 19 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useVendorFoodQuery.js` | JavaScript | 31 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useVendorFoods.js` | JavaScript | 14 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/useVendorQueries.js` | JavaScript | 154 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/hooks/vendorStorage.js` | JavaScript | 96 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/layout.jsx` | JSX | 99 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/lib/adminApi.js` | JavaScript | 592 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/api.js` | JavaScript | 572 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/apiConfig.js` | JavaScript | 151 | Frontend API/auth/runtime library | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Rider/src/app/lib/auth-token.js` | JavaScript | 102 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/chunkRecovery.js` | JavaScript | 49 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/locationService.js` | JavaScript | 425 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/menuApi.js` | JavaScript | 531 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/nigeriaStates.js` | JavaScript | 303 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/orderService.js` | JavaScript | 134 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/orderTransformers.js` | JavaScript | 388 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/promoDevice.js` | JavaScript | 24 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/push-notification-service.js` | JavaScript | 206 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/pwa-utils.js` | JavaScript | 116 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/riderAlertSettings.js` | JavaScript | 103 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/riderApi.js` | JavaScript | 228 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/socketService.js` | JavaScript | 232 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/userApi.js` | JavaScript | 54 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/utils.js` | JavaScript | 81 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/vendor-time/OpenOrClose.js` | JavaScript | 7 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/vendor-time/vendorTime.js` | JavaScript | 169 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/vendorApi.js` | JavaScript | 206 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/vendorId.js` | JavaScript | 20 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/lib/vendorProfileApi.js` | JavaScript | 132 | Frontend API/auth/runtime library | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/not-found.jsx` | JSX | 84 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/offline/page.jsx` | JSX | 73 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/page.jsx` | JSX | 5 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/providers/QueryProvider.jsx` | JSX | 23 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/dashboard/page.jsx` | JSX | 602 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/deliveries/page.jsx` | JSX | 191 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/earnings/page.jsx` | JSX | 199 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/layout.jsx` | JSX | 238 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/not-found.jsx` | JSX | 65 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/notifications/[id]/page.jsx` | JSX | 426 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/notifications/page.jsx` | JSX | 125 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/ongoing-delivery/page.jsx` | JSX | 1007 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/orders/page.jsx` | JSX | 195 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/settings/page.jsx` | JSX | 399 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/stats/page.jsx` | JSX | 73 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/transactions/page.jsx` | JSX | 615 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/rider/wallet/page.jsx` | JSX | 779 | Next.js App Router page | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/app/robots.js` | JavaScript | 8 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/sitemap.js` | JavaScript | 3 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/FoodDetailsSkeleton.jsx` | JSX | 97 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/FoodListSkeleton.jsx` | JSX | 91 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/HomeFoodListSkeleton.jsx` | JSX | 53 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/SearchFoodSkeleton.jsx` | JSX | 8 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/SearchPageSkeleton.jsx` | JSX | 59 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/UpdateFoodSkeleton.jsx` | JSX | 119 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/VendorCardSkeleton.jsx` | JSX | 47 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/VendorDashboardSkeleton.jsx` | JSX | 114 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/VendorProfileImageSkeleton.jsx` | JSX | 8 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/VendorProfileSkeleton.jsx` | JSX | 55 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/VendorSkeleton.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/skeleton/ViewVendorSkeleton.jsx` | JSX | 76 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/store/comboModalStore.js` | JavaScript | 9 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/store/foodModalStore.js` | JavaScript | 9 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/app/store/userLocationStore.js` | JavaScript | 45 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/FreeDeliveryBadge.jsx` | JSX | 16 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/avatar.jsx` | JSX | 47 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/badge.jsx` | JSX | 44 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/button.jsx` | JSX | 56 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/card.jsx` | JSX | 101 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/input.jsx` | JSX | 24 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/label.jsx` | JSX | 23 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/ui/switch.jsx` | JSX | 29 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/components/vendor/VendorPromoStatus.jsx` | JSX | 53 | JSX file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/src/lib/api/promos.js` | JavaScript | 74 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/lib/utils.js` | JavaScript | 6 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/src/proxy.js` | JavaScript | 16 | JavaScript file (tracked) | READ_FULL | Read in full (Phase 0/1) |
| `MelaChow-Rider/test-vendor-auth.js` | JavaScript | 365 | JavaScript file (tracked) | PENDING | Queued for Phase 2/3 (Tier P1) |
| `MelaChow-Rider/tree.txt` | Text | 218 | Text file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
| `MelaChow-Rider/tsconfig.json` | JSON | 42 | JSON file (tracked) | PENDING | Queued for Phase 2/3 (Tier P2) |
