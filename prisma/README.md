# Prisma PostgreSQL Migration README

This is the backend migration workspace for moving `MelaChowApi` from MongoDB/Mongoose to PostgreSQL/Prisma.

## Current Workflow

We are using a schema-first workflow:

1. Create the full Prisma schema draft.
2. Audit it against all Mongoose models.
3. Tighten relations and enums.
4. Review money/storage decisions.
5. Install Prisma dependencies.
6. Validate/generate Prisma Client.
7. Generate migrations only after the schema is reviewed.

Do not run migrations yet. The first proof migration was removed so that no partial SQL migration can be accidentally applied.

## Local Environment

Add `DATABASE_URL` to `MelaChowApi/.env` before Prisma is run.

Example local URL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/melachow?schema=public"
DB_READ_PROVIDER=mongo
```

`DB_READ_PROVIDER=mongo` remains the default while migration work is in progress.

Later, after Prisma is installed, generated, migrated, and seeded, `DB_READ_PROVIDER=postgres` can be used to test migrated read paths for locations/categories.

## Commands For Later

These commands are intentionally for later, after schema review and dependency installation:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Current blocker: `npm install` previously failed with `ERR_SSL_CIPHER_OPERATION_FAILED` while fetching `@prisma/client`.

## Schema Coverage

The draft schema covers the live backend model inventory:

- Identity: `User`, `UserAddress`, `Admin`, `Vendor`, `Rider`
- Location/logistics: `State`, `City`, `RiderAssignment`, `PlatformVehicle`, `DeliveryAgent`
- Menu/catalog: `Category`, `VendorMenuSection`, `MenuItem`, `MenuItemPortion`, `MenuItemChoiceGroup`, `MenuItemChoiceOption`, `ComboItem`, `Food`
- Cart/order: `Cart`, `VendorSubCart`, `CartLineItem`, `Order`, `OrderItem`, `VendorDeliveryFee`, `VendorOrder`
- Finance/payment: `Wallet`, `WalletTransaction`, `Withdrawal`, `RiderWithdrawal`, `PaymentAttempt`, `PaymentLock`, `Refund`, `Transaction`, `Invoice`
- Engagement/support: `Review`, `Report`, `SupportTicket`, `Notification`, `PushSubscription`
- Promotions: `Discount`, `DiscountUsage`, `FreeDeliveryPromo`, `FreeDeliveryClaim`, `VendorDeliveryPromo`, `VendorDeliveryClaim`
- Analytics/config: `SearchTrend`, `ActivityLog`, `PlatformConfig`

Completeness audit:

- All live files under `model/` have a Prisma representation or documented consolidation.
- `model/order/order.model.js` is treated as a legacy/duplicate order path and represented by `Order`.
- `model/Admin/vendor.model.js` and `model/Admin/wallet.model.js` are empty/legacy files and do not currently require separate Prisma models.
- `model/vendor/food.model.js` is represented by `Food` for legacy compatibility, while `MenuItem` remains the future menu model.
- `model/delivery.agent.model.js` is represented by `DeliveryAgent`, even though the newer rider system appears to carry most active delivery workflows.

Intentional consolidations:

- Mongo has separate user/vendor/rider/admin push subscription models. Prisma consolidates them into `PushSubscription` with `ownerId` and `ownerModel`.
- Mongo has some admin-specific legacy models under `model/Admin`. These are represented by the main admin/vendor/wallet models unless later code audit proves separate tables are needed.
- Legacy `Food` is represented explicitly by `Food`, while future-facing menu data remains in `MenuItem`.

## Relationship Strategy

Formal Prisma relations are defined for stable, high-value joins:

- state/city to vendors, riders, addresses, assignments, and search trends
- users to addresses, carts, orders, payments, refunds, invoices, reviews, reports, support tickets, notifications, claims, and discount usages
- vendors to menu sections, menu items, combos, subcarts, vendor orders, riders, reviews, transactions, notifications, discounts, promos, claims, assignments, and search trends
- riders to vendor, state, city, platform vehicle, orders, vendor orders, withdrawals, notifications, and assignments
- menu items to vendor, category, section, portions, choice groups, cart line items, order items, and reviews
- orders to user, rider, items, delivery fees, vendor orders, payment attempts, refunds, transactions, invoices, claims, discount usages, support tickets, and assignments
- wallets to transactions and withdrawal records
- legacy foods to vendors and reviews
- delivery agents are intentionally standalone for now because the current rider model appears to supersede most active logistics flows

Polymorphic areas intentionally remain partly app-enforced:

- `Wallet.ownerId + ownerModel`
- `PushSubscription.ownerId + ownerModel`
- `ActivityLog.actorId/targetId + model`
- report target references

These need app-level checks first; database-level polymorphic constraints can be revisited later.

## Enum Strategy

Stable status/type fields are Prisma enums:

- roles: `AccountRole`, `AdminRole`, `NotificationRole`
- location/delivery/rider/vehicle states
- menu item and dietary types
- cart and order states
- payment attempt and payment states
- wallet owner, transaction direction, transaction type
- withdrawal, refund, report, support ticket states
- notification types
- discount type/scope/funding
- rider assignment status

Fields intentionally left as strings for now:

- `Transaction.type/status`, because the existing transaction model is loose.
- `Invoice.type`, because invoice type currently varies by workflow.
- `PlatformConfig.type`, because it is a configuration key.
- support `category` and `priority`, because current data may be loose.

## JSON Strategy

Use JSON for flexible Mongo snapshots and embedded payloads:

- vendor `address`, `openingHours`, `termsAcceptance`, `payoutDetails`, `metadata`
- rider `payoutDetails`, `metadata`
- combo `choiceGroups`
- cart selected choices and variant choices
- order delivery address, promo snapshots, assignment snapshot, status log
- vendor order item snapshots
- payment attempt snapshots/provider payload/events
- invoice lines/metadata
- support ticket timeline/admin notes/metadata
- notification data
- push subscription payloads
- activity/search/config metadata

Use relational tables for frequently queried or transactional arrays:

- `UserAddress`
- `Cart`, `VendorSubCart`, `CartLineItem`
- `OrderItem`, `VendorDeliveryFee`
- `WalletTransaction`
- `DiscountUsage`
- promo claim tables

## Manual SQL Needed Later

Prisma schema alone will not cover every Mongo index behavior. The generated migration will likely need manual SQL for:

- active-cart partial uniqueness: one `ACTIVE` cart per customer
- rider `currentOrderId` uniqueness only when non-null
- category root slug uniqueness where `parent_id IS NULL`
- category child slug uniqueness where `parent_id IS NOT NULL`
- notification retention cleanup replacing Mongo TTL
- full-text/trigram search for menu items, combos, support tickets, and vendor search
- updated-at triggers if Prisma-managed `updatedAt` is not enough for non-Prisma writes

## Money Field Standard

Decision: PostgreSQL stores all monetary values as integer **kobo**.

Reason:

- Paystack works in kobo.
- Integer kobo avoids floating point issues.
- Wallet, payout, refund, commission, and reporting math becomes consistent.
- API responses can still expose naira during transition for frontend compatibility.

Schema convention:

- Prisma field names remain readable: `price`, `deliveryFee`, `balance`, `total`, `amount`.
- Database column names include `_kobo`: `price_kobo`, `delivery_fee_kobo`, `balance_kobo`, `total_kobo`, `amount_kobo`.
- Legacy duplicate fields in `PaymentAttempt` are kept as `legacy_expected_amount_kobo` and `legacy_paid_amount_kobo` until migration scripts decide whether they are redundant.

Affected field groups:

- location delivery fees
- user wallet balance snapshots
- vendor sales and delivery fee settings
- menu and legacy food prices
- cart line item prices
- order totals, delivery fee, service fee, rider earnings
- vendor delivery fees and vendor order finance fields
- wallet balances and wallet transactions
- vendor/rider withdrawals
- payment attempts
- refunds, transactions, invoices
- discount values and thresholds
- delivery agent earnings

API compatibility rule:

- Existing HTTP responses may continue returning naira-shaped values while controllers are still Mongo-backed.
- PostgreSQL repository/controller code must convert between kobo storage and whatever response contract each frontend currently expects.
- New internal finance code should use kobo only.

## Local Prisma Tooling Status

Installed Prisma packages:

- `prisma@6.19.1`
- `@prisma/client@6.19.1`

Reason: local Node is `22.11.0`; Prisma `7.4.2` requires Node `22.12+`.

Validation status:

- `npm run prisma:generate` passes and writes the client to `generated/prisma`.
- `npx prisma validate` passes when `DATABASE_URL` is present.
- Full initial migration SQL exists at `prisma/migrations/20260522000000_init_full_schema/migration.sql`.
- The generated migration creates 48 tables and passed a quick scan for warnings, unsupported markers, TODOs, and DROP statements.
- Local `.env` includes `DATABASE_URL` for local PostgreSQL on `localhost:5000`.
- `npm run prisma:migrate` has applied the full initial schema locally.
- `npm run prisma:seed` has seeded the low-risk proof data.
- Current seed counts: `State=1`, `City=4`, `Category=92`.
- Local `.env` currently has `DB_READ_PROVIDER=postgres`.
- API smoke tests passed for the first Postgres-backed read slice:
  - `GET /api/locations/states`
  - `GET /api/locations/cities?stateId=<stateId>`
  - `GET /api/categories/public`
  - `GET /api/categories/tree`
  - `GET /api/categories`
  - `GET /api/categories/platform-categories`
- Use `node index.js` for local smoke testing if `nodemon` fails with Windows `spawn EPERM`.
- Redis was offline during the smoke test, so BullMQ emitted `ECONNREFUSED`; this did not block the location/category reads.

## Menu/Catalog Slice Status

Menu/catalog has its own read switch:

- `DB_MENU_READ_PROVIDER=postgres`

It is enabled locally after the importer and smoke tests.

Current work completed:

- Added `MenuItemPortion.maxQuantity` mapped to `max_quantity`.
- Applied migration `20260522000100_add_menu_portion_max_quantity` locally.
- Added `services/postgres/menuCatalog.repository.js`.
- Added `usePostgresMenuReads()` in `services/postgres/compat.js`.
- Repository supports UUID and `legacy_mongo_id` lookup and returns Mongo-shaped `_id` fields.
- Repository smoke test against empty local menu data passed.
- Added `prisma/import-menu-from-mongo.js`.
- Added npm script `prisma:import-menu`.
- Importer ran successfully and is idempotent.
- Imported counts: `State=5`, `City=14`, `Category=104`, `Vendor=2`, `VendorMenuSection=2`, `MenuItem=3`, `MenuItemPortion=7`, `MenuItemChoiceGroup=4`, `MenuItemChoiceOption=12`, `ComboItem=1`.
- Customer-facing menu reads now have Postgres branches behind `DB_MENU_READ_PROVIDER=postgres`.
- HTTP smoke tests passed for vendor menu, item detail, food detail, combo detail, and marketplace category item/vendor endpoints.
- Added `prisma/check-menu-response-parity.js` and npm script `prisma:check-menu-parity`.
- Menu repository compatibility mappers now align outward response shapes with Mongo for customer-facing menu reads.
- Public Postgres food/combo controller branches now return the same compact vendor object shape as the current Mongo branches.
- `npm run prisma:check-menu-parity` currently reports zero shape diffs for vendor menu, vendor item detail, public food detail, combo detail, marketplace category items, and marketplace category vendors.
- Vendor-auth read branches are now behind `DB_MENU_READ_PROVIDER=postgres` for:
  - `GET /v1/menu/:vendorId/sections`
  - `GET /v1/menu/:vendorId/items`
- Vendor dashboard item lists support the existing Mongo-compatible filters, counts, stats, and pagination.
- `npm run prisma:check-menu-parity` also reports zero shape diffs for vendor sections and vendor menu items.
- Combo read branches are now behind `DB_MENU_READ_PROVIDER=postgres` for:
  - `GET /v1/menu/combos/vendor/:vendorId`
  - `GET /v1/menu/combos/:comboId`
- Combo writes/mutations remain Mongo-backed.
- `npm run prisma:check-menu-parity` also reports zero shape diffs for vendor combos and vendor combo detail.

Next dependency:

- Run authenticated HTTP smoke checks for vendor menu reads when a local vendor token is available, then move to the next read-heavy domain. Keep writes, cart, orders, and stock mutation on Mongo until each transactional path has dedicated migration and tests.

## Search Read Slice

Search has its own read switch:

- `DB_SEARCH_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresSearchReads()` in `services/postgres/compat.js`.
- Added `services/postgres/search.repository.js`.
- Added Postgres read branches for:
  - `GET /api/search/food/search`
  - `GET /api/search/food/autocomplete`
- Local `.env` currently enables `DB_SEARCH_READ_PROVIDER=postgres`.
- Search trend writes remain Mongo-backed through `SearchTrend`.
- Trending searches and search analytics remain Mongo-backed.
- Repository smoke test passed for `q=rice` search and `q=ri` autocomplete.
- Added `prisma/check-search-response-parity.js` and npm script `prisma:check-search-parity`.
- `npm run prisma:check-search-parity` reports zero shape diffs for `search rice`, `search rating sort`, and `autocomplete ri`.
- `npm run prisma:check-search-parity` also covers a representative category search sample.
- HTTP smoke tests passed on local port `3005`:
  - `GET /api/search/food/search?q=rice&page=1&limit=5`
  - `GET /api/search/food/autocomplete?q=ri&limit=5`

Important limitation:

- The first Postgres search branch uses Prisma `contains` and array exact matching. Before production cutover, replace this with PostgreSQL full-text/trigram search and ranking.

## Foods By Location Read Slice

Foods-by-location has its own read switch:

- `DB_FOODS_BY_LOCATION_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresFoodsByLocationReads()` in `services/postgres/compat.js`.
- Added `services/postgres/foodsByLocation.repository.js`.
- Added a Postgres read branch for `GET /api/user/foods`.
- Added `prisma/check-foods-by-location-parity.js` and npm script `prisma:check-foods-location-parity`.
- `npm run prisma:check-foods-location-parity` reports zero shape diffs for the current `Saapade, Ogun State` sample, with 4 foods on both Mongo and Postgres.
- Repository smoke test passed for `Saapade, Ogun State`.

Route smoke note:

- `GET /api/user/foods` is authenticated. An HTTP smoke was attempted with a local JWT, but this server startup hit a MongoDB SRV timeout before the request could connect. Retry when Mongo connectivity is stable.

Known Prisma warning:

- `package.json#prisma` seed config is deprecated for Prisma 7. It is acceptable during the Prisma 6 local migration phase, but should move to `prisma.config.ts` before upgrading Prisma.

Recent schema validation fixes:

- `UserAddress.cityText` and `UserAddress.stateText` preserve legacy free-text address fields, while `cityId` and `stateId` provide relational links.
- Legacy `Food.categories` remains a string array for now, so `Category.legacyFoods` was removed.
- `Order.walletTransactions` was added as the inverse side of `WalletTransaction.order`.
- `PlatformConfig.lastUpdatedByAdmin` now owns the `lastUpdatedBy` relation to `Admin`.

## Recommendations Read Slice

Current route:

- `GET /api/recommendations`

Feature flag:

- `DB_RECOMMENDATION_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresRecommendationReads()` in `services/postgres/compat.js`.
- Added `services/postgres/recommendation.repository.js`.
- Added a Postgres read branch for `getRecommendations`.
- Added `prisma/check-recommendation-response-parity.js` and npm script `prisma:check-recommendation-parity`.
- Local `.env` currently enables `DB_RECOMMENDATION_READ_PROVIDER=postgres`.

Postgres branch coverage:

- `timeOfDay`
- `underrated`
- `weatherBased`
- `trendingNearby`
- `budgetFriendly`

Verification:

- `node --check` passed for the recommendation repository, controller, and parity script.
- `npx prisma validate` passed after this slice.
- Direct repository smoke passed for `Saapade, Ogun State` with `weather=rain`.
- Current smoke counts: `timeOfDay=0`, `underrated=1`, `weatherBased=0`, `trendingNearby=0`, `budgetFriendly=3`.
- After the order import, `npm run prisma:check-recommendation-parity` reports zero shape diffs for:
  - recommendations by location
  - weather recommendations

Compatibility notes:

- Recommendation response envelope remains `{ success, meta, data }`.
- Food/combo recommendation item shape remains Mongo-compatible for `_id`, `image`, `price`, `portionLabel`, `item_type`, `dietary_type`, `deliveryFee`, and restaurant summary.
- `trendingNearby` now reads from PostgreSQL orders/order items.
- Imported delivered orders currently fall on May 17-19, 2026. Because the controller uses a two-day trending window and today is May 25, 2026, both Mongo and Postgres correctly return `trendingNearby=0` in parity.

## Public Reviews Read Slice

Current routes:

- `GET /api/public/reviews/vendor/:vendorId`
- `GET /api/public/reviews/vendor/:vendorId/summary`
- `GET /api/public/reviews/food/:foodId`

Feature flag:

- `DB_PUBLIC_REVIEW_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresPublicReviewReads()` in `services/postgres/compat.js`.
- Added `services/postgres/publicReviews.repository.js`.
- Added Postgres read branches in `controller/user/public.reviews.controller.js`.
- Added `prisma/import-reviews-from-mongo.js` and npm script `prisma:import-reviews`.
- Added `prisma/check-public-reviews-parity.js` and npm script `prisma:check-public-reviews-parity`.
- Local `.env` currently enables `DB_PUBLIC_REVIEW_READ_PROVIDER=postgres`.
- Imported review data from Mongo into Postgres:
  - users: `1`
  - reviews: `4`
  - skipped: `0`

Verification:

- `node --check` passed for the public reviews repository, controller, import script, and parity script.
- Direct repository smoke passed:
  - vendor `Mj Cuisines`
  - item `Jollof rice`
  - vendor reviews `4`
  - recent reviews `4`
  - food reviews `3`
- `npm run prisma:check-public-reviews-parity` reports zero shape diffs for:
  - public vendor reviews
  - public vendor reviews summary
  - public food reviews

Compatibility notes:

- The Mongo public review controller needed explicit model registration imports for `User`, `Food`, and `Category`; without them, standalone parity checks returned 500 before the Postgres comparison.
- Review writes, authenticated user review reads, vendor-auth review reads, and admin review management remain Mongo-backed.

## Review Management Read Slice

Current routes:

- `GET /api/user/reviews`
- `GET /api/admin/user/reviews/user-reviews`
- `GET /api/admin/user/reviews/vendor-reviews`
- `GET /api/admin/user/reviews/vendor-reviews/all`
- `GET /api/vendor/reviews`

Feature flag:

- `DB_REVIEW_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresReviewReads()` in `services/postgres/compat.js`.
- Added `services/postgres/reviewManagement.repository.js`.
- Added Postgres read branches in `controller/user/user.reviews.controller.js`.
- Added `prisma/check-review-management-parity.js` and npm script `prisma:check-review-management-parity`.
- Local `.env` currently enables `DB_REVIEW_READ_PROVIDER=postgres`.

Verification:

- `node --check` passed for the review management repository, controller, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-review-management-parity` reports zero shape diffs for:
  - user reviews
  - vendor reviews by query
  - vendor reviews by authenticated vendor
  - admin vendor reviews
  - admin vendor reviews filtered

Compatibility notes:

- Review create/delete mutations remain Mongo-backed.
- The Postgres admin filtered vendor stats intentionally mirrors the current Mongo aggregate behavior where `vendorStats` is empty when `vendorId` is supplied as a string filter.
- Legacy `Review.foodId` currently populates as `null` in these Mongo read shapes because the schema references `Food` while review data points at menu items. The Postgres mapper preserves that outward shape for parity.

## Category Metrics Read Slice

Current route:

- `GET /api/admin/categories/metrics`

Feature flag:

- `DB_CATEGORY_METRICS_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresCategoryMetricsReads()` in `services/postgres/compat.js`.
- Added `services/postgres/categoryMetrics.repository.js`.
- Added a Postgres read branch in `controller/Admin/categoryMetrics.controller.js`.
- Added `prisma/check-category-metrics-parity.js` and npm script `prisma:check-category-metrics-parity`.
- Local `.env` currently enables `DB_CATEGORY_METRICS_READ_PROVIDER=postgres`.

Verification:

- `node --check` passed for the category metrics repository, controller, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-category-metrics-parity` reports zero shape diffs.
- Current category metric distribution count is `3` for both Mongo and Postgres.

Compatibility notes:

- This slice only covers category inventory distribution. Broader admin metrics that depend on orders/users should wait for the relevant data import and transaction parity work.

## User Metrics Read Slice

Current route:

- `GET /api/admin/users/metrics`

Feature flag:

- `DB_USER_METRICS_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresUserMetricsReads()` in `services/postgres/compat.js`.
- Added `services/postgres/userMetrics.repository.js`.
- Added a Postgres read branch in `controller/Admin/userMetrics.controller.js`.
- Added `prisma/import-users-from-mongo.js` and npm script `prisma:import-users`.
- Added `prisma/check-user-metrics-parity.js` and npm script `prisma:check-user-metrics-parity`.
- Local `.env` currently enables `DB_USER_METRICS_READ_PROVIDER=postgres`.

Import status:

- `npm run prisma:import-users` completed successfully.
- Imported counts:
  - users: `13`
  - addresses: `15`
  - skipped: `0`

Verification:

- `node --check` passed for the user importer, user metrics repository, controller, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-user-metrics-parity` reports zero shape diffs.
- Current seven-day signup total is `0` for both Mongo and Postgres.

Compatibility notes:

- This slice covers only the seven-day admin signup trend.
- User auth/profile/address write paths remain Mongo-backed until those workflows are migrated and tested directly.

## Order Import And Vendor Metrics Slice

Current route:

- `GET /api/admin/vendors/metrics`

Feature flag:

- `DB_VENDOR_METRICS_READ_PROVIDER=postgres`

Current work completed:

- Added `prisma/import-orders-from-mongo.js` and npm script `prisma:import-orders`.
- Added `usePostgresVendorMetricsReads()` in `services/postgres/compat.js`.
- Added `services/postgres/vendorMetrics.repository.js`.
- Added a Postgres read branch in `controller/Admin/vendorMetrics.controller.js`.
- Added `prisma/check-vendor-metrics-parity.js` and npm script `prisma:check-vendor-metrics-parity`.
- Local `.env` currently enables `DB_VENDOR_METRICS_READ_PROVIDER=postgres`.

Import status:

- `npm run prisma:import-orders -- --dry-run` was intended as a dry-run, but the flag did not pass through in the local shell. The importer is idempotent and completed a real import successfully.
- Imported counts:
  - orders: `14`
  - order items: `14`
  - vendor delivery fees: `14`
  - skipped: `0`

Verification:

- `node --check` passed for the order importer, vendor metrics repository, controller, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-vendor-metrics-parity` reports zero shape diffs.
- Current monthly vendor sales metrics:
  - Mongo count `9`, revenue `41025`
  - Postgres count `9`, revenue `41025`

Compatibility notes:

- This order import covers parent `Order`, embedded `OrderItem`, and embedded `vendorDeliveryFees` only.
- Vendor sub-orders, payment attempts, refunds, transactions, invoices, wallet transactions, and finance ledgers are intentionally deferred to finance/order workflow slices.
- Imported order monetary values preserve the current Mongo numeric values so existing metrics remain parity-compatible.

## Vendor Order Dashboard Read Slice

Current routes:

- `GET /api/vendor/orders`
- `GET /api/vendor/orders/:vendorOrderId`

Feature flag:

- `DB_VENDOR_ORDER_READ_PROVIDER=postgres`

Current work completed:

- Added `prisma/import-vendor-orders-from-mongo.js` and npm script `prisma:import-vendor-orders`.
- Added `usePostgresVendorOrderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/vendorOrders.repository.js`.
- Added Postgres read branches in `controller/vendor/vendor.controller.js`.
- Added `prisma/check-vendor-orders-parity.js` and npm script `prisma:check-vendor-orders-parity`.
- Local `.env` currently enables `DB_VENDOR_ORDER_READ_PROVIDER=postgres`.

Import status:

- `npm run prisma:import-vendor-orders` completed successfully.
- Imported counts:
  - vendor orders: `13`
  - skipped: `0`

Verification:

- `node --check` passed for the vendor order importer, repository, controller, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-vendor-orders-parity` reports zero shape diffs for:
  - vendor order list
  - vendor order detail

Compatibility notes:

- Vendor order status mutations remain Mongo-backed.
- The parity script imports the existing vendor controller, which initializes Redis/BullMQ dependencies and can log local `ECONNREFUSED` noise when Redis is offline. The parity result still completed successfully.

## Admin Order Read Slice

Current routes:

- `GET /api/admin/orders/stats`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:orderId`
- `GET /api/admin/orders/platform-managed`
- `GET /api/admin/orders/commission-ledger`

Feature flag:

- `DB_ADMIN_ORDER_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresAdminOrderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/adminOrders.repository.js`.
- Added Postgres read branches in `controller/Admin/order_management/adminOrder.controller.js`.
- Added `prisma/check-admin-orders-parity.js` and npm script `prisma:check-admin-orders-parity`.
- Added `prisma/import-wallets-from-mongo.js` and npm script `prisma:import-wallets` so admin order detail can return `vendorWallets`.
- Added a separate platform-managed order mapper so this route preserves Mongo's raw order-item shape while still attaching vendor-order context.
- Added a Postgres commission ledger mapper that computes paginated order rows and summary totals from imported orders/vendor orders.
- Local `.env` currently enables `DB_ADMIN_ORDER_READ_PROVIDER=postgres`.

Import status:

- `npm run prisma:import-wallets` completed successfully.
- Imported counts:
  - wallets: `8`
  - skipped: `9`
- Skipped wallets are for Admin/Rider owners that are not imported yet.

Verification:

- `node --check` passed for the admin order repository, controller, wallet importer, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-admin-orders-parity` reports zero shape diffs for:
  - admin order stats
  - admin order list
  - admin order detail by Mongo ID
  - admin order detail by order code
  - admin platform-managed order list
  - admin platform-managed logistics order list
  - admin commission ledger

Compatibility notes:

- Admin order status override and rider assignment remain Mongo-backed for now.
- Platform-managed reads intentionally preserve current Mongo filter behavior: `status` and `statusGroup=logistics` are supported, while `paymentStatus`, `startDate`, `endDate`, and `search` are not applied by the existing Mongo route.
- Commission ledger reads intentionally preserve current Mongo aggregation shape, including the current omission of `isPlatformManaged` and the resulting `deliveryFeeHeld: 0` behavior.
- Commission ledger rider payout uses `PlatformConfig.value.riderFixedPayout` in Postgres when available, falling back to `600`.
- The Mongo admin order controller needed explicit model registration for `MenuItem`; without it, standalone parity checks returned 500 before comparison.

## Logistics Support Import Slice

Purpose:

- Prepare Postgres data needed before migrating admin rider assignment and other logistics write flows.
- No logistics write route has been switched to Postgres yet.

Current data covered:

- `Rider`
- `RiderAssignment`
- `PlatformConfig`

Current work completed:

- Added `prisma/import-logistics-support-from-mongo.js` and npm script `prisma:import-logistics-support`.
- Added `prisma/check-logistics-support-parity.js` and npm script `prisma:check-logistics-support-parity`.

Import status:

- `npm run prisma:import-logistics-support` completed successfully.
- Imported counts:
  - riders: `5`
  - rider assignments: `27`
  - platform configs: `1`
- Skipped assignments:
  - `31`
  - Reason: referenced order or rider is not present in Postgres.

Verification:

- `node --check` passed for the logistics support importer and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-logistics-support-parity` reports zero diffs.
- Current parity summary:
  - riders: Mongo `5`, Postgres `5`
  - rider statuses: `available=3`, `pending_assignment=2`
  - rider managers: `admin=5`
  - available verified active riders: `3`
  - import-eligible rider assignments: Mongo `27`, Postgres `27`
  - skipped missing-dependency assignments: `31`
  - mapped assignment statuses: `delivered=7`, `pending=6`, `rejected=14`
  - platform config value matches.

Compatibility notes:

- Mongo `RiderAssignment.status=assigned` maps to Prisma `pending`.
- Mongo `RiderAssignment.status=cancelled` maps to Prisma `rejected`.
- Original assignment status, `assignedBy`, and `assignedAt` are preserved in `RiderAssignment.metadata`.
- Platform config is stored as `PlatformConfig.value` JSON under the singleton key.

## Admin Rider Read Slice

Current routes:

- `GET /api/admin/riders`
- `GET /api/admin/rider-assignments`
- `GET /api/admin/platform-vehicles`

Feature flag:

- `DB_ADMIN_RIDER_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresAdminRiderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/adminRiders.repository.js`.
- Added Postgres read branches in `controller/rider.controller.js`.
- Added `prisma/check-admin-riders-parity.js` and npm script `prisma:check-admin-riders-parity`.
- Extended `prisma/import-logistics-support-from-mongo.js` to import `PlatformVehicle`.
- Updated `.env.example` with `DB_ADMIN_RIDER_READ_PROVIDER`.
- Local `.env` currently enables `DB_ADMIN_RIDER_READ_PROVIDER=postgres`.

Import status:

- `npm run prisma:import-logistics-support` currently imports:
  - riders: `5`
  - rider assignments: `27`
  - platform vehicles: `4`
  - platform configs: `1`

Verification:

- `node --check` passed for the admin rider repository, controller, compat helper, logistics importer, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-admin-riders-parity` reports zero shape diffs for:
  - admin rider list
  - admin available rider list
  - admin rider assignment history
  - admin platform vehicle list
  - admin available platform vehicle list

Compatibility notes:

- Admin rider writes remain Mongo-backed.
- Platform vehicle admin writes remain Mongo-backed.
- Platform vehicle Mongo-only fields (`stateId`, `cityId`, `assignedRiderId`, `notes`, and legacy `retired` status) are stored in `PlatformVehicle.metadata` until the Prisma model is expanded.
- Filtered assignment history with `status=assigned` is not marked parity-clean yet because Mongo has older dangling assignment rows whose order/rider dependencies are not importable into the current required Prisma relation.
- The parity script can log local Redis/BullMQ `ECONNREFUSED` noise when Redis is offline, but the comparison completes successfully.

## Platform Config Read Slice

Current routes:

- `GET /api/admin/platform-config`
- `GET /api/public/platform-config`

Feature flag:

- `DB_PLATFORM_CONFIG_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresPlatformConfigReads()` in `services/postgres/compat.js`.
- Added `services/postgres/platformConfig.repository.js`.
- Added Postgres read branches in `controller/Admin/platform/platformConfig.controller.js` and `controller/public/publicPlatformConfig.controller.js`.
- Added `prisma/check-platform-config-parity.js` and npm script `prisma:check-platform-config-parity`.
- Added `prisma/import-admins-from-mongo.js` and npm script `prisma:import-admins` so `PlatformConfig.lastUpdatedBy` can resolve to a real Admin row.
- Updated `.env.example` with `DB_PLATFORM_CONFIG_READ_PROVIDER`.
- Local `.env` currently enables `DB_PLATFORM_CONFIG_READ_PROVIDER=postgres`.

Import status:

- `npm run prisma:import-admins` imported admins: `1`.
- `npm run prisma:import-logistics-support` was rerun after admin import so the singleton platform config could reconnect to its admin updater.

Verification:

- `node --check` passed for the platform config repository, admin/public controllers, admin importer, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-platform-config-parity` reports zero shape diffs for:
  - admin platform config
  - public platform config

Compatibility notes:

- Platform config writes remain Mongo-backed.
- `PlatformConfig.value.riderPayoutHour` is preserved in Postgres but omitted from the admin read response when the existing Mongo response omits it.
- Public platform config intentionally returns only service fee fields.

## Rider Self-Service Read Slice

Current routes:

- `GET /api/riders/:riderId/active-order`
- `GET /api/riders/:riderId/pending-offers`
- `GET /api/riders/:riderId/orders`
- `GET /api/riders/:riderId/orders/:orderId`

Feature flag:

- `DB_RIDER_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresRiderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/riderSelf.repository.js`.
- Added Postgres read branches in `controller/rider.controller.js`.
- Added `prisma/check-rider-self-parity.js` and npm script `prisma:check-rider-self-parity`.
- Updated `.env.example` with `DB_RIDER_READ_PROVIDER`.
- Local `.env` currently enables `DB_RIDER_READ_PROVIDER=postgres`.

Import status:

- Reran `npm run prisma:import-orders` after rider import so order `riderId` values could resolve.
- Reran `npm run prisma:import-vendor-orders` after rider import so vendor-order `riderId` values could resolve.
- Current imported counts:
  - orders: `14`
  - order items: `14`
  - vendor delivery fees: `14`
  - vendor orders: `13`

Verification:

- `node --check` passed for the rider self repository, rider controller, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-rider-self-parity` reports zero shape diffs for:
  - rider active order
  - rider pending offers
  - rider order list
  - rider order detail

Compatibility notes:

- Rider wallet and payout routes are now covered by the wallet/withdrawal slice.
- Rider write paths remain Mongo-backed: status changes, pickup, delivery OTP/confirmation, and rider profile updates.
- The parity script can log local Redis/BullMQ `ECONNREFUSED` noise when Redis is offline, but the comparison completes successfully.

## Wallet And Withdrawal Read Slice

Current routes:

- `GET /api/user/wallet`
- `GET /api/vendors/wallet`
- `GET /api/vendors/payout-details`
- `GET /api/vendors/withdrawals`
- `GET /api/riders/:riderId/wallet`
- `GET /api/riders/:riderId/bank-account`
- `GET /api/riders/:riderId/withdrawals`

Feature flag:

- `DB_WALLET_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresWalletReads()` in `services/postgres/compat.js`.
- Added `services/postgres/wallet.repository.js`.
- Added Postgres read branches in the user wallet, vendor wallet/payout, withdrawal, rider wallet, and rider withdrawal controllers.
- Expanded `prisma/import-wallets-from-mongo.js` to import wallets, wallet transactions, vendor withdrawals, and rider withdrawals.
- Added `prisma/check-wallet-parity.js` and npm script `prisma:check-wallet-parity`.
- Updated `.env.example` with `DB_WALLET_READ_PROVIDER`.
- Local `.env` currently enables `DB_WALLET_READ_PROVIDER=postgres`.

Import status:

- `npm run prisma:import-wallets` currently imports:
  - wallets: `14`
  - wallet transactions: `362`
  - vendor withdrawals: `34`
  - rider withdrawals: `0`
- Skipped wallets: `3`, because their rider owners are not present in Postgres.

Verification:

- `node --check` passed for the wallet repository, touched controllers, and wallet parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-wallet-parity` reports zero shape diffs for:
  - user wallet
  - vendor wallet
  - vendor payout details
  - vendor withdrawal history
  - rider wallet
  - rider bank account
  - rider withdrawal history

Compatibility notes:

- Wallet owner references resolve through imported UUID rows while preserving Mongo IDs in `legacyMongoId`.
- Unresolved wallet transaction order references are preserved in `WalletTransaction.metadata.legacyOrderId`.
- Vendor pending wallet balance is computed from unreleased, non-cancelled vendor order escrow, matching the Mongo aggregate.
- Wallet and withdrawal write paths remain Mongo-backed.
- The parity script can log local Redis/BullMQ `ECONNREFUSED` noise when Redis is offline, but the comparison completes successfully.

## Finance Payment Import Slice

Current data covered:

- `PaymentAttempt`
- `PaymentLock`
- `Refund`
- `Transaction`
- `Invoice`

Current work completed:

- Added `prisma/import-finance-payments-from-mongo.js` and npm script `prisma:import-finance-payments`.
- Added `prisma/check-finance-payments-parity.js` and npm script `prisma:check-finance-payments-parity`.
- Added migration `20260522000200_expand_finance_kobo_columns`.
- Regenerated the Prisma client after changing finance kobo columns to `BIGINT`.

Import status:

- `npm run prisma:import-finance-payments` currently imports:
  - payment attempts: `30`
  - payment locks: `0`
  - refunds: `12`
  - transactions: `0`
  - invoices: `57`
  - skipped: `0`

Verification:

- `node --check` passed for the importer and parity script.
- `npx prisma validate` passed.
- `npx prisma migrate deploy` applied the BIGINT migration.
- `npx prisma generate` completed successfully.
- `npm run prisma:check-finance-payments-parity` reports zero diffs for counts, statuses, mapped recovery states, invoice types, and money totals.

Compatibility notes:

- Mongo `PaymentAttempt.recoveryState=fulfilled` maps to Prisma `recovered`; the original value is preserved in `providerPayload.legacyRecoveryState`.
- Payment attempt, refund, transaction, and invoice kobo columns use Postgres `BIGINT` because invoice totals can exceed signed 32-bit integer range after kobo conversion.
- Canonical imported money fields are kobo. Raw legacy payment-attempt kobo fields are preserved separately.
- Refund and invoice metadata keeps the Mongo-only financial context needed for later reconciliation and reporting checks.

## Admin Finance Read Slice

Current routes:

- `GET /api/admin/finance/summary`
- `GET /api/admin/finance/chart`
- `GET /api/admin/finance/transactions`
- `GET /api/admin/finance/vendor-breakdown`
- `GET /api/admin/finance/escrow`
- `GET /api/admin/finance/refunds`
- `GET /api/admin/finance/payment-recovery`

Feature flag:

- `DB_ADMIN_FINANCE_READ_PROVIDER=postgres`

Current work completed:

- Added `usePostgresAdminFinanceReads()` in `services/postgres/compat.js`.
- Added `services/postgres/adminFinance.repository.js`.
- Added Postgres read branches in `controller/Admin/finance/platformFinance.controller.js`.
- Added `prisma/check-admin-finance-parity.js` and npm script `prisma:check-admin-finance-parity`.
- Updated `.env.example` with `DB_ADMIN_FINANCE_READ_PROVIDER`.
- Local `.env` currently enables `DB_ADMIN_FINANCE_READ_PROVIDER=postgres`.

Verification:

- `node --check` passed for the admin finance repository, controller, and parity script.
- `npx prisma validate` passed.
- `npm run prisma:check-admin-finance-parity` reports zero shape diffs for:
  - revenue summary
  - revenue chart
  - transaction ledger
  - vendor breakdown
  - unreleased escrow
  - refunds
  - payment recovery

Compatibility notes:

- Payment recovery reconciliation writes remain Mongo-backed.
- Payment recovery reads preserve the current Mongo response shape, including snake_case order item fields.
- Mongo `PaymentAttempt.recoveryState=fulfilled` remains exposed as `fulfilled` in payment recovery responses while Prisma stores the mapped enum value as `recovered`.
- The parity script can log local Redis/BullMQ `ECONNREFUSED` noise when Redis is offline, but the comparison completes successfully.

## Write Path Transaction Design

Provider flags:

- Keep write flags domain-specific:
  - `DB_ORDER_WRITE_PROVIDER`
  - `DB_ORDER_STATUS_WRITE_PROVIDER`
  - `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER`
  - `DB_WALLET_WRITE_PROVIDER`
  - `DB_WITHDRAWAL_WRITE_PROVIDER`
  - `DB_PAYMENT_WRITE_PROVIDER`
  - `DB_PLATFORM_CONFIG_WRITE_PROVIDER`
- `.env.example` should keep write flags on `mongo` until each slice has local write smoke coverage.

Transaction rules:

- Each request chooses one write provider branch. Do not treat Mongo + Postgres writes as one transaction.
- Use `prisma.$transaction()` whenever a Postgres write touches multiple tables.
- Payment verification, wallet updates, order fulfillment, and rider assignment writes must be idempotent and protected by existing unique fields.
- Wallet balance updates and wallet transaction rows must be committed together.
- Payment lock, payment attempt, order payment status, vendor fulfillment, and invoice generation must be committed together where the existing workflow treats them as one payment-confirmation operation.

Recommended write migration order:

1. Order status and rider assignment writes.
2. Cart/order creation writes without online payment side effects.
3. Payment initialization, verification, webhook, and recovery writes.
4. Wallet funding, admin wallet adjustment, and withdrawal writes.
5. Platform config and platform vehicle writes.

Money-field note:

- Current local parity preserves imported legacy values. A dedicated money-review pass is still required before production migration to decide final `Decimal` versus integer-kobo handling across all tables.

## Guarded Order Status Write Slice

Feature flag:

- `DB_ORDER_STATUS_WRITE_PROVIDER=postgres`
- `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER=postgres`

Current work completed:

- Added `usePostgresOrderStatusWrites()` in `services/postgres/compat.js`.
- Added `usePostgresRiderAssignmentWrites()` in `services/postgres/compat.js`.
- Added guarded Postgres write methods in `services/postgres/adminOrders.repository.js`.
- Added Postgres write branches in the admin order status override controller and vendor order status update controller.
- Updated `.env.example` with `DB_ORDER_STATUS_WRITE_PROVIDER=mongo`.
- Updated `.env.example` with `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER=mongo`.
- Local `.env` currently enables `DB_ORDER_STATUS_WRITE_PROVIDER=postgres`.
- Local `.env` currently enables `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER=postgres`.

Supported writes so far:

- Admin order status override for non-refund transitions.
- Vendor order status transitions limited to `pending`, `accepted`, `preparing`, and `ready_for_pickup`.
- Ready-for-pickup automatic rider broadcast:
  - expires stale pending assignments
  - broadcasts to verified active same-location riders not already assigned to the vendor order
  - updates parent order and sibling vendor orders to `rider_assigned`
  - creates `RiderAssignment` rows with Prisma status `pending` and legacy metadata status `assigned`
  - moves available riders to `pending_assignment`
- Rider assignment accept via `PATCH /api/riders/:riderId/status` with `status=on_delivery`:
  - accepts a specific offered order/vendor order, or the rider's latest active pending offer
  - maps Prisma `pending` offers to the legacy `assigned` workflow
  - assigns parent order and vendor order(s) to the accepting rider
  - moves the accepting rider to `on_delivery`
  - marks competing offers as `rejected` with reason `accepted_by_another_rider`
  - preserves legacy active-order response behavior with `metadata.legacyCurrentOrderId`
- Rider/admin assignment reject or timeout:
  - rider rejection uses `PATCH /api/riders/:riderId/status` with `status=available` plus an order or reason
  - admin rejection uses `PATCH /api/admin/riders/:riderId/reject-assignment`
  - moves the rider back to `available`
  - resets order/vendor-order status to `ready_for_pickup` when no active offers remain
- Rider pickup via `POST /api/riders/:riderId/pickup`:
  - resolves legacy IDs to UUIDs internally
  - updates parent order and vendor order status to `out_for_delivery`
  - updates rider status to `on_delivery`
  - updates matching pending/accepted rider assignments to `picked_up`
  - runs as one Prisma transaction
- Rider delivery confirmation via `POST /api/riders/:riderId/confirm-delivery`:
  - keeps OTP verification in the existing controller flow
  - resolves legacy order/vendor-order IDs to UUIDs internally
  - treats already delivered/completed orders as idempotent success without crediting wallets again
  - updates parent order, vendor order(s), rider assignment, and rider delivery totals
  - debits the admin wallet for rider payout when funds are available
  - credits the rider wallet and writes rider/admin wallet transaction rows
  - records the platform delivery spread as an admin wallet reporting transaction
  - releases vendor escrow to vendor wallets when admin wallet funds remain available
  - reports blocked payout or escrow-release failures so the controller can notify admins
  - runs delivery state and wallet balance changes in one Prisma transaction

Guarded/blocked writes:

- Paid-order admin cancellation remains blocked until wallet refund writes are migrated.
- Vendor completion, cancellation, failure, and refund transitions remain blocked in the Postgres write branch until remaining escrow, refund, and payment side effects are migrated.
- No local write smoke has been run yet for ready-for-pickup assignment, pickup, or delivery confirmation because a Postgres-only mutation would intentionally diverge Postgres from Mongo and make read parity fail until re-import/rollback.
- Added `prisma/smoke-rider-delivery-preflight.js` and npm script `prisma:smoke-rider-delivery-preflight` to inspect a local delivery-confirmation candidate without mutating data.
- The preflight reports whether an `out_for_delivery` order has an assigned rider, expected rider payout, platform delivery spread, admin-wallet sufficiency, rider-wallet presence, and vendor escrow release readiness.
- Added `prisma/smoke-rider-assignment-flow.js` and npm script `prisma:smoke-rider-assignment-flow` for the first rollbackable local write smoke.
- The assignment flow dry-runs by default. With `PRISMA_SMOKE_WRITE=1`, it captures affected Postgres rows, prepares a temporary fixture when needed, runs vendor ready-for-pickup, rider broadcast, rider accept, pickup, delivery confirmation, then restores the captured rows and deletes smoke-created rows.
- Current dry-run result: a prepared fixture is available from order `ORD-57AB0702F65D`; the script temporarily clears one rider's prior assignment history for that vendor order during the live smoke and restores it afterward.
- Live local smoke result: the rollbackable flow completed successfully and restored the touched Postgres rows. The delivery step credited rider payout and released escrow with no escrow-release failures.

Verification:

- `node --check` passed for the touched repository/controllers/compat helper.
- `node --check prisma/smoke-rider-assignment-flow.js` passed.
- `npx prisma validate` passed.
- `npm run prisma:smoke-rider-assignment-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-rider-assignment-flow` passed, restored the smoke rows, credited payout, and released escrow.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.
- `npm run prisma:check-vendor-orders-parity` reports zero diffs.
- `npm run prisma:check-admin-riders-parity` and `npm run prisma:check-rider-self-parity` remain parity-clean for imported data.
- `npm run prisma:check-wallet-parity` reports zero diffs.
- `npm run prisma:check-admin-finance-parity` reports zero diffs.
- Redis/BullMQ can log local `ECONNREFUSED` noise when Redis is offline.

## Cart Write/Read Slice

Feature flags:

- `DB_CART_READ_PROVIDER=postgres`
- `DB_CART_WRITE_PROVIDER=postgres`

Current work completed:

- Added `usePostgresCartReads()` and `usePostgresCartWrites()` in `services/postgres/compat.js`.
- Added `services/postgres/cart.repository.js`.
- Added guarded cart branches in `controller/menu/cartController.js`.
- Updated `.env.example` with cart read/write flags defaulted to `mongo`.
- Local `.env` currently enables both cart flags.
- Added `prisma/smoke-cart-flow.js` and npm script `prisma:smoke-cart-flow`.

Supported behavior:

- `POST /v1/cart/items` for `PORTION_ITEM`.
- `POST /v1/cart/items` for `VARIANT_ITEM`, backed by `ComboItem` in Postgres.
- `GET /v1/cart`.
- `DELETE /v1/cart/items/:lineItemId`.
- `DELETE /v1/cart/vendors/:vendorId`.

Verification:

- `node --check` passed for the cart repository, cart controller, and cart smoke script.
- `npx prisma validate` passed.
- `npm run prisma:smoke-cart-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-cart-flow` passed and restored the user's original Postgres cart state.

Live smoke summary:

- Candidate: `Mj Cuisines` / `Jollof rice` / `Portion`.
- Add created one line item.
- Cart read after add returned `vendor_count=1`, `total_items=1`, `subtotal=60000`.
- Remove returned `{ removed: true }`.
- Cart read after remove returned `vendor_count=0`, `total_items=0`, `subtotal=0`.

Compatibility notes:

- Postgres-created cart IDs are UUIDs and are returned as `_id` because there is no legacy Mongo ID for new rows.
- Cart prices remain kobo, matching the existing cart service response note.
- Order creation and checkout finalization remain separate migration slices.

## Guarded Order Creation Slice

Feature flag:

- `DB_ORDER_WRITE_PROVIDER=postgres`

Current work completed:

- Added `usePostgresOrderWrites()` in `services/postgres/compat.js`.
- Added `services/postgres/orderCreation.repository.js`.
- Added a guarded branch in `controller/order/createOrderV2.controller.js`.
- Updated `.env.example` with `DB_ORDER_WRITE_PROVIDER=mongo`.
- Local `.env` currently enables `DB_ORDER_WRITE_PROVIDER=postgres`.
- Added `prisma/smoke-order-creation-flow.js` and npm script `prisma:smoke-order-creation-flow`.

Supported behavior:

- Creates pending parent orders in Postgres.
- Creates child order items, vendor delivery fees, and pending vendor orders.
- Recalculates prices server-side from Postgres menu/vendor/platform config data.
- Resolves legacy Mongo IDs to UUIDs internally.
- Keeps the MVP single-vendor order rule.
- Uses idempotency keys to avoid duplicate Postgres orders.

Deferred behavior:

- Wallet debit, discount usage, Paystack initialization, payment attempts, webhook recovery, invoices, promo slot claims, queue jobs, and notifications are intentionally outside this slice.
- The guarded controller branch returns a pending Postgres order with payment marked `not_initialized` while payment writes are still Mongo/Paystack-backed.

Verification:

- `node --check services/postgres/orderCreation.repository.js` passed.
- `node --check controller/order/createOrderV2.controller.js` passed.
- `node --check prisma/smoke-order-creation-flow.js` passed.
- `npx prisma validate` passed.
- `npm run prisma:smoke-order-creation-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-order-creation-flow` passed and restored the created Postgres rows/vendor counters.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.
- `npm run prisma:check-vendor-orders-parity` reports zero diffs.

Live smoke summary:

- Candidate: `Mj Cuisines` / `Jollof rice` / `Portion`.
- Created order `ORD-66723D71D47A` as `pending`.
- Persisted one order item, one vendor delivery fee, and one vendor order.
- Totals were `subtotal=60000`, `deliveryFee=1000`, `serviceFee=500`, `total=61500`.
- The smoke deleted the created order and restored vendor counters afterward.

## Payment Initialization Write Slice

Feature flags:

- `DB_ORDER_WRITE_PROVIDER=postgres`
- `DB_PAYMENT_WRITE_PROVIDER=postgres`

Current work completed:

- Added `usePostgresPaymentWrites()` in `services/postgres/compat.js`.
- Added `services/postgres/payment.repository.js`.
- Updated the guarded `POST /api/orders/v2/create` branch to initialize Paystack for Postgres-created orders when payment writes are enabled.
- Updated `.env.example` with `DB_PAYMENT_WRITE_PROVIDER=mongo`.
- Local `.env` currently enables `DB_PAYMENT_WRITE_PROVIDER=postgres`.
- Added `prisma/smoke-payment-initialization-flow.js` and npm script `prisma:smoke-payment-initialization-flow`.

Supported behavior:

- Updates `Order.paymentReference` for Postgres-created orders.
- Creates/updates Postgres `PaymentAttempt` rows for initialization.
- Stores expected amounts in kobo.
- Sends Postgres order totals to Paystack as kobo directly.
- Records provider initialization success/failure in the Postgres attempt event log.

Verification:

- `node --check services/postgres/payment.repository.js` passed.
- `node --check controller/order/createOrderV2.controller.js` passed.
- `node --check prisma/smoke-payment-initialization-flow.js` passed.
- `npx prisma validate` passed.
- `npm run prisma:smoke-payment-initialization-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-payment-initialization-flow` passed and restored the temporary order/payment attempt/vendor fixture.
- `npm run prisma:check-finance-payments-parity` reports zero diffs.
- `npm run prisma:check-admin-finance-parity` reports zero diffs.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.

Live smoke summary:

- Candidate: `Mj Cuisines` / `Jollof rice` / `Portion`.
- The fixture vendor was temporarily opened because it was closed at smoke time, then restored.
- Created order `ORD-F4C7D94784EE`.
- Created reference `PSK_ORD-F4C7D94784EE_1780291007417`.
- Created one `PaymentAttempt` with `status=initialized`, `recoveryState=awaiting_verification`, and expected amount `61500` kobo.

Next migration slice:

- Paystack verification, webhook, and payment recovery writes.

## Payment Verification Provider-Validation Slice

Feature flag:

- `DB_PAYMENT_WRITE_PROVIDER=postgres`

Current work completed:

- Extended `services/postgres/payment.repository.js` for Postgres reference lookup, provider validation, failure marking, and payment-attempt event recording.
- Added guarded Postgres branches in `verifyPayment`, `verifyPaymentV2`, and the `charge.success` webhook path.
- Added `prisma/smoke-payment-verification-flow.js` and npm script `prisma:smoke-payment-verification-flow`.

Supported behavior:

- Postgres order references are verified against Paystack in the Postgres branch.
- Success validation compares Paystack amount directly to Postgres kobo totals.
- Provider failure marks the Postgres order failed and records the failed attempt.
- Provider success records `PaymentAttempt.status=success`.
- Fulfillment remains intentionally blocked until the next slice.

Verification:

- `node --check services/postgres/payment.repository.js` passed.
- `node --check controller/order/orderController.js` passed.
- `node --check prisma/smoke-payment-verification-flow.js` passed.
- `npx prisma validate` passed.
- `npm run prisma:smoke-payment-verification-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-payment-verification-flow` passed and restored the temporary order/payment attempt/vendor fixture.
- `npm run prisma:check-finance-payments-parity` reports zero diffs.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.

Live smoke summary:

- Candidate: `Mj Cuisines` / `Jollof rice` / `Portion`.
- The fixture vendor was temporarily opened because it was closed at smoke time, then restored.
- Fake provider success recorded `status=success`, `providerStatus=success`, `paidAmount=61500`, and two attempt events.

Next migration slice:

- Paid-order fulfillment writes: mark order paid, update pending vendor order state, write admin escrow/revenue wallet transactions, and keep the operation idempotent.

## Paid-Order Fulfillment Write Slice

Feature flag:

- `DB_PAYMENT_WRITE_PROVIDER=postgres`

Current work completed:

- Added `postgresPaymentRepository.fulfillPaidOrder(reference)`.
- Updated Postgres payment verification and `charge.success` webhook handling to fulfill paid orders after Paystack/provider validation.
- Added `prisma/smoke-payment-fulfillment-flow.js` and npm script `prisma:smoke-payment-fulfillment-flow`.

Supported behavior:

- A verified Postgres order is marked `paymentStatus=paid` and `orderStatus=accepted`.
- The admin wallet is created when needed from the first active admin, or reused when it already exists.
- Admin wallet balance is credited for vendor food escrow, delivery fee revenue, and service fee revenue.
- Wallet ledger rows are written as `escrow_hold`, `delivery_fee`, and `service_fee`.
- One paid order invoice is created inside the same transaction with `MCO-*` invoice numbering, item lines, delivery fee line, and service fee line.
- The fulfillment step is idempotent: a second call for the same reference returns without creating duplicate wallet credits.
- Payment attempts move to `status=recovered` and `recoveryState=recovered` after fulfillment.

Still deferred:

- Free-delivery and vendor-sponsored promo claim writes.
- Checkout cart finalization/cleanup.
- Notification/queue side effects.
- Wallet-funded checkout and discount-code checkout.

Verification:

- `node --check services/postgres/payment.repository.js` passed.
- `node --check controller/order/orderController.js` passed.
- `node --check prisma/smoke-payment-fulfillment-flow.js` passed.
- `npx prisma validate` passed.
- `npm run prisma:smoke-payment-fulfillment-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-payment-fulfillment-flow` passed and restored all smoke-touched rows.
- `npm run prisma:check-finance-payments-parity` reports zero diffs.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.
- `npm run prisma:check-admin-finance-parity` reports zero diffs.

Live smoke summary:

- Candidate: `Mj Cuisines` / `Jollof rice` / `Portion`.
- Order moved to `paymentStatus=paid` and `orderStatus=accepted`.
- Admin wallet balance delta was `61500` kobo during the smoke.
- Created three credit rows: `escrow_hold=60000`, `delivery_fee=1000`, `service_fee=500`.
- Created one `MCO-*` order invoice for `61500` kobo with three invoice lines.
- Second fulfillment run was idempotent and credited `0` kobo.

Next migration slice:

- Free-delivery and vendor-sponsored promo claim writes.
