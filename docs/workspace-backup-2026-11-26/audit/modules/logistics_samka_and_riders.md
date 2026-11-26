# Module Comprehension: Logistics (SamkaTech Integration & Pickup/Delivery Codes)

**Scope:** `routes/integrations/samkaLogistics.routes.js`, `routes/Admin/samkaLogisticsAdmin.routes.js`, `controller/integrations/samkaLogistics.controller.js`, `controller/Admin/samkaLogisticsAdmin.controller.js`, `services/logistics/samkaLogistics.service.js`, `services/logistics/samkaLogisticsAdmin.service.js`, `services/logistics/pickupCode.service.js`.

---

## File-by-File Summary

### `controller/integrations/samkaLogistics.controller.js` (134 LOC)
- **Purpose:** Receives HMAC-SHA256 signed callbacks and pickup/delivery code requests/validations from SamkaTech Logistics.
- **Security controls (VERIFIED):**
  - `validSignature` (`lines 10-20`): checks `X-Logistics-Timestamp` within ±5 minutes, computes `HMAC-SHA256(secret, "${timestamp}.${raw}")`, compares with `crypto.timingSafeEqual`.
  - `receiveSamkaCallback` (`lines 32-63`): inserts `eventId` into `prisma.logisticsCallbackEvent` first (unique constraint catches replay via `P2002` → `204`), deletes row if processing fails so Samka can retry.
  - `validateSamkaDeliveryCode` (`lines 94-116`) & `validateSamkaPickupCode` (`lines 119-134`): both require signed body; intentionally do not consume code on pre-commit validation (`consume: false`) to allow upstream retries.

### `services/logistics/samkaLogistics.service.js` (511 LOC)
- **Purpose:** Queues, dispatches, reconciles, and cancels external SamkaTech deliveries; maps external statuses (1–10) to MelaChow `VendorOrder`/`Order` statuses and releases vendor escrow on `Delivered` (`8`).
- **Key behaviors & flaws:**
  - `dispatchSamkaDelivery` (`lines 156-210`): uses lease-based `updateMany` claim (`dispatching`, 2-minute lease) + `verifySamkaDeliveryIdentity` post-create check + exponential backoff on failure.
  - `applyExternalStatus` (`lines 222-296`): runs in `Serializable` Prisma transaction; guards against out-of-order stale statuses (`freshDelivery.externalStatus > externalStatus`); releases vendor escrow atomically once (`!current.escrowReleased`).
  - **Gap — `applyTerminalStatus` (`lines 325-349`):** When Samka reports `Cancelled` (`9`) or `Failed` (`10`), MelaChow marks `vendorOrder.orderStatus` and `order.orderStatus` as `cancelled`/`failed`, **but does NOT trigger a customer wallet refund, escrow reversal, or reassignment**. Customer funds remain stranded in `adminWallet` until manually intervened.
  - `request` (`lines 41-64`): uses `AbortController` timeout (`SAMKA_LOGISTICS_TIMEOUT_MS || 10000`).

### `services/logistics/samkaLogisticsAdmin.service.js` (56 LOC) & `controller/Admin/samkaLogisticsAdmin.controller.js` (43 LOC)
- **Purpose:** Server-side proxy for MelaChow admins to manage Samka riders and deliveries without exposing `SAMKA_LOGISTICS_SOURCE_ADMIN_KEY` to browsers.
- **Gaps:**
  - `routes/Admin/samkaLogisticsAdmin.routes.js:6` applies `adminAuth` to all routes (allowing `finance-admin` to approve/reject/suspend riders and cancel/reassign deliveries, and standard `admin` to view rider wallets/withdrawals) without sub-role enforcement.
  - None of the mutating actions (`approveRider`, `rejectRider`, `suspendRider`, `cancelDelivery`, `reassignDelivery`) write a local MelaChow `ActivityLog` entry.

### `services/logistics/pickupCode.service.js` (101 LOC)
- **Purpose:** Issues and verifies 6-digit restaurant pickup codes (`samka_pickup:<vendorOrderId>`) stored in `DeliveryOtpSession`.
- **Controls (VERIFIED):** Verifies vendor ownership (`line 18`), locks `vendor_orders` and `delivery_otp_sessions` rows with `SELECT ... FOR UPDATE` (`lines 19, 86`), generates codes with `crypto.randomInt`, enforces 5-attempt lockout, uses `crypto.timingSafeEqual`, and cross-checks `externalDeliveryId`, `sourceOrderId`, and `sourceOrderReference` against the same delivery (`lines 69-83`).

---

## Comprehension Check (5 Non-Obvious Questions & Verified Answers)

1. **Q: What happens to a customer's payment if a SamkaTech rider cancels or fails a delivery (`status 9` or `10`)?**
   - **A: Nothing is refunded automatically (VERIFIED).** `applyTerminalStatus` (`samkaLogistics.service.js:325-349`) updates `vendorOrder.orderStatus`, `order.orderStatus`, and `logisticsDelivery` to `cancelled`/`failed` and sends notifications, but never credits the customer wallet or invokes refund logic.
2. **Q: Can an attacker replay a captured `delivery.completed` callback from SamkaTech to double-release vendor escrow?**
   - **A: NO (VERIFIED).** Three layers block it: (1) `X-Logistics-Timestamp` must be within ±5 minutes (`samkaLogistics.controller.js:15`), (2) `logisticsCallbackEvent.create({ eventId })` rejects duplicates via unique constraint `P2002` (`lines 41-49`), and (3) `applyExternalStatus` checks `if (!current.escrowReleased)` inside a `Serializable` transaction (`samkaLogistics.service.js:235,292`).
3. **Q: Why does `samkaLogisticsAdmin.controller.js` return `502` instead of `401` when Samka returns HTTP 401?**
   - **A: Intentionally (`lines 18-28`, VERIFIED).** Returning `401` to the browser would trigger the admin frontend's `401` interceptor to refresh/log out the MelaChow admin session, even though the failure is an upstream Samka key/UUID misconfiguration.
4. **Q: Does `validateSamkaPickupCode` prevent a rider from using Order A's pickup code to confirm Order B?**
   - **A: YES (VERIFIED).** `pickupCode.service.js:69-83` requires all supplied identifiers (`externalDeliveryId`, `sourceOrderId`, `sourceOrderReference`) to resolve to the same `LogisticsDelivery` row, and `line 89` verifies `session.payload.sourceOrderId === String(delivery.vendorOrderId)`.
5. **Q: Can a `finance-admin` approve or suspend Samka riders via `/api/admin/logistics/riders/:riderId/approve`?**
   - **A: YES (VERIFIED).** `routes/Admin/samkaLogisticsAdmin.routes.js:6` uses `adminAuth` (which admits `admin`, `super-admin`, and `finance-admin` per `middleware/adminAuth.js:27`) without `standardAdminOnly` or `superAdminOnly`.
