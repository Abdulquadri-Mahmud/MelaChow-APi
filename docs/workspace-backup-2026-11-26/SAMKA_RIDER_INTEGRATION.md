# MelaChow to Samka Rider integration

## Scope and safety

This work is local on `local/postgres-testing`. Production remains on the existing delivery path because `DELIVERY_PROVIDER` defaults to `melachow`. Set it to `samka` only in an environment prepared for integration testing.

The integration is per `VendorOrder`. A customer order can contain food from several vendors, and every pickup needs an independent Samka delivery job.

## Audited current flow

1. A vendor marks its `VendorOrder` as `ready_for_pickup`.
2. `controller/order/orderController.js` calls the PostgreSQL order repository.
3. The old path calls `offerReadyVendorOrderToAvailableRiders`, creates local `RiderAssignment` rows, and broadcasts to MelaChow riders.
4. A MelaChow rider accepts, picks up, and completes the order through MelaChow rider endpoints.
5. Completion updates the order, credits the local rider wallet, and releases vendor escrow.

When `DELIVERY_PROVIDER=samka`, step 3 now creates a durable `LogisticsDelivery` row. The old rider broadcast is skipped. A background synchronization job submits it to Samka and reconciles status every minute.

## Samka API contract

- Authentication header: `X-Logistics-Source-Key`
- MelaChow source value: `2` (`MelaChow`), not the Swagger sample value `1`
- Create: `POST /api/source-deliveries`
- Read: `GET /api/source-deliveries/{deliveryId}?source=2`
- Cancel: `POST /api/source-deliveries/{deliveryId}/cancel?source=2`
- Samka creation is idempotent by `(source, sourceOrderId)`.
- MelaChow sends its immutable PostgreSQL `VendorOrder.id` as `sourceOrderId`.
- Money sent to Samka is decimal Naira. MelaChow stores money as integer kobo, so it divides by 100.
- `riderCommission` in Samka is deducted from the delivery fee to calculate rider earnings. Its configured meaning must be approved by finance before production.

## Status mapping

| Samka | Value | MelaChow vendor order |
|---|---:|---|
| Pending | 1 | ready_for_pickup |
| SearchingForRider | 2 | ready_for_pickup |
| Assigned | 3 | rider_assigned |
| Accepted | 4 | rider_assigned |
| ArrivedAtPickup | 5 | rider_assigned |
| PickedUp | 6 | out_for_delivery |
| InTransit | 7 | out_for_delivery |
| Delivered | 8 | delivered |
| Cancelled | 9 | retained for operations review |
| Failed | 10 | retained for operations review |

Delivered releases that vendor order's escrow. Samka credits the centralized rider wallet. MelaChow never assigns a Samka rider UUID to its local `riderId` foreign key and never credits a local rider wallet for a Samka delivery.

## Required configuration

```dotenv
DELIVERY_PROVIDER=samka
SAMKA_LOGISTICS_BASE_URL=http://localhost:<samka-api-port>
SAMKA_LOGISTICS_SOURCE_KEY=<same value as SourceProducts:MelaChow:ApiKey in Samka>
SAMKA_LOGISTICS_TIMEOUT_MS=10000
SAMKA_COMMERCIAL_POLICY_VERSION=1
SAMKA_RIDER_COMMISSION_NAIRA=0
SAMKA_REQUIRED_VEHICLE_TYPE=1
```

Both pickup and dropoff must have verified latitude, longitude, and formatted address. Dispatch stays in retry state with an actionable error if either is absent.

## Remaining production gates

1. Add durable outbound webhooks in Samka for assignment, pickup, transit, delivered, cancelled, and failed. Samka currently publishes only in-process integration events and has no registered source-product handlers.
2. Sign callbacks with HMAC, timestamp, event ID, and replay protection. Keep polling as reconciliation after callbacks exist.
3. Add an operations view for pending, retrying, failed, and cancelled external deliveries, plus a manual retry action.
4. Decide cancellation and failed-delivery policy, including food possession, refunds, replacement delivery, and vendor liability.
5. Confirm commercial policy version, fee ownership, and `riderCommission` with finance.
6. Rotate secrets currently stored in Samka tracked configuration and move them to environment or secret storage before deployment.
7. Run staging tests for one vendor, multiple vendors, retry after timeout, duplicate ready updates, rider rejection/reassignment, pickup, completion, insufficient admin wallet, cancellation, and failure.
8. Remove or disable public MelaChow rider routes only after the Samka rollback window closes.

## Local verification completed

- Prisma schema validation passed.
- Migration `20260928120000_add_external_logistics_delivery` applied to local PostgreSQL.
- Prisma client regenerated.
- Modified JavaScript files passed `node --check`.
- MelaChow API restarted and responds `200` on `http://localhost:5000/`.

Full end-to-end delivery testing still requires seeded customer, vendor, menu, paid order, verified pickup/dropoff coordinates, a matching Samka source key, and an eligible online Samka rider.
