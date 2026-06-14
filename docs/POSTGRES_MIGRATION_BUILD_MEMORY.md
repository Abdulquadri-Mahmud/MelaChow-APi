# PostgreSQL Migration Build Memory

Created: 2026-05-21

Purpose: reusable audit notes for migrating `MelaChowApi` from MongoDB/Mongoose to PostgreSQL. Treat this as the migration memory: update it after every migration step, schema decision, blocker, and verified cutover task.

## Confirmed Decisions

- PostgreSQL target: local development only for now.
- Access layer: Prisma.
- ID strategy: move directly to UUID primary keys.
- Migration style: gradual domain-by-domain.
- Data migration timing: prepare codebase first; no production Mongo data migration yet.
- Deployment target: defer until local migration is working and tested.
- Compatibility bridge: preserve `legacy_mongo_id` columns so later export/import scripts can map Mongo documents to UUID-backed PostgreSQL rows.

## First Proof Slice

- Scope: `State`, `City`, and `Category`.
- Added Prisma schema and initial SQL migration under `prisma/`.
- Added `config/prisma.js` for shared Prisma client construction.
- Added `services/postgres/locationCategory.repository.js` as a side-by-side repository. Existing Mongoose controllers are not wired to it yet.
- Added `DATABASE_URL` to `.env.example`; local `.env` should define the real local connection string before running Prisma commands.
- Dependency install blocker: `npm install` failed three times on 2026-05-21 with `ERR_SSL_CIPHER_OPERATION_FAILED` while fetching `@prisma/client` from npm. Package changes are staged in `package.json`, but `package-lock.json` was not updated because the install did not complete.
- 2026-05-21 continuation: added `DB_READ_PROVIDER=postgres` feature flag for migrated reads, wired public location/category read endpoints to lazy-load Prisma repositories only when the flag is enabled, added PostgreSQL seed scaffold, and set explicit Prisma Client output at `generated/prisma/`.
- 2026-05-21 schema-first continuation: expanded `prisma/schema.prisma` to a full backend draft with 48 models covering identity, location, menu/catalog, cart/order, finance, notifications, promos, reviews, support, rider assignment, analytics, activity logs, platform config, legacy food compatibility, and delivery agent compatibility. Prisma validation/generation is still deferred until dependencies install successfully.
- 2026-05-21 relationship/enums continuation: added 31 enums, formalized stable Prisma relations, consolidated migration strategy into `prisma/README.md`, and removed the earlier partial proof migration so the next SQL migration can be generated from the reviewed full schema.
- 2026-05-22 consistency pass: fixed final relation gaps around `OrderItem.restaurantId`, `VendorDeliveryFee.restaurantId`, and `OrderItem.foodId` mapping to the active `MenuItem` flow. Legacy `Food` remains a compatibility table for old data migration rather than the active order-item relation.
- 2026-05-22 money standard: decided PostgreSQL stores all monetary values as integer kobo. Prisma field names remain readable, but database column mappings use `_kobo` suffixes. API compatibility conversions will happen at repository/controller boundaries.

## Current Backend Shape

- Backend root: `MelaChowApi`.
- Runtime: Node.js ESM, Express 5, Socket.IO, BullMQ/ioredis, node-cron jobs.
- Current database stack: `mongoose` with `MONGO_URI` in `config/db.js`.
- App bootstrap imports `connectDB` from `config/db.js`, uses `express-mongo-sanitize`, and configures `Sentry.mongoIntegration()`.
- Tests use `mongodb-memory-server` in `tests/setup.js`.
- Data access is spread directly across controllers, services, jobs, middleware, socket handlers, workers, scripts, and model methods. There is no repository/DAO boundary yet.

## Database-Coupled Entry Points

- Connection: `config/db.js`
- Startup and middleware: `index.js`
- Seed logic: `config/categorySeed.js`, `seed_categories.js`
- Background workers/jobs: `workers/index.js`, `jobs/scheduledPayout.job.js`, `jobs/riderAssignmentTimeout.job.js`, `jobs/riderAssignmentRetry.job.js`
- Test database harness: `tests/setup.js`
- Legacy migration/inspection scripts: `scripts/*`, `scratch/*`, `tmp/*`

## Mongoose Models Found

Core identity:

- `User`
- `Vendor`
- `Admin`
- `Rider`

Commerce and ordering:

- `Order`
- `VendorOrder`
- `PendingOrder`
- `PaymentAttempt`
- `PaymentLock`
- `Transaction`
- `Refund`
- `Invoice`

Menu and cart:

- `Category`
- `VendorMenuSection`
- `MenuItem`
- `MenuItemPortion`
- `MenuItemChoiceGroup`
- `MenuItemChoiceOption`
- `ComboItem`
- `Cart`
- `VendorSubCart`
- `CartLineItem`
- Legacy `Food`

Wallet and payouts:

- `Wallet`
- `Withdrawal`
- `RiderWithdrawal`
- `AdminWallet` model also exists under `model/Admin/wallet.model.js`.

Location and logistics:

- `State`
- `City`
- `RiderAssignment`
- `PlatformVehicle`
- `DeliveryAgent`

Notifications, support, reviews, promo:

- `Notification`
- `PushSubscription`
- `VendorPushSubscription`
- `RiderPushSubscription`
- `AdminPushSubscription`
- `Review`
- `Report`
- `SupportTicket`
- `Discount`
- `FreeDeliveryPromo`
- `FreeDeliveryClaim`
- `VendorDeliveryPromo`
- `VendorDeliveryClaim`
- `SearchTrend`
- `ActivityLog`
- `PlatformConfig`

## Critical Domain Relationships

- `users` have embedded `addresses`; addresses contain legacy `city/state` strings plus `cityId/stateId`.
- `vendors` reference `State`, `City`, `Wallet`, `Food`, `VendorOrder`, `Rider`, and owner `User` records. They also hold embedded opening hours, payout details, status flags, delivery config, metadata, and legacy address strings.
- `riders` can be vendor-managed or admin-managed, reference `Vendor`, `State`, `City`, `Admin`, `PlatformVehicle`, and current order.
- `wallets` are polymorphic via `ownerId + ownerModel` across `Admin`, `Vendor`, `User`, and `Rider`; wallet transactions are embedded inside the wallet document.
- `orders` embed order items, delivery address, vendor delivery fees, applied discount snapshot, free-delivery promo snapshot, vendor-delivery promo snapshot, rider assignment state, and status log.
- `vendor_orders` split parent orders per restaurant and embed item snapshots, commission, vendor total, delivery share, escrow fields, order status, and rider assignment.
- `cart` is already closer to relational design: `Cart -> VendorSubCart -> CartLineItem`.
- `menu_items`, `menu_item_portions`, and choice groups/options are separate collections and should translate cleanly to normalized tables.
- `discounts`, `promos`, `notifications`, `support_tickets`, and invoices use nested arrays/objects that should likely become JSONB or child tables depending on query frequency.

## MongoDB Features That Need PostgreSQL Equivalents

- `ObjectId`: choose UUID primary keys or keep Mongo ObjectId strings during transition. UUID is preferred long term, but ObjectId-as-text can reduce frontend/API breakage during phased migration.
- `populate`: replace with SQL joins, explicit include queries, or ORM relations.
- `lean`: irrelevant in PostgreSQL; SQL client returns plain objects.
- Embedded arrays:
  - `User.addresses`
  - `Order.items`
  - `Wallet.transactions`
  - `SupportTicket.timeline/adminNotes`
  - `Discount.usedBy`
  - notification/promo metadata
- Mongo update operators:
  - `$set`, `$inc`, `$push`, `$pull`, `$addToSet`, `$unset`
  - Convert to SQL `UPDATE`, `jsonb_set`, child table inserts/deletes, or transaction blocks.
- Aggregations:
  - Heavy use in finance/admin dashboards, reviews, recommendations, search, vendor stats, order summaries.
  - Convert to SQL `GROUP BY`, joins, CTEs, window functions, and materialized views where useful.
- Text indexes:
  - `MenuItem` text search on name/description/tags.
  - `SupportTicket` text search on ticket/order/payment fields.
  - Use PostgreSQL full text search (`tsvector`) or trigram indexes.
- TTL index:
  - `Notification` has TTL expiry on `createdAt`.
  - Replace with scheduled cleanup job or partition retention policy.
- Partial unique indexes:
  - `Cart`: unique active cart per customer.
  - `Rider.currentOrderId`: unique when present.
  - `Order.paymentReference`, `Order.idempotencyKey`: sparse unique.
  - Use PostgreSQL partial unique indexes.
- `refPath`:
  - `Wallet.ownerId + ownerModel` needs either polymorphic columns plus constraints, or separate owner columns/tables. Best transitional path: keep `owner_model` enum and `owner_id`, enforce uniqueness, add app-level validation first.

## Transaction Hotspots

These areas currently rely on Mongo sessions and must become explicit PostgreSQL transactions:

- Vendor creation with wallet: `model/vendor/vendor.model.js`
- Order creation, payment, promo claim, wallet debit, vendor order creation: `controller/order/createOrderV2.controller.js`
- Legacy order flow: `controller/order/orderController.js`, `services/order.v1.service.js`
- Rider assignment and delivery state changes: `services/riderAssignment.service.js`, `services/rider.service.js`, `controller/Admin/order_management/adminOrder.controller.js`
- Rider assignment timeout recovery: `jobs/riderAssignmentTimeout.job.js`
- Refunds: `services/refund.service.js`
- Vendor/admin promo changes: `controller/Admin/vendorPromo.controller.js`
- Finance recovery: `controller/Admin/finance/platformFinance.controller.js`
- Invoice creation can receive an existing session: `services/invoice.service.js`

## High-Risk Files For Migration

- `controller/order/createOrderV2.controller.js`: very large, central order/payment/promo/wallet workflow.
- `controller/order/orderController.js`: legacy order/payment and webhook behavior.
- `services/rider.service.js`: delivery lifecycle, rider assignment, wallet updates.
- `services/riderAssignment.service.js`: assignment flow and timeouts.
- `controller/Admin/finance/platformFinance.controller.js`: aggregation-heavy finance reporting.
- `controller/Admin/order_management/adminOrder.controller.js`: admin order views and assignment controls.
- `controller/menu/vendorMenuController.js`: many direct model operations and several references to commented/removed variant models.
- `services/cart.service.js`: cart mutation logic with nested selections.
- `controller/search/searchFood.controller.js`, `controller/recommendation/recommendation.controller.js`: query/search/recommendation heavy.
- `services/discount.service.js`: identity checks and usage updates against embedded `usedBy`.

## Stale Or Suspicious Imports

These are migration blockers or cleanup candidates because they point at `../models/*`, but the backend uses `model/*`:

- `controller/payment/payment.controller.js` imports `../models/Wallet.js`, `../models/Vendor.js`, `../models/Transaction.js`.
- `controller/wallet/wallet.controller.js` imports `../models/Wallet.js`.

Verify whether these routes are mounted and exercised before migration. If mounted, they may already be broken.

## Suggested PostgreSQL Modeling Direction

Recommended stack decision for this codebase:

- Use PostgreSQL with an ORM/query builder that supports transactions and JSONB cleanly.
- Prisma is productive for typed schema and migrations, but this is currently plain JS, not TypeScript.
- Drizzle or Knex can feel closer to SQL and work well in JS.
- If minimum disruption matters, start with Knex or node-postgres plus a repository layer. If long-term schema clarity matters more, use Prisma and gradually type the DB layer.

Initial table families:

- Identity: `users`, `user_addresses`, `admins`, `vendors`, `riders`
- Location: `states`, `cities`
- Menu: `categories`, `vendor_menu_sections`, `menu_items`, `menu_item_portions`, `menu_item_choice_groups`, `menu_item_choice_options`, `combo_items`
- Cart: `carts`, `vendor_sub_carts`, `cart_line_items`, child tables or JSONB for selected choices
- Orders: `orders`, `order_items`, `order_item_selected_options`, `vendor_delivery_fees`, `vendor_orders`, `vendor_order_items`
- Finance: `wallets`, `wallet_transactions`, `withdrawals`, `rider_withdrawals`, `payment_attempts`, `payment_locks`, `refunds`, `transactions`, `invoices`, `invoice_lines`
- Logistics: `rider_assignments`, `platform_vehicles`
- Engagement: `reviews`, `reports`, `support_tickets`, `support_ticket_timeline`, `support_ticket_admin_notes`, `notifications`, push subscription tables
- Promotions: `discounts`, `discount_usages`, `free_delivery_promos`, `free_delivery_claims`, `vendor_delivery_promos`, `vendor_delivery_claims`
- Analytics/config: `search_trends`, `activity_logs`, `platform_configs`

Use JSONB initially for fields that are snapshots or rarely queried:

- `orders.applied_discount`
- `orders.free_delivery_promo`
- `orders.vendor_delivery_promo`
- `orders.delivery_address` can be a table or JSONB; table is better if location analytics matter.
- `vendor.opening_hours`
- `vendor.metadata`
- push subscription payloads
- support ticket metadata
- payment attempt events

Normalize fields that are frequently filtered, joined, or aggregated:

- users/vendors/riders/admins
- cities/states
- menu item portions/options
- order items and vendor order items
- wallet transactions
- promo/discount claims and usages
- notifications ownership/read/type fields

## Migration Strategy

Phase 1: Stabilize and prepare

- Add a database access boundary around current Mongoose operations in high-risk domains.
- Fix stale imports.
- Decide on ID strategy: UUID vs ObjectId-as-text bridge.
- Add model inventory tests and contract tests for critical endpoints.
- Keep API response `_id` compatibility during migration.

Phase 2: PostgreSQL schema and dual-read helpers

- Add PostgreSQL connection config separate from Mongo.
- Create initial schema migrations.
- Implement repository modules for identity, menu, cart, orders, wallets, and location.
- Use feature flags per domain, not one global switch.

Phase 3: Data migration

- Export Mongo collections in dependency order.
- Load reference tables first: states, cities, categories, admins.
- Load identity tables: users, vendors, riders.
- Load menu/cart/order/finance data.
- Preserve old Mongo IDs in `legacy_mongo_id` columns for reconciliation and gradual API compatibility.
- Build row-count and checksum reconciliation scripts.

Phase 4: Cut over by domain

- Start with low-risk read-heavy domains: locations, categories, platform config.
- Then menu and public vendor/menu browsing.
- Then cart.
- Then orders/payment/wallet/rider assignment last.

Phase 5: Remove Mongo

- Remove `mongoose`, `mongodb-memory-server`, `express-mongo-sanitize`, `Sentry.mongoIntegration()`, and `MONGO_URI` after all domains are cut over.
- Replace tests with PostgreSQL test DB setup.

## Immediate Next Steps

1. Review the validated Prisma schema before generating migration SQL.
2. Keep UUID primary keys and `legacy_mongo_id` columns for future Mongo export/import mapping.
3. Keep the first runnable migration focused on schema creation only; data migration scripts come later.
4. Model and migrate backend domains in this order:
   - Identity/location: `User`, `Admin`, `Vendor`, `Rider`, `State`, `City`.
   - Menu/catalog: `Category`, `VendorMenuSection`, `MenuItem`, `MenuItemPortion`, `MenuItemChoiceGroup`, `MenuItemChoiceOption`, `ComboItem`.
   - Cart/order: `Cart`, `VendorSubCart`, `CartLineItem`, `Order`, `OrderItem`, `VendorOrder`.
   - Finance: `Wallet`, `WalletTransaction`, `Withdrawal`, `RiderWithdrawal`, `PaymentAttempt`, `Refund`, `Invoice`.
   - Ops/engagement: notifications, reviews, reports, support tickets, promos, discounts, rider assignments, platform config.
5. Use relational tables for frequently queried, transactional data:
   - user addresses
   - order items and selected options
   - vendor order items
   - wallet transactions
   - discount usages
   - promo claims
   - menu portions/options
6. Use JSON/JSONB initially for flexible snapshots and rarely queried embedded payloads:
   - vendor opening hours, payout details, metadata
   - order delivery address and promo/discount snapshots
   - payment provider payloads and attempt events
   - push subscription payloads
   - support timeline/admin notes where needed
7. After schema review, generate fresh migration SQL from the validated full schema. The old `20260521000000_init_location_category` proof migration has been removed.
8. After migration SQL review, run `prisma migrate dev` against a local PostgreSQL database.

## Prisma Validation Status

- Prisma CLI/client installed as `6.19.1` because local Node is `22.11.0`; Prisma `7.4.2` requires Node `22.12+`.
- `npm run prisma:generate` succeeds and generated the client into `generated/prisma`.
- `npx prisma validate` succeeds when `DATABASE_URL` is supplied.
- Full initial migration SQL generated at `prisma/migrations/20260522000000_init_full_schema/migration.sql`.
- Generated migration creates 48 tables and did not include warnings, unsupported markers, TODOs, or DROP statements during the quick scan.
- Local `.env` has `DATABASE_URL` configured for local PostgreSQL on `localhost:5000`.
- `npm run prisma:migrate` applied `20260522000000_init_full_schema` successfully to the local PostgreSQL database.
- `npm run prisma:seed` completed successfully.
- Seed verification counts: `State=1`, `City=4`, `Category=92`.
- `DB_READ_PROVIDER=postgres` was enabled locally for the first read proof.
- API smoke test used `node index.js`; `npm run dev`/`nodemon` hit local Windows `spawn EPERM`.
- Public Postgres-backed smoke tests passed:
  - `GET /api/locations/states` returned `count=1`.
  - `GET /api/locations/cities?stateId=<stateId>` returned `count=4`.
  - `GET /api/categories/public` returned 21 root categories.
  - `GET /api/categories/tree` returned the category tree.
  - `GET /api/categories` returned 92 categories.
  - `GET /api/categories/platform-categories` returned the category tree payload.
- Local Redis was not running during smoke tests; BullMQ worker logs showed `ECONNREFUSED`, but the location/category HTTP reads still succeeded.
- `package.json#prisma` seed config works for Prisma 6 but emits a deprecation warning for Prisma 7; migrate this to `prisma.config.ts` before a future Prisma 7 upgrade.

Validation fixes applied:

- `UserAddress` keeps legacy text values as `cityText`/`stateText` mapped to `city`/`state`, while `cityId`/`stateId` are the relational fields.
- Removed the invalid `Category.legacyFoods` relation because legacy `Food.categories` remains a string array, not a category FK.
- Added `Order.walletTransactions` as the inverse relation for `WalletTransaction.order`.
- Moved `lastUpdatedByAdmin` onto `PlatformConfig`, matching its `lastUpdatedBy` scalar.

## Menu/Catalog Migration Slice

Current Mongo-backed menu/catalog surface:

- Customer routes in `routes/menu/customerMenu.routes.js`:
  - `GET /v1/vendors/foods/:foodId`
  - `GET /v1/vendors/:vendorId/menu`
  - `GET /v1/vendors/:vendorId/menu/items/:itemId`
  - `GET /v1/vendors/:vendorId/menu/combos/:comboId`
  - `GET /v1/vendors/marketplace/categories/:categoryId/items`
  - `GET /v1/vendors/marketplace/categories/:categoryId/vendors`
- Vendor routes in `routes/menu/vendorMenu.routes.js`:
  - sections CRUD
  - menu item CRUD/status/archive/move
  - portion CRUD/stock
  - item choice group/option CRUD
  - legacy variant endpoints
  - `GET /v1/menu/platform-categories`
  - `GET /v1/menu/:vendorId/items`
- Combo routes in `routes/menu/comboRoutes.js`.
  - mounted at `/v1/menu/combos`
- Dependent read-heavy domains that still query menu collections directly:
  - search
  - recommendations
  - foods-by-location
  - public reviews
  - admin category/vendor metrics
- Transactional domains that must stay Mongo until full parity:
  - cart
  - order creation/verification
  - stock mutation

Prisma/model audit notes:

- `VendorMenuSection`, `MenuItem`, `MenuItemChoiceGroup`, `MenuItemChoiceOption`, and `ComboItem` already match the Mongoose shape closely.
- `MenuItemPortion.max_quantity` was missing from Prisma; added as nullable `maxQuantity @map("max_quantity")`.
- Migration `20260522000100_add_menu_portion_max_quantity` was applied locally.
- `ComboItem.choice_groups` remains JSON initially, matching the current embedded Mongo design.
- Money remains kobo in PostgreSQL. Compatibility mappers expose naira helpers where current HTTP responses expect them.
- Prisma enum value `non_veg` must be mapped back to API string `non-veg` in compatibility output.

Implementation status:

- Added `DB_MENU_READ_PROVIDER` as a separate flag. It is currently `postgres` locally after smoke testing.
- Added `usePostgresMenuReads()` helper in `services/postgres/compat.js`.
- Added `services/postgres/menuCatalog.repository.js`.
- Repository supports UUIDs and legacy Mongo IDs for vendor/category/item/combo lookup.
- Repository returns Mongo-compatible `_id` values using `legacyMongoId` when available, falling back to UUID.
- Repository smoke test against empty local Postgres menu data passed: sections/items/combos returned empty arrays.
- Added `prisma/import-menu-from-mongo.js` and npm script `prisma:import-menu`.
- Importer dependency order:
  - states
  - cities
  - categories
  - vendors
  - vendor menu sections
  - menu items
  - menu item portions
  - menu item choice groups
  - menu item choice options
  - combo items
- Importer is idempotent via `legacy_mongo_id` upserts.
- Importer ran successfully twice with no skipped rows.
- Imported row counts after idempotency check:
  - `State=5`
  - `City=14`
  - `Category=104`
  - `Vendor=2`
  - `VendorMenuSection=2`
  - `MenuItem=3`
  - `MenuItemPortion=7`
  - `MenuItemChoiceGroup=4`
  - `MenuItemChoiceOption=12`
  - `ComboItem=1`
- Customer-facing Postgres menu read branches were added in `controller/menu/customerMenuController.js`.
- HTTP smoke tests passed with `DB_MENU_READ_PROVIDER=postgres`:
  - `GET /v1/vendors/:vendorId/menu`
  - `GET /v1/vendors/:vendorId/menu/items/:itemId`
  - `GET /v1/vendors/foods/:foodId`
  - `GET /v1/vendors/:vendorId/menu/combos/:comboId`
  - `GET /v1/vendors/foods/:comboId`
  - `GET /v1/vendors/marketplace/categories/:categoryId/items`
  - `GET /v1/vendors/marketplace/categories/:categoryId/vendors`
- Added `prisma/check-menu-response-parity.js` and npm script `prisma:check-menu-parity`.
- Tightened `services/postgres/menuCatalog.repository.js` to return Mongo-compatible outward shapes for sections, portions, choice groups/options, menu items, combos, marketplace items, and storefront vendors.
- Public item/combo Postgres controller branches now use the same compact vendor response shape as the Mongo branches.
- `npm run prisma:check-menu-parity` currently reports `diffCount=0` for:
  - vendor menu
  - vendor item detail
  - public food detail
  - combo detail
  - marketplace category items
  - marketplace category vendors
- Added vendor-auth read branches behind `DB_MENU_READ_PROVIDER=postgres`:
  - `GET /v1/menu/:vendorId/sections`
  - `GET /v1/menu/:vendorId/items`
- `services/postgres/menuCatalog.repository.js` now supports vendor menu section reads and vendor dashboard item lists with filters, counts, stats, and pagination.
- Expanded `npm run prisma:check-menu-parity`; it now also reports `diffCount=0` for:
  - vendor sections
  - vendor menu items
- Added combo read branches behind `DB_MENU_READ_PROVIDER=postgres`:
  - `GET /v1/menu/combos/vendor/:vendorId`
  - `GET /v1/menu/combos/:comboId`
- Combo writes/mutations remain Mongo-backed.
- Expanded `npm run prisma:check-menu-parity`; it now also reports `diffCount=0` for:
  - vendor combos
  - vendor combo detail
- Startup still logs local Redis `ECONNREFUSED` noise.
- Startup also attempted the old Mongo category seeder and logged a duplicate key for `Pounded Yam`; server still started and Postgres-backed menu reads succeeded.

Next menu/catalog steps:

1. Decide whether `DB_MENU_READ_PROVIDER=postgres` should remain enabled locally or be flipped back to `mongo` between tests.
2. Add focused HTTP smoke checks for authenticated vendor routes once a local vendor token is available.
3. Move to the next read-heavy domain: search, recommendations, foods-by-location, public reviews, or admin category/vendor metrics.
4. Keep vendor writes, cart, orders, and stock mutation on Mongo until each transactional path has dedicated migration and tests.

## Search Migration Slice

Current search surface:

- `GET /api/search/food/search`
- `GET /api/search/food/autocomplete`
- `GET /api/search/food/trending`
- `GET /api/search/food/search-analytics`

Implementation status:

- Added `DB_SEARCH_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_SEARCH_READ_PROVIDER=postgres`.
- Added `usePostgresSearchReads()` in `services/postgres/compat.js`.
- Added `services/postgres/search.repository.js`.
- `searchFoods` and `autocompleteFoods` now have Postgres read branches using imported vendors, categories, menu items, portions, and combos.
- Search trend writes still happen in Mongo via `SearchTrend.updateOne` before the Postgres search branch returns.
- Trending searches and search analytics remain Mongo-backed because they are based on `SearchTrend`.
- Repository smoke test passed:
  - `searchRepository.search({ q: "rice", page: 1, limit: 5 })` returned `count=2`, `total=2`, first item `Jollof rice` from `Mj Cuisines`.
  - `searchRepository.autocomplete({ q: "ri", limit: 5 })` returned `count=3`.
- Added `prisma/check-search-response-parity.js` and npm script `prisma:check-search-parity`.
- `npm run prisma:check-search-parity` currently reports `diffCount=0` for:
  - `search rice`
  - `search rating sort`
  - `autocomplete ri`
- HTTP smoke tests passed through `node index.js` on local port `3005`:
  - `GET /api/search/food/search?q=rice&page=1&limit=5` returned `success=true`, `count=2`, `total=2`, first result `Jollof rice`.
  - `GET /api/search/food/autocomplete?q=ri&limit=5` returned `success=true`, `count=3`, first suggestion `Jollof rice`.

Compatibility notes:

- Postgres search currently uses `contains`/array exact matching instead of Mongo text-score search.
- This is acceptable for the local proof but should become PostgreSQL full-text/trigram search before production cutover.
- Price filtering and price sorting remain deferred, matching the current controller note.
- Local HTTP smoke still logs Redis `ECONNREFUSED` noise because Redis is offline; this did not block search routes.
- Startup still attempts the old Mongo category seeder and logs the existing duplicate key for `Pounded Yam`; server still starts.

Next search steps:

1. Add PostgreSQL full-text/trigram indexes and ranking once the search response contract is stable.
2. Move to the next read-heavy domain: recommendations, public reviews, or admin category/vendor metrics.

## Foods By Location Migration Slice

Current route:

- `GET /api/user/foods`

Important route note:

- This route is currently protected by `auth`, so route-level smoke needs a valid user JWT.

Implementation status:

- Added `DB_FOODS_BY_LOCATION_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_FOODS_BY_LOCATION_READ_PROVIDER=postgres`.
- Added `usePostgresFoodsByLocationReads()` in `services/postgres/compat.js`.
- Added `services/postgres/foodsByLocation.repository.js`.
- `getFoodsByLocation` now has a Postgres read branch using imported vendors, location IDs/address JSON, menu items, portions, choice groups, combos, categories, and city delivery fees.
- Added `prisma/check-foods-by-location-parity.js` and npm script `prisma:check-foods-location-parity`.
- `npm run prisma:check-foods-location-parity` currently reports `diffCount=0` for:
  - `foods by location`
- Current parity sample:
  - city `Saapade`
  - state `Ogun State`
  - Mongo count `4`
  - Postgres count `4`

Verification:

- `node --check` passed for the foods-by-location repository, controller, and parity script.
- `npx prisma validate` passed.
- Repository smoke test passed for `Saapade, Ogun State`, returning `count=4`.
- Authenticated HTTP smoke was attempted with a local JWT, but the server startup died on MongoDB SRV timeout (`querySrv ETIMEOUT _mongodb._tcp...`) before the request could connect. Retry this smoke when Mongo connectivity is stable.

Compatibility notes:

- JSON address filtering is used as a fallback alongside relational `cityId`/`stateId`.
- Response shape is Mongo-compatible for foods, portions, choice groups, combo items, category, and restaurant summary.

## Notes To Keep Updated

- Do not delete Mongo models until all endpoints and jobs using that model have moved.
- Keep response shapes stable for frontend/mobile/vendor/rider/admin apps.
- Financial workflows need strongest tests before cutover.
- Order creation and rider assignment require transaction-level parity, not just schema parity.

## Recommendations Migration Slice

Current route:

- `GET /api/recommendations`

Implementation status:

- Added `DB_RECOMMENDATION_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_RECOMMENDATION_READ_PROVIDER=postgres`.
- Added `usePostgresRecommendationReads()` in `services/postgres/compat.js`.
- Added `services/postgres/recommendation.repository.js`.
- `getRecommendations` now has a Postgres read branch using imported vendors, location IDs/address JSON, menu items, portions, combos, city delivery fees, and PostgreSQL order/order-item data for `trendingNearby`.
- Added `prisma/check-recommendation-response-parity.js` and npm script `prisma:check-recommendation-parity`.

Covered response sections:

- `timeOfDay`
- `underrated`
- `weatherBased`
- `trendingNearby`
- `budgetFriendly`

Verification:

- `node --check` passed for:
  - `services/postgres/recommendation.repository.js`
  - `controller/recommendation/recommendation.controller.js`
  - `prisma/check-recommendation-response-parity.js`
- `npx prisma validate` passed.
- Direct repository smoke passed for:
  - city `Saapade`
  - state `Ogun State`
  - weather `rain`
- After the order import, `npm run prisma:check-recommendation-parity` reports `diffCount=0` for:
  - recommendations by location
  - weather recommendations
- Smoke counts:
  - `timeOfDay=0`
  - `underrated=1`
  - `weatherBased=0`
  - `trendingNearby=0`
  - `budgetFriendly=3`

Compatibility notes:

- Response envelope remains `{ success, meta, data }`.
- Recommendation item shape preserves `_id`, `image`, `price`, `portionLabel`, `item_type`, `dietary_type`, `tags`, `rating`, `ratingCount`, `deliveryFee`, and compact restaurant fields.
- `trendingNearby` is now PostgreSQL-backed in the Postgres branch.
- Imported delivered orders currently fall on May 17-19, 2026. Because the controller uses a two-day trending window and today is May 25, 2026, both Mongo and Postgres correctly return `trendingNearby=0` in parity.

## Public Reviews Migration Slice

Current routes:

- `GET /api/public/reviews/vendor/:vendorId`
- `GET /api/public/reviews/vendor/:vendorId/summary`
- `GET /api/public/reviews/food/:foodId`

Implementation status:

- Added `DB_PUBLIC_REVIEW_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_PUBLIC_REVIEW_READ_PROVIDER=postgres`.
- Added `usePostgresPublicReviewReads()` in `services/postgres/compat.js`.
- Added `services/postgres/publicReviews.repository.js`.
- `controller/user/public.reviews.controller.js` now has Postgres branches for the three public read endpoints.
- Added `prisma/import-reviews-from-mongo.js` and npm script `prisma:import-reviews`.
- Added `prisma/check-public-reviews-parity.js` and npm script `prisma:check-public-reviews-parity`.

Import status:

- `npm run prisma:import-reviews` completed successfully.
- Imported counts:
  - users `1`
  - reviews `4`
  - skipped `0`

Verification:

- `node --check` passed for:
  - `services/postgres/publicReviews.repository.js`
  - `controller/user/public.reviews.controller.js`
  - `prisma/import-reviews-from-mongo.js`
  - `prisma/check-public-reviews-parity.js`
- Direct repository smoke passed for:
  - vendor `Mj Cuisines`
  - item `Jollof rice`
  - vendor reviews `4`
  - recent reviews `4`
  - food reviews `3`
- `npm run prisma:check-public-reviews-parity` currently reports `diffCount=0` for:
  - public vendor reviews
  - public vendor reviews summary
  - public food reviews

Compatibility notes:

- Public review response shapes preserve the current Mongo envelope, restaurant/food summaries, pagination, rating distributions, rating percentages, rating breakdowns, and populated review fields.
- The Mongo public review controller needed explicit schema registration imports for `User`, `Food`, and `Category`; without these, standalone parity checks returned 500 before comparison.
- Review writes and private/admin review management remain Mongo-backed until their transactional and permission paths are migrated separately.

## Review Management Migration Slice

Current routes:

- `GET /api/user/reviews`
- `GET /api/admin/user/reviews/user-reviews`
- `GET /api/admin/user/reviews/vendor-reviews`
- `GET /api/admin/user/reviews/vendor-reviews/all`
- `GET /api/vendor/reviews`

Implementation status:

- Added `DB_REVIEW_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_REVIEW_READ_PROVIDER=postgres`.
- Added `usePostgresReviewReads()` in `services/postgres/compat.js`.
- Added `services/postgres/reviewManagement.repository.js`.
- `controller/user/user.reviews.controller.js` now has Postgres branches for user reviews, vendor reviews, and admin vendor review overview.
- Added `prisma/check-review-management-parity.js` and npm script `prisma:check-review-management-parity`.

Verification:

- `node --check` passed for:
  - `services/postgres/reviewManagement.repository.js`
  - `controller/user/user.reviews.controller.js`
  - `prisma/check-review-management-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-review-management-parity` currently reports `diffCount=0` for:
  - user reviews
  - vendor reviews by query
  - vendor reviews by authenticated vendor
  - admin vendor reviews
  - admin vendor reviews filtered

Compatibility notes:

- Review create/delete mutations remain Mongo-backed because they update vendor/menu ratings and should be migrated with write-path transaction tests.
- The Postgres admin filtered vendor stats intentionally mirrors current Mongo aggregate behavior where `vendorStats` is empty when `vendorId` is supplied as a string filter.
- Legacy `Review.foodId` populates as `null` in these Mongo read shapes because the schema references `Food` while review data points at menu items. The Postgres mapper preserves that outward shape for parity.

## Category Metrics Migration Slice

Current route:

- `GET /api/admin/categories/metrics`

Implementation status:

- Added `DB_CATEGORY_METRICS_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_CATEGORY_METRICS_READ_PROVIDER=postgres`.
- Added `usePostgresCategoryMetricsReads()` in `services/postgres/compat.js`.
- Added `services/postgres/categoryMetrics.repository.js`.
- `controller/Admin/categoryMetrics.controller.js` now has a Postgres read branch.
- Added `prisma/check-category-metrics-parity.js` and npm script `prisma:check-category-metrics-parity`.

Verification:

- `node --check` passed for:
  - `services/postgres/categoryMetrics.repository.js`
  - `controller/Admin/categoryMetrics.controller.js`
  - `prisma/check-category-metrics-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-category-metrics-parity` currently reports `diffCount=0`.
- Current category metric distribution count:
  - Mongo `3`
  - Postgres `3`

Compatibility notes:

- This is an admin read-only slice for category inventory distribution.
- Broader admin/vendor/user metrics should wait for user/order import readiness, especially because vendor sales metrics depend on order history.

## User Metrics Migration Slice

Current route:

- `GET /api/admin/users/metrics`

Implementation status:

- Added `DB_USER_METRICS_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_USER_METRICS_READ_PROVIDER=postgres`.
- Added `usePostgresUserMetricsReads()` in `services/postgres/compat.js`.
- Added `services/postgres/userMetrics.repository.js`.
- `controller/Admin/userMetrics.controller.js` now has a Postgres read branch.
- Added `prisma/import-users-from-mongo.js` and npm script `prisma:import-users`.
- Added `prisma/check-user-metrics-parity.js` and npm script `prisma:check-user-metrics-parity`.

Import status:

- `npm run prisma:import-users` completed successfully.
- Imported counts:
  - users `13`
  - addresses `15`
  - skipped `0`

Verification:

- `node --check` passed for:
  - `prisma/import-users-from-mongo.js`
  - `services/postgres/userMetrics.repository.js`
  - `controller/Admin/userMetrics.controller.js`
  - `prisma/check-user-metrics-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-user-metrics-parity` currently reports `diffCount=0`.
- Current seven-day signup total:
  - Mongo `0`
  - Postgres `0`

Compatibility notes:

- This slice covers only the seven-day admin signup trend.
- User auth/profile/address write paths remain Mongo-backed until they receive dedicated migration and workflow tests.

## Order Import And Vendor Metrics Migration Slice

Current route:

- `GET /api/admin/vendors/metrics`

Implementation status:

- Added `prisma/import-orders-from-mongo.js` and npm script `prisma:import-orders`.
- Added `DB_VENDOR_METRICS_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_VENDOR_METRICS_READ_PROVIDER=postgres`.
- Added `usePostgresVendorMetricsReads()` in `services/postgres/compat.js`.
- Added `services/postgres/vendorMetrics.repository.js`.
- `controller/Admin/vendorMetrics.controller.js` now has a Postgres read branch.
- Added `prisma/check-vendor-metrics-parity.js` and npm script `prisma:check-vendor-metrics-parity`.

Import status:

- `npm run prisma:import-orders -- --dry-run` was intended as a dry-run, but the flag did not pass through in the local shell. The importer is idempotent and completed a real import successfully.
- Imported counts:
  - orders `14`
  - order items `14`
  - vendor delivery fees `14`
  - skipped `0`

Verification:

- `node --check` passed for:
  - `prisma/import-orders-from-mongo.js`
  - `services/postgres/vendorMetrics.repository.js`
  - `controller/Admin/vendorMetrics.controller.js`
  - `prisma/check-vendor-metrics-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-vendor-metrics-parity` currently reports `diffCount=0`.
- Current monthly vendor sales metrics:
  - Mongo count `9`, revenue `41025`
  - Postgres count `9`, revenue `41025`

Compatibility notes:

- This import covers parent `Order`, embedded `OrderItem`, and embedded `vendorDeliveryFees`.
- It intentionally does not migrate vendor sub-orders, payment attempts, refunds, transactions, invoices, wallet transactions, escrow, or finance ledgers yet.
- Imported order monetary values preserve the current Mongo numeric values so existing read metrics remain parity-compatible.
- This import also gives the Postgres recommendation `trendingNearby` branch real order/order-item data to work with.

## Vendor Order Dashboard Migration Slice

Current routes:

- `GET /api/vendor/orders`
- `GET /api/vendor/orders/:vendorOrderId`

Implementation status:

- Added `prisma/import-vendor-orders-from-mongo.js` and npm script `prisma:import-vendor-orders`.
- Added `DB_VENDOR_ORDER_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_VENDOR_ORDER_READ_PROVIDER=postgres`.
- Added `usePostgresVendorOrderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/vendorOrders.repository.js`.
- `controller/vendor/vendor.controller.js` now has Postgres read branches for vendor order list and detail.
- Added `prisma/check-vendor-orders-parity.js` and npm script `prisma:check-vendor-orders-parity`.

Import status:

- `npm run prisma:import-vendor-orders` completed successfully.
- Imported counts:
  - vendor orders `13`
  - skipped `0`

Verification:

- `node --check` passed for:
  - `prisma/import-vendor-orders-from-mongo.js`
  - `services/postgres/vendorOrders.repository.js`
  - `controller/vendor/vendor.controller.js`
  - `prisma/check-vendor-orders-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-vendor-orders-parity` currently reports `diffCount=0` for:
  - vendor order list
  - vendor order detail

Compatibility notes:

- Vendor order status mutations remain Mongo-backed because they update parent orders and trigger workflow side effects.
- The parity script imports the existing vendor controller, which initializes Redis/BullMQ dependencies and can log local `ECONNREFUSED` noise when Redis is offline. The parity result still completed successfully.

## Admin Order Read Migration Slice

Current routes:

- `GET /api/admin/orders/stats`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:orderId`
- `GET /api/admin/orders/platform-managed`
- `GET /api/admin/orders/commission-ledger`

Implementation status:

- Added `DB_ADMIN_ORDER_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_ADMIN_ORDER_READ_PROVIDER=postgres`.
- Added `usePostgresAdminOrderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/adminOrders.repository.js`.
- `controller/Admin/order_management/adminOrder.controller.js` now has Postgres branches for admin order stats, list, detail, platform-managed logistics reads, and commission ledger reads.
- Added `prisma/check-admin-orders-parity.js` and npm script `prisma:check-admin-orders-parity`.
- Added `prisma/import-wallets-from-mongo.js` and npm script `prisma:import-wallets` so order detail can return `vendorWallets`.
- Added a dedicated platform-managed mapper in `services/postgres/adminOrders.repository.js` because the Mongo route returns raw order items plus vendor-order context, not the richer populated item shape used by the main admin order list/detail routes.
- Added a Postgres commission ledger mapper in `services/postgres/adminOrders.repository.js`.

Import status:

- `npm run prisma:import-wallets` completed successfully.
- Imported counts:
  - wallets `8`
  - skipped `9`
- Skipped wallets are for Admin/Rider owners that are not imported yet.

Verification:

- `node --check` passed for:
  - `services/postgres/adminOrders.repository.js`
  - `controller/Admin/order_management/adminOrder.controller.js`
  - `prisma/import-wallets-from-mongo.js`
  - `prisma/check-admin-orders-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-admin-orders-parity` currently reports `diffCount=0` for:
  - admin order stats
  - admin order list
  - admin order detail by Mongo ID
  - admin order detail by order code
  - admin platform-managed order list
  - admin platform-managed logistics order list
  - admin commission ledger

Compatibility notes:

- Admin status override and rider assignment remain Mongo-backed.
- The platform-managed read branch intentionally mirrors current Mongo behavior: `status` and `statusGroup=logistics` are honored, while the currently destructured `paymentStatus`, `startDate`, `endDate`, and `search` query fields are not applied by either backend yet.
- The commission ledger branch mirrors the current Mongo aggregation shape. Notably, the Mongo `$project` includes `isPlatformManaged: true` as an inclusion expression, not as a literal field assignment, so `isPlatformManaged` is omitted and `deliveryFeeHeld` remains `0` in parity-compatible Postgres output.
- Postgres commission ledger config reads from `PlatformConfig.value` when present and otherwise falls back to the same default rider payout of `600`.
- The Mongo admin order controller needed explicit model registration for `MenuItem`; without it, standalone parity checks returned 500 before comparison.

## Logistics Support Import Slice

Purpose:

- Prepare Postgres data needed before migrating admin rider assignment and other logistics write flows.
- This slice does not switch any logistics write route to Postgres yet.

Current data covered:

- `Rider`
- `RiderAssignment`
- `PlatformConfig`

Implementation status:

- Added `prisma/import-logistics-support-from-mongo.js`.
- Added npm script `prisma:import-logistics-support`.
- Added `prisma/check-logistics-support-parity.js`.
- Added npm script `prisma:check-logistics-support-parity`.

Import status:

- `npm run prisma:import-logistics-support` completed successfully.
- Imported counts:
  - riders `5`
  - rider assignments `27`
  - platform configs `1`
- Skipped rider assignments:
  - `31`
  - Reason: referenced order or rider was not present in Postgres.

Verification:

- `node --check` passed for:
  - `prisma/import-logistics-support-from-mongo.js`
  - `prisma/check-logistics-support-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-logistics-support-parity` currently reports `diffCount=0`.
- Current parity summary:
  - rider total: Mongo `5`, Postgres `5`
  - rider statuses: `available=3`, `pending_assignment=2`
  - rider managers: `admin=5`
  - available verified active riders: `3`
  - import-eligible rider assignments: Mongo `27`, Postgres `27`
  - skipped missing-dependency assignments: Mongo `31`, Postgres gap `31`
  - assignment mapped statuses: `delivered=7`, `pending=6`, `rejected=14`
  - platform config value matches.

Compatibility notes:

- Mongo `RiderAssignment.status=assigned` maps to Prisma `RiderAssignmentStatus.pending` because the Prisma enum does not have `assigned`.
- Mongo `RiderAssignment.status=cancelled` maps to Prisma `rejected` for now because the Prisma enum does not have `cancelled`.
- Original assignment status, `assignedBy`, and `assignedAt` are preserved in `RiderAssignment.metadata`.
- Platform config is stored in Postgres as `PlatformConfig.value` JSON under `type=singleton`.

## Admin Rider Read Migration Slice

Current routes:

- `GET /api/admin/riders`
- `GET /api/admin/rider-assignments`
- `GET /api/admin/platform-vehicles`

Implementation status:

- Added `DB_ADMIN_RIDER_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_ADMIN_RIDER_READ_PROVIDER=postgres`.
- Added `usePostgresAdminRiderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/adminRiders.repository.js`.
- `controller/rider.controller.js` now has Postgres read branches for admin rider list, assignment history, and platform vehicle list.
- Added `prisma/check-admin-riders-parity.js`.
- Added npm script `prisma:check-admin-riders-parity`.
- Updated `prisma/import-logistics-support-from-mongo.js` to preserve unresolved legacy rider `approvedBy` and `currentOrderId` IDs in metadata for response parity.
- Updated `prisma/import-logistics-support-from-mongo.js` to import `PlatformVehicle`.
- Platform vehicle Mongo-only fields (`stateId`, `cityId`, `assignedRiderId`, `notes`, and legacy `retired` status) are preserved in `PlatformVehicle.metadata` because the current Prisma model only has core vehicle columns.

Verification:

- `node --check` passed for:
  - `services/postgres/adminRiders.repository.js`
  - `services/postgres/compat.js`
  - `controller/rider.controller.js`
  - `prisma/check-admin-riders-parity.js`
  - `prisma/import-logistics-support-from-mongo.js`
- `npx prisma validate` passed.
- `npm run prisma:check-admin-riders-parity` currently reports `diffCount=0` for:
  - admin rider list
  - admin available rider list
  - admin rider assignment history
  - admin platform vehicle list
  - admin available platform vehicle list

Compatibility notes:

- Admin rider mutations remain Mongo-backed:
  - update rider
  - approve rider
  - deactivate rider
  - reject assignment offer
  - platform vehicle create/update/delete/unassign
- The assignment history parity check intentionally covers the default history view. Filtered `status=assigned` currently exposes older Mongo assignments with missing order/rider dependencies; those cannot be represented in Postgres while `RiderAssignment.orderId` is required.
- The parity script imports the existing rider controller, which initializes Redis/BullMQ dependencies and can log local `ECONNREFUSED` noise when Redis is offline. The parity result still completed successfully.

Import status update:

- `npm run prisma:import-logistics-support` now imports:
  - riders `5`
  - rider assignments `27`
  - platform vehicles `4`
  - platform configs `1`

## Platform Config Read Migration Slice

Current routes:

- `GET /api/admin/platform-config`
- `GET /api/public/platform-config`

Implementation status:

- Added `DB_PLATFORM_CONFIG_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_PLATFORM_CONFIG_READ_PROVIDER=postgres`.
- Added `usePostgresPlatformConfigReads()` in `services/postgres/compat.js`.
- Added `services/postgres/platformConfig.repository.js`.
- `controller/Admin/platform/platformConfig.controller.js` now has a Postgres read branch for admin config reads.
- `controller/public/publicPlatformConfig.controller.js` now has a Postgres read branch for public config reads.
- Added `prisma/check-platform-config-parity.js`.
- Added npm script `prisma:check-platform-config-parity`.
- Added `prisma/import-admins-from-mongo.js`.
- Added npm script `prisma:import-admins`.
- The admin platform config controller now explicitly registers the Admin mongoose model before populating `lastUpdatedBy`, which keeps standalone parity checks stable.

Import status:

- `npm run prisma:import-admins` completed successfully.
- Imported admins: `1`.
- `npm run prisma:import-logistics-support` was rerun after admin import so `PlatformConfig.lastUpdatedBy` could resolve to the imported Admin row.

Verification:

- `node --check` passed for:
  - `controller/Admin/platform/platformConfig.controller.js`
  - `controller/public/publicPlatformConfig.controller.js`
  - `services/postgres/platformConfig.repository.js`
  - `prisma/import-admins-from-mongo.js`
  - `prisma/check-platform-config-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-platform-config-parity` currently reports `diffCount=0` for:
  - admin platform config
  - public platform config

Compatibility notes:

- Platform config writes remain Mongo-backed for now.
- `PlatformConfig.value.riderPayoutHour` remains stored in Postgres for finance/payout use, but the admin config read response omits it when Mongo's current response omits it.
- Public platform config only exposes service fee fields, matching the existing public controller.

## Rider Self-Service Read Migration Slice

Current routes:

- `GET /api/riders/:riderId/active-order`
- `GET /api/riders/:riderId/pending-offers`
- `GET /api/riders/:riderId/orders`
- `GET /api/riders/:riderId/orders/:orderId`

Implementation status:

- Added `DB_RIDER_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_RIDER_READ_PROVIDER=postgres`.
- Added `usePostgresRiderReads()` in `services/postgres/compat.js`.
- Added `services/postgres/riderSelf.repository.js`.
- `controller/rider.controller.js` now has Postgres read branches for rider active order, pending offers, order list, and order detail.
- Added `prisma/check-rider-self-parity.js`.
- Added npm script `prisma:check-rider-self-parity`.
- Updated `.env.example` with `DB_RIDER_READ_PROVIDER`.

Import status:

- Reran `npm run prisma:import-orders` after riders existed so `Order.riderId` could resolve.
- Reran `npm run prisma:import-vendor-orders` after riders existed so `VendorOrder.riderId` could resolve.
- Import counts remained:
  - orders `14`
  - order items `14`
  - vendor delivery fees `14`
  - vendor orders `13`

Verification:

- `node --check` passed for:
  - `services/postgres/riderSelf.repository.js`
  - `controller/rider.controller.js`
  - `prisma/check-rider-self-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-rider-self-parity` currently reports `diffCount=0` for:
  - rider active order
  - rider pending offers
  - rider order list
  - rider order detail

Compatibility notes:

- Rider wallet, payout bank account, and payout history reads are intentionally left for the wallet/withdrawal slice.
- Rider status changes, pickup, OTP, delivery confirmation, and profile updates remain Mongo-backed for now.
- The parity script imports the existing rider controller, which initializes Redis/BullMQ dependencies and can log local `ECONNREFUSED` noise when Redis is offline. The parity result still completed successfully.

## Wallet And Withdrawal Read Migration Slice

Current routes:

- `GET /api/user/wallet`
- `GET /api/vendors/wallet`
- `GET /api/vendors/payout-details`
- `GET /api/vendors/withdrawals`
- `GET /api/riders/:riderId/wallet`
- `GET /api/riders/:riderId/bank-account`
- `GET /api/riders/:riderId/withdrawals`

Implementation status:

- Added `DB_WALLET_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_WALLET_READ_PROVIDER=postgres`.
- Added `usePostgresWalletReads()` in `services/postgres/compat.js`.
- Added `services/postgres/wallet.repository.js`.
- Added Postgres read branches in:
  - `controller/user/wallet.controller.js`
  - `controller/vendor/vendor.controller.js`
  - `controller/wallet/withdrawal.controller.js`
  - `controller/rider.controller.js`
  - `controller/rider/riderWithdrawal.controller.js`
- Expanded `prisma/import-wallets-from-mongo.js` to import wallets, embedded wallet transactions, vendor withdrawals, and rider withdrawals.
- Added `prisma/check-wallet-parity.js`.
- Added npm script `prisma:check-wallet-parity`.
- Updated `.env.example` with `DB_WALLET_READ_PROVIDER`.

Import status:

- `npm run prisma:import-wallets` currently imports:
  - wallets `14`
  - wallet transactions `362`
  - vendor withdrawals `34`
  - rider withdrawals `0`
- Skipped wallets:
  - `3`
  - Reason: referenced rider owners are not present in Postgres.

Verification:

- `node --check` passed for:
  - `services/postgres/wallet.repository.js`
  - `controller/user/wallet.controller.js`
  - `controller/vendor/vendor.controller.js`
  - `controller/wallet/withdrawal.controller.js`
  - `controller/rider.controller.js`
  - `controller/rider/riderWithdrawal.controller.js`
  - `prisma/check-wallet-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-wallet-parity` currently reports `diffCount=0` for:
  - user wallet
  - vendor wallet
  - vendor payout details
  - vendor withdrawal history
  - rider wallet
  - rider bank account
  - rider withdrawal history

Compatibility notes:

- Wallet owner references use the shared UUID strategy with legacy Mongo IDs resolved through `legacyMongoId`.
- `WalletTransaction.metadata.legacyOrderId` preserves order references that could not be resolved during import.
- Vendor pending wallet balance is computed from unreleased non-cancelled `VendorOrder.escrowAmount`, matching the current Mongo aggregate.
- Wallet and withdrawal write paths remain Mongo-backed for now.
- The wallet parity harness passes vendor IDs as strings because the current Mongo controller builds `new mongoose.Types.ObjectId(id)` for vendor wallet escrow aggregation.
- The parity script imports existing controllers that initialize Redis/BullMQ dependencies and can log local `ECONNREFUSED` noise when Redis is offline. The parity result still completed successfully.

## Finance Payment Import Migration Slice

Current data covered:

- `PaymentAttempt`
- `PaymentLock`
- `Refund`
- `Transaction`
- `Invoice`

Implementation status:

- Added `prisma/import-finance-payments-from-mongo.js`.
- Added npm script `prisma:import-finance-payments`.
- Added `prisma/check-finance-payments-parity.js`.
- Added npm script `prisma:check-finance-payments-parity`.
- Added migration `20260522000200_expand_finance_kobo_columns`.
- Regenerated the Prisma client after the finance money-column update.

Import status:

- `npm run prisma:import-finance-payments` currently imports:
  - payment attempts `30`
  - payment locks `0`
  - refunds `12`
  - transactions `0`
  - invoices `57`
  - skipped `0`

Verification:

- `node --check` passed for:
  - `prisma/import-finance-payments-from-mongo.js`
  - `prisma/check-finance-payments-parity.js`
- `npx prisma validate` passed.
- `npx prisma migrate deploy` applied `20260522000200_expand_finance_kobo_columns`.
- `npx prisma generate` completed successfully.
- `npm run prisma:check-finance-payments-parity` currently reports `diffCount=0`.
- Current parity totals:
  - payment attempts `30`
  - payment locks `0`
  - refunds `12`
  - transactions `0`
  - invoices `57`
  - payment attempt statuses: `pending=4`, `recovered=26`
  - mapped payment recovery states: `awaiting_verification=4`, `recovered=26`
  - refund statuses: `completed=12`
  - invoice types: `order=50`, `wallet_funding=7`
  - invoice total kobo `11157317000`

Compatibility notes:

- Mongo `PaymentAttempt.recoveryState=fulfilled` maps to Prisma `PaymentRecoveryState.recovered`; the original value is preserved in `PaymentAttempt.providerPayload.legacyRecoveryState`.
- Finance payment amount columns for `PaymentAttempt`, `Refund`, `Transaction`, and `Invoice` now use Postgres `BIGINT` because local invoice totals can exceed signed 32-bit integer range after conversion to kobo.
- Canonical imported money fields use kobo. Raw legacy `expectedAmountKobo` and `paidAmountKobo` are preserved in their legacy columns.
- Refund metadata preserves `originalTotal`, `commissionRetained`, `orderStatusAtCancellation`, notes, and the original Mongo refund status.
- Invoice metadata preserves status, currency, subtotal, delivery fee, service fee, paid-at timestamp, customer snapshot, and legacy IDs.

## Admin Finance Read Migration Slice

Current routes:

- `GET /api/admin/finance/summary`
- `GET /api/admin/finance/chart`
- `GET /api/admin/finance/transactions`
- `GET /api/admin/finance/vendor-breakdown`
- `GET /api/admin/finance/escrow`
- `GET /api/admin/finance/refunds`
- `GET /api/admin/finance/payment-recovery`

Implementation status:

- Added `DB_ADMIN_FINANCE_READ_PROVIDER` as a separate read switch.
- Local `.env` currently has `DB_ADMIN_FINANCE_READ_PROVIDER=postgres`.
- Added `usePostgresAdminFinanceReads()` in `services/postgres/compat.js`.
- Added `services/postgres/adminFinance.repository.js`.
- Added Postgres read branches in `controller/Admin/finance/platformFinance.controller.js`.
- Added `prisma/check-admin-finance-parity.js`.
- Added npm script `prisma:check-admin-finance-parity`.
- Updated `.env.example` with `DB_ADMIN_FINANCE_READ_PROVIDER`.

Verification:

- `node --check` passed for:
  - `services/postgres/adminFinance.repository.js`
  - `controller/Admin/finance/platformFinance.controller.js`
  - `prisma/check-admin-finance-parity.js`
- `npx prisma validate` passed.
- `npm run prisma:check-admin-finance-parity` currently reports `diffCount=0` for:
  - revenue summary
  - revenue chart
  - transaction ledger
  - vendor breakdown
  - unreleased escrow
  - refunds
  - payment recovery

Compatibility notes:

- Admin finance write/recovery action `POST /api/admin/finance/payment-recovery/:reference/reconcile` remains Mongo-backed.
- Payment recovery responses preserve the current Mongo response shape, including order item snake_case fields and populated user/order snapshots.
- Mongo `PaymentAttempt.recoveryState=fulfilled` remains exposed as `fulfilled` in payment recovery responses via preserved legacy payload data, while the stored Prisma enum value is `recovered`.
- The parity script imports existing finance/order controllers, which initialize Redis/BullMQ dependencies and can log local `ECONNREFUSED` noise when Redis is offline. The parity result still completed successfully.

## Write Path Transaction Design

Goal:

- Move writes domain-by-domain without mixing Mongo and Postgres writes inside one business transaction.
- Preserve the existing API response surface while Postgres becomes the local source of truth.
- Keep every write idempotent where external payment, wallet, or rider-assignment side effects are involved.

Write provider flags:

- Use narrow write switches instead of one global write switch:
  - `DB_ORDER_WRITE_PROVIDER`
  - `DB_ORDER_STATUS_WRITE_PROVIDER`
  - `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER`
  - `DB_WALLET_WRITE_PROVIDER`
  - `DB_WITHDRAWAL_WRITE_PROVIDER`
  - `DB_PAYMENT_WRITE_PROVIDER`
  - `DB_PLATFORM_CONFIG_WRITE_PROVIDER`
- Defaults remain `mongo` in `.env.example` until each write slice has local parity/smoke coverage.
- Local `.env` should only flip a write flag after its importer, read parity, and write smoke tests pass.

Transaction rules:

- Use `prisma.$transaction()` for Postgres write paths that touch more than one table.
- Do not update Mongo and Postgres in the same controller branch as a single logical write. During migration, each request chooses exactly one provider branch.
- Use database uniqueness for idempotency:
  - `Order.idempotencyKey`
  - `Order.paymentReference`
  - `PaymentAttempt.reference`
  - `PaymentLock.reference`
  - `Wallet.ownerId + ownerModel`
  - `Withdrawal.paystackReference`
  - `RiderWithdrawal.paystackReference`
- Lock-like payment verification should create or upsert `PaymentLock` in the same Prisma transaction that validates and marks the order paid.
- Wallet balance updates must write the wallet row and wallet transaction rows in the same Prisma transaction.
- Order fulfillment writes must create/update:
  - parent `Order`
  - `OrderItem`
  - `VendorDeliveryFee`
  - child `VendorOrder`
  - admin/vendor wallet entries when payment is already captured
- Rider assignment writes must create/update:
  - `RiderAssignment`
  - `Order.riderId`
  - `Order.riderAssignment`
  - `VendorOrder.riderId`
  - `Rider.currentOrderId` equivalent metadata/status fields if the current schema cannot represent a Mongo field directly.

Compatibility rules:

- Every write response should pass through the same shape adapters used by read slices.
- Legacy Mongo IDs are accepted at API boundaries and resolved to UUIDs internally.
- New Postgres rows keep `legacyMongoId` null only for records created after the cutover.
- Metadata fields preserve legacy-only fields until the Prisma schema is intentionally expanded.
- Money fields stay as currently imported for local parity; the separate money-review pass will decide final `Decimal`/kobo normalization before production migration.

Recommended write migration order:

1. Order status and rider assignment writes.
2. Cart/order creation writes without online payment side effects.
3. Payment initialization, verification, webhook, and recovery writes.
4. Wallet funding, admin wallet adjustment, withdrawal request/approval writes.
5. Platform config and platform vehicle writes.

Verification requirements for each write slice:

- `node --check` for touched controllers/repositories/scripts.
- `npx prisma validate`.
- Targeted importer rerun when the write depends on imported references.
- Route-level parity for reads after a write smoke.
- At least one local happy-path smoke and one idempotency/retry smoke for payment or wallet writes.

## Guarded Order Status Write Slice

Current routes touched:

- `PATCH /api/admin/orders/:orderId/status`
- `PATCH /api/vendors/orders/:vendorOrderId/update`
- `PATCH /api/riders/:riderId/status`
- `PATCH /api/admin/riders/:riderId/reject-assignment`
- `POST /api/riders/:riderId/pickup`
- `POST /api/riders/:riderId/confirm-delivery`

Implementation status:

- Added `DB_ORDER_STATUS_WRITE_PROVIDER` as a narrow write switch.
- Added `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER` as a separate rider-assignment write switch.
- Local `.env` currently has `DB_ORDER_STATUS_WRITE_PROVIDER=postgres`.
- Local `.env` currently has `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER=postgres`.
- `.env.example` keeps `DB_ORDER_STATUS_WRITE_PROVIDER=mongo`.
- `.env.example` keeps `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER=mongo`.
- Added `usePostgresOrderStatusWrites()` and `usePostgresRiderAssignmentWrites()` in `services/postgres/compat.js`.
- Added guarded Postgres write methods in `services/postgres/adminOrders.repository.js`:
  - `adminOverrideOrderStatus()`
  - `updateVendorOrderStatus()`
  - `offerReadyVendorOrderToAvailableRiders()`
  - `riderSelfRepository.markPickedUp()`
  - `riderSelfRepository.acceptAssignment()`
  - `riderSelfRepository.rejectAssignment()`
  - `riderSelfRepository.markDelivered()`
- Added Postgres write branches in:
  - `controller/Admin/order_management/adminOrder.controller.js`
  - `controller/order/orderController.js`
  - `controller/rider.controller.js`

Current supported Postgres write behavior:

- Admin status override:
  - Updates parent `Order.orderStatus`.
  - Updates child `VendorOrder.orderStatus`.
  - Appends a status-log entry.
  - Uses `prisma.$transaction()`.
  - Blocks paid-order `cancelled` overrides until wallet refund writes are migrated.
- Vendor status update:
  - Currently limited to `pending`, `accepted`, `preparing`, and `ready_for_pickup`.
  - Updates the vendor order status.
  - Recomputes the parent order status from child vendor-order statuses.
  - Appends a parent order status-log entry.
  - Uses `prisma.$transaction()`.
  - When the status newly moves to `ready_for_pickup` and `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER=postgres`, the controller calls the guarded Postgres broadcast-assignment method.
- Ready-for-pickup automatic rider broadcast:
  - Resolves delivery city/state from the order delivery address first, then the restaurant location.
  - Expires stale pending assignments before finding new candidate riders.
  - Broadcasts to verified, active riders in the same city/state who have not already handled the vendor order.
  - Updates all sibling vendor orders for the parent order to `rider_assigned`.
  - Updates parent `Order.orderStatus` to `rider_assigned`.
  - Stores `Order.riderAssignment.status` as the legacy-compatible string `assigned`.
  - Creates `RiderAssignment` rows with Prisma status `pending` and preserves legacy-facing status `assigned` in metadata.
  - Moves available riders to `pending_assignment`, sets `currentOrderId`, and sets the assignment expiry.
  - Sends admin attention notification when no eligible riders can be broadcast to.
- Rider assignment accept:
  - Resolves legacy rider/order/vendor-order IDs to UUIDs internally.
  - Accepts either a specific offered order/vendor order or the latest active pending offer for the rider.
  - Treats Prisma `RiderAssignment.status=pending` as the legacy `assigned` offer state.
  - Sets parent `Order.riderId`, keeps parent order status at `rider_assigned`, and records `riderAssignment.status=accepted`.
  - Sets selected/all `VendorOrder.riderId` to the accepting rider and keeps status at `rider_assigned`.
  - Moves the accepting rider to `on_delivery`.
  - Stores `metadata.legacyCurrentOrderId` so legacy-shaped active-order reads can keep returning the offered vendor-order ID when applicable.
  - Marks the accepted assignment as `accepted`.
  - Marks competing pending offers as `rejected` with reason `accepted_by_another_rider` and frees those riders.
  - Uses `prisma.$transaction()`.
- Rider/admin assignment reject or timeout:
  - Marks active pending assignments as `rejected` or `timeout`.
  - Moves the rider back to `available`.
  - When no active offers remain for the order/vendor order, resets the parent order and vendor order status to `ready_for_pickup`, clears the rider, and records the rejection/timeout in `Order.riderAssignment` and `statusLog`.
  - Supports rider-initiated rejection/timeout and admin-initiated offer rejection through the same repository method.
  - Uses `prisma.$transaction()`.
- Rider pickup:
  - Resolves legacy rider/order/vendor-order IDs to UUIDs internally.
  - Requires the rider to be assigned on the parent order or selected vendor order.
  - Updates the parent order status to `out_for_delivery`.
  - Updates the selected vendor order, or all sibling vendor orders when a master order ID is provided, to `out_for_delivery`.
  - Updates the rider status to `on_delivery`.
  - Updates matching pending/accepted `RiderAssignment` rows to `picked_up`.
  - Appends a parent order status-log entry.
  - Uses `prisma.$transaction()`.
- Rider delivery confirmation:
  - OTP verification remains in the existing controller flow before the write branch runs.
  - Resolves legacy rider/order/vendor-order IDs to UUIDs internally.
  - Requires the rider to be assigned on the parent order or selected vendor order.
  - Treats already delivered/completed orders as idempotent and does not double-credit wallets on retry.
  - Updates the parent order to `delivered`, stores `riderAssignment.status=delivered`, and records `Order.riderEarnings`.
  - Updates selected/all vendor orders to `delivered`.
  - Updates matching accepted/picked-up rider assignments to `delivered`.
  - Increments rider deliveries and earnings, then frees the rider or points them at the next active order.
  - Debits the admin wallet for rider payout when funds are available.
  - Credits the rider wallet and writes matching `rider_payout` wallet transactions.
  - Records `delivery_spread` on the admin wallet using `reportingAmount`.
  - Releases vendor escrow when admin wallet funds are available, credits vendor wallets, and writes matching `escrow_release` wallet transactions.
  - Preserves the current behavior where insufficient admin wallet funds do not roll back delivery confirmation; instead, the response returns blocked payout/escrow metadata for the controller notification cascade.
  - Uses `prisma.$transaction()` for delivery state, wallet balance updates, and wallet transaction rows. Missing rider/vendor wallets may be created just before the transaction with zero balances so their IDs can be used inside the ledger transaction.

Guarded/blocked writes:

- Paid-order admin cancellation remains blocked until wallet refund writes are migrated.
- Vendor `rider_assigned`, `out_for_delivery`, `delivered`, `completed`, `cancelled`, `failed`, and `refunded` remain blocked in the Postgres vendor-status branch until rider pickup/delivery, escrow, refund, and payment side effects are migrated.
- Delivery confirmation is now wired to Postgres behind `DB_RIDER_ASSIGNMENT_WRITE_PROVIDER`, but no live write smoke has been run yet.
- No live Postgres write smoke has been run for this branch yet because a Postgres-only mutation would intentionally diverge local Postgres from Mongo and break read parity until re-import/rollback.
- Added `prisma/smoke-rider-delivery-preflight.js` and npm script `prisma:smoke-rider-delivery-preflight` as the first non-mutating local smoke gate for delivery confirmation.
- The preflight checks for an `out_for_delivery` order with an assigned rider and reports expected rider payout, platform delivery spread, admin-wallet sufficiency, rider-wallet presence, and vendor escrow release readiness without changing Postgres or Mongo.
- Added `prisma/smoke-rider-assignment-flow.js` and npm script `prisma:smoke-rider-assignment-flow` for the first rollbackable local write smoke path.
- The assignment smoke flow dry-runs by default. With `PRISMA_SMOKE_WRITE=1`, it snapshots affected Postgres rows, prepares a temporary fixture when needed, runs vendor ready-for-pickup, rider broadcast, rider accept, pickup, delivery confirmation, then restores captured rows and deletes smoke-created rows.
- Current dry-run result: a prepared fixture is available from order `ORD-57AB0702F65D`; the script temporarily clears one rider's prior assignment history for that vendor order during the live smoke and restores it afterward.
- Live local smoke result: the rollbackable flow completed successfully and restored the touched Postgres rows. The delivery step credited rider payout and released escrow with no escrow-release failures.
- Post-smoke verification:
  - `npm run prisma:smoke-rider-delivery-preflight` returned no active `out_for_delivery` candidate, consistent with the smoke restore.
  - `npm run prisma:check-rider-self-parity` returned `diffCount=0` for all rider self-service checks.
  - `npm run prisma:check-wallet-parity` exited successfully after the restore.
  - `npm run prisma:check-admin-finance-parity` exited successfully after the restore.
  - Redis/BullMQ still logs local `ECONNREFUSED` noise when Redis is offline.

Verification:

- `node --check` passed for:
  - `services/postgres/adminOrders.repository.js`
  - `controller/Admin/order_management/adminOrder.controller.js`
  - `controller/order/orderController.js`
  - `controller/rider.controller.js`
  - `services/postgres/compat.js`
  - `services/postgres/riderSelf.repository.js`
- `npx prisma validate` passed.
- `npm run prisma:check-admin-orders-parity` currently reports `diffCount=0`.
- `npm run prisma:check-vendor-orders-parity` currently reports `diffCount=0`.
- `npm run prisma:check-admin-riders-parity` currently reports `diffCount=0`.
- `npm run prisma:check-rider-self-parity` currently reports `diffCount=0`.
- `npm run prisma:check-wallet-parity` currently reports `diffCount=0`.
- `npm run prisma:check-admin-finance-parity` currently reports `diffCount=0`.
- Local Redis/BullMQ can still print `ECONNREFUSED` noise when Redis is offline.

Compatibility notes:

- Notification calls remain best-effort and may still use legacy Mongo IDs at their boundaries.
- New Postgres assignment rows will use UUIDs internally and legacy IDs in response/notification contexts where resolvable.
- This slice intentionally does not mark the full order-status/rider-assignment agenda as complete; pickup confirmation, delivery OTP/confirmation, completion, escrow release, refund, and wallet side effects are still on the migration agenda.

## Cart Write/Read Slice

Current routes touched:

- `POST /v1/cart/items`
- `GET /v1/cart`
- `DELETE /v1/cart/items/:lineItemId`
- `DELETE /v1/cart/vendors/:vendorId`

Feature flags:

- `DB_CART_READ_PROVIDER`
- `DB_CART_WRITE_PROVIDER`

Implementation status:

- Added `usePostgresCartReads()` and `usePostgresCartWrites()` in `services/postgres/compat.js`.
- Added `services/postgres/cart.repository.js`.
- Added guarded Postgres branches in `controller/menu/cartController.js`.
- Updated `.env.example` with cart read/write flags defaulted to `mongo`.
- Local `.env` currently enables `DB_CART_READ_PROVIDER=postgres` and `DB_CART_WRITE_PROVIDER=postgres`.
- Added `prisma/smoke-cart-flow.js`.
- Added npm script `prisma:smoke-cart-flow`.

Supported behavior:

- Adds portion-based menu items to a Postgres active cart.
- Resolves legacy Mongo IDs from authenticated user/cart payloads to UUIDs internally.
- Creates the active cart when needed.
- Creates or reuses the vendor sub-cart.
- Validates menu item, vendor ownership, portion availability/stock, portion max quantity, and required choice groups.
- Stores cart prices as kobo in Postgres.
- Returns Mongo-compatible cart response keys: `cart_id`, `vendor_sub_carts`, `line_items`, `cart_summary`.
- Removes a specific line item after verifying the user owns the active cart.
- Deletes an empty vendor sub-cart after the last item is removed.
- Removes all items for a specific vendor sub-cart.
- Combo/variant cart adds are mapped to `ComboItem` for the Postgres branch, but full combo choice-price validation remains a later enhancement.

Verification:

- `node --check` passed for:
  - `services/postgres/cart.repository.js`
  - `controller/menu/cartController.js`
  - `prisma/smoke-cart-flow.js`
- `npx prisma validate` passed.
- `npm run prisma:smoke-cart-flow` passed in dry-run mode and selected:
  - user `69db650ef5bd111279d9fa5b`
  - vendor `Mj Cuisines`
  - item `Jollof rice`
  - portion `Portion`
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-cart-flow` passed and restored the user's original Postgres cart state.
- Live smoke result:
  - added one line item
  - `cartAfterAdd.vendor_count=1`
  - `cartAfterAdd.total_items=1`
  - `cartAfterAdd.subtotal=60000`
  - remove returned `{ removed: true }`
  - `cartAfterRemove.vendor_count=0`
  - `cartAfterRemove.total_items=0`
  - `cartAfterRemove.subtotal=0`

Compatibility notes:

- This slice intentionally covers cart only. Order creation, payment initialization, wallet payment, Paystack verification, and checkout cart finalization remain on the migration agenda.
- Postgres-created cart line items return UUID-backed `_id` values because they have no `legacyMongoId`; remove routes accept those UUIDs.
- The active-cart partial unique index is still listed as manual SQL work. The current guarded branch uses application-level find-or-create and is sufficient for local smoke testing.

## Guarded Order Creation Slice

Current route touched:

- `POST /api/orders/v2/create`

Feature flag:

- `DB_ORDER_WRITE_PROVIDER`

Implementation status:

- Added `usePostgresOrderWrites()` in `services/postgres/compat.js`.
- Added `services/postgres/orderCreation.repository.js`.
- Added a guarded Postgres branch in `controller/order/createOrderV2.controller.js`.
- Updated `.env.example` with `DB_ORDER_WRITE_PROVIDER=mongo`.
- Local `.env` currently enables `DB_ORDER_WRITE_PROVIDER=postgres`.
- Added `prisma/smoke-order-creation-flow.js`.
- Added npm script `prisma:smoke-order-creation-flow`.

Supported behavior:

- Creates a pending Postgres parent order.
- Creates child `OrderItem` rows.
- Creates per-vendor `VendorDeliveryFee` rows.
- Creates a pending `VendorOrder` row for the single-vendor MVP order.
- Resolves legacy Mongo IDs from request payloads to PostgreSQL UUIDs internally.
- Validates user, vendor, menu item, portion, stock/availability, vendor ownership, vendor open status, required choice groups, and authoritative delivery fee.
- Recalculates item subtotal, delivery fee, service fee, and total server-side from PostgreSQL data.
- Updates vendor `totalOrders` and `totalSales` inside the same Prisma transaction.
- Uses idempotency key lookup to return an existing Postgres order instead of duplicating it.

Intentionally blocked or deferred:

- Wallet payments are blocked in the Postgres branch until wallet debit writes are migrated.
- Discount codes are blocked in the Postgres branch until discount usage writes are migrated.
- Online Paystack initialization is intentionally skipped in this slice.
- Payment attempts, Paystack webhooks, payment recovery, invoice creation, promo slot claims, queue jobs, and notifications remain later slices.
- Free-delivery promo snapshots are stored as not migrated for this write branch, so sponsored-delivery checkout needs its own payment/promo slice before frontend checkout can rely on Postgres order writes.

Verification:

- `node --check` passed for:
  - `services/postgres/orderCreation.repository.js`
  - `controller/order/createOrderV2.controller.js`
  - `prisma/smoke-order-creation-flow.js`
- `npx prisma validate` passed.
- `npm run prisma:smoke-order-creation-flow` passed in dry-run mode and selected:
  - user `69db650ef5bd111279d9fa5b`
  - vendor `Mj Cuisines`
  - item `Jollof rice`
  - portion `Portion`
  - delivery fee `1000`
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-order-creation-flow` passed, created a pending order, confirmed one item row, one vendor delivery fee row, and one vendor order row, then deleted the order and restored vendor counters.
- Live smoke result:
  - order `ORD-66723D71D47A`
  - `paymentStatus=pending`
  - `orderStatus=pending`
  - `subtotal=60000`
  - `deliveryFee=1000`
  - `serviceFee=500`
  - `total=61500`
- `npm run prisma:check-admin-orders-parity` reports zero diffs.
- `npm run prisma:check-vendor-orders-parity` reports zero diffs.
- Redis/BullMQ can still print local `ECONNREFUSED` noise when Redis is offline.

## Payment Initialization Write Slice

Current route touched:

- `POST /api/orders/v2/create`

Feature flags:

- `DB_ORDER_WRITE_PROVIDER`
- `DB_PAYMENT_WRITE_PROVIDER`

Implementation status:

- Added `usePostgresPaymentWrites()` in `services/postgres/compat.js`.
- Added `services/postgres/payment.repository.js`.
- Updated the guarded Postgres order-create branch in `controller/order/createOrderV2.controller.js` to initialize Paystack when payment writes are enabled.
- Updated `.env.example` with `DB_PAYMENT_WRITE_PROVIDER=mongo`.
- Local `.env` currently enables `DB_PAYMENT_WRITE_PROVIDER=postgres`.
- Added `prisma/smoke-payment-initialization-flow.js`.
- Added npm script `prisma:smoke-payment-initialization-flow`.

Supported behavior:

- Generates Paystack-style references for Postgres-created orders.
- Updates the Postgres `Order.paymentReference`.
- Creates or updates a Postgres `PaymentAttempt`.
- Stores expected amounts in kobo without multiplying by 100 again.
- Records cart/order snapshots and initialization events in `PaymentAttempt.events`.
- Calls Paystack initialize from the HTTP route only after `DB_PAYMENT_WRITE_PROVIDER=postgres`.
- Records provider initialization response as `status=pending` and `recoveryState=awaiting_verification`.
- Records provider initialization failure as `status=failed` and `recoveryState=review`.

Important money-unit note:

- Mongo order totals are naira, so the legacy Paystack path uses `order.total * 100`.
- Postgres order totals are already kobo, so the Postgres Paystack path sends `Math.round(order.total)` directly.
- This avoids charging 100x too much after Postgres order creation.

Deferred behavior:

- Paystack verification and webhook fulfillment are still Mongo-backed and remain the next migration slice.
- Paid-order fulfillment, vendor wallet escrow, invoices, promo claims, cart checkout finalization, and notifications remain later slices.
- Wallet payments and discount codes are still blocked in the Postgres create-order branch.

Verification:

- `node --check` passed for:
  - `services/postgres/payment.repository.js`
  - `controller/order/createOrderV2.controller.js`
  - `prisma/smoke-payment-initialization-flow.js`
- `npx prisma validate` passed.
- `npm run prisma:smoke-payment-initialization-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-payment-initialization-flow` passed, created a temporary order/payment attempt, then deleted/restored all smoke-touched rows.
- Live smoke result:
  - order `ORD-F4C7D94784EE`
  - reference `PSK_ORD-F4C7D94784EE_1780291007417`
  - `total=61500`
  - `PaymentAttempt.status=initialized`
  - `PaymentAttempt.recoveryState=awaiting_verification`
  - `expectedAmount=61500`
  - `expectedAmountKobo=61500`
  - `eventCount=1`
- `npm run prisma:check-finance-payments-parity` reports zero diffs.
- `npm run prisma:check-admin-finance-parity` reports zero diffs.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.
- Redis/BullMQ can still print local `ECONNREFUSED` noise when Redis is offline.

Remaining migration agenda after this slice:

1. Paystack verification, webhook, and payment recovery writes.
2. Paid-order fulfillment writes: vendor orders, admin escrow, service fee revenue, delivery fee revenue.
3. Invoice creation writes.
4. Free-delivery and vendor-sponsored promo claim writes.
5. Checkout cart finalization/cleanup writes.
6. Wallet funding and wallet payment debit writes.
7. Refund/cancellation wallet writes.
8. Withdrawal and transfer writes.
9. Platform config write paths.
10. Final cutover cleanup: remove Mongo branches, remove dual parity scripts, and lock production migration/runbook.

## Payment Verification Provider-Validation Slice

Current routes touched:

- `GET /api/orders/verify/:reference`
- `GET /api/orders/v2/verify/:reference`
- `POST /api/orders/webhook` for `charge.success`

Feature flag:

- `DB_PAYMENT_WRITE_PROVIDER`

Implementation status:

- Extended `services/postgres/payment.repository.js` with:
  - Postgres order lookup by payment reference.
  - Postgres order response shaping.
  - Provider success validation using kobo totals.
  - Failed-payment order transition to `paymentStatus=failed` and `orderStatus=failed`.
  - Payment attempt success/mismatch/failure event recording.
- Added guarded Postgres verification branches in `controller/order/orderController.js`.
- Added guarded Postgres webhook handling for `charge.success`.
- Added `prisma/smoke-payment-verification-flow.js`.
- Added npm script `prisma:smoke-payment-verification-flow`.

Supported behavior:

- If a reference belongs to a Postgres order, verification no longer falls through to Mongo.
- Paystack provider success is validated against the Postgres order total in kobo.
- Mismatched reference, currency, and amount are recorded to Postgres `PaymentAttempt` with `recoveryState=review`.
- Failed provider status records a failed attempt and marks the Postgres order failed.
- Successful provider validation records `PaymentAttempt.status=success`, keeps `recoveryState=awaiting_verification`, and returns a fulfillment-pending response.

Intentionally blocked:

- Successful Postgres verification does not yet mark the order paid or create financial fulfillment.
- Vendor escrow, admin wallet revenue, invoice creation, promo claim writes, cart checkout finalization, queues, and notifications remain the next slices.
- This protects local testing from marking an order paid without the matching financial side effects.

Verification:

- `node --check` passed for:
  - `services/postgres/payment.repository.js`
  - `controller/order/orderController.js`
  - `prisma/smoke-payment-verification-flow.js`
- `npx prisma validate` passed.
- `npm run prisma:smoke-payment-verification-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-payment-verification-flow` passed and restored the temporary order/payment attempt/vendor fixture.
- Live smoke result:
  - `PaymentAttempt.status=success`
  - `PaymentAttempt.recoveryState=awaiting_verification`
  - `providerStatus=success`
  - `paidAmount=61500`
  - `eventCount=2`
- `npm run prisma:check-finance-payments-parity` reports zero diffs.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.

Next migration slice:

- Paid-order fulfillment writes: mark order paid, update vendor order status, create/credit admin escrow wallet transactions, delivery/service fee revenue rows, and keep the operation idempotent.

## Paid-Order Fulfillment Write Slice

Current routes touched:

- `GET /api/orders/verify/:reference`
- `GET /api/orders/v2/verify/:reference`
- `POST /api/orders/webhook` for `charge.success`

Feature flag:

- `DB_PAYMENT_WRITE_PROVIDER`

Implementation status:

- Extended `services/postgres/payment.repository.js` with `fulfillPaidOrder(reference)`.
- Updated the guarded Postgres verification helper in `controller/order/orderController.js` to call fulfillment after successful provider validation.
- Updated the guarded Postgres `charge.success` webhook branch to fulfill the Postgres order after provider validation.
- Added `prisma/smoke-payment-fulfillment-flow.js`.
- Added npm script `prisma:smoke-payment-fulfillment-flow`.

Supported behavior:

- Marks a verified Postgres order as `paymentStatus=paid` and `orderStatus=accepted`.
- Creates or reuses the first admin wallet.
- Credits admin wallet balance for:
  - vendor food escrow as `WalletTransactionType=escrow_hold`
  - delivery fee as `WalletTransactionType=delivery_fee`
  - service fee as `WalletTransactionType=service_fee`
- Records the fulfillment event on `PaymentAttempt`.
- Sets fulfilled attempts to `status=recovered` and `recoveryState=recovered`.
- Keeps the operation idempotent: repeated fulfillment calls on the same reference do not create more credits or transactions.

Deferred behavior:

- Order invoice creation now happens inside this fulfillment transaction.
- Promo claim writes, checkout cart cleanup, queue jobs, and notifications are still deferred.
- Wallet-funded checkout and discount codes are still blocked in the guarded Postgres order-create branch.

Verification:

- `node --check` passed for:
  - `services/postgres/payment.repository.js`
  - `controller/order/orderController.js`
  - `prisma/smoke-payment-fulfillment-flow.js`
- `npx prisma validate` passed.
- `npm run prisma:smoke-payment-fulfillment-flow` passed in dry-run mode.
- `PRISMA_SMOKE_WRITE=1 npm run prisma:smoke-payment-fulfillment-flow` passed and restored the temporary order/payment attempt/wallet/vendor fixture.
- Live smoke result:
  - order moved to `paymentStatus=paid`
  - order moved to `orderStatus=accepted`
  - `creditedKobo=61500`
  - `walletTransactionCount=3`
  - created credit rows for `escrow_hold=60000`, `delivery_fee=1000`, and `service_fee=500`
  - created one `MCO-*` order invoice for `61500` kobo with three invoice lines
  - second fulfillment call returned idempotent with `secondRunCreditedKobo=0`
- `npm run prisma:check-finance-payments-parity` reports zero diffs.
- `npm run prisma:check-admin-orders-parity` reports zero diffs.
- `npm run prisma:check-admin-finance-parity` reports zero diffs.
- Redis/BullMQ can still print local `ECONNREFUSED` noise when Redis is offline.

Next migration slice:

- Free-delivery and vendor-sponsored promo claim writes.
