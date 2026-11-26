# SamkaTech Logistics integration audit for MelaChow

Date: 1 October 2026

## Sources reviewed

- Local Samka Rider and Samka Admin frontends.
- Shifa backend origin/mobile-app branch.
- Current MelaChow staging logistics adapter and PostgreSQL models.
- Live SamkaTech Swagger at https://samkatechlogistics.runasp.net/swagger/v1/swagger.json.

The requested local SamkaTech.Logistics folder and FRONTEND_INTEGRATION_GUIDE.md were not present under AdeyemiCode. The live Swagger contract and Samka Rider documentation were used to validate the missing guide. Restore the backend repository later if its internal key provisioning and callback registration also need review.

## Recommended boundary

MelaChow apps -> MelaChow API -> SamkaTech Logistics -> Samka Rider.

SamkaTech may send signed callbacks to the MelaChow API. Source keys, source-admin keys, and callback secrets must remain in backend deployment secrets. They must never enter browser, Capacitor, or Tauri bundles.

Samka Rider already calls SamkaTech directly for identity, verification, availability, offers, delivery actions, wallet, and location. MelaChow should create and observe source deliveries without duplicating those rider systems.

## Existing MelaChow implementation

services/logistics/samkaLogistics.service.js and the PostgreSQL LogisticsDelivery model already provide:

1. An idempotent local handoff when a vendor order reaches ready_for_pickup.
2. POST /api/source-deliveries dispatch.
3. Durable retry with bounded backoff.
4. GET /api/source-deliveries/{id} reconciliation.
5. Vendor-order and parent-order state mapping.
6. Transactional vendor escrow release on delivery.
7. External ID, attempt, payload, error, and synchronization audit data.

Current variables:

    DELIVERY_PROVIDER=samka
    SAMKA_LOGISTICS_BASE_URL=https://samkatechlogistics.runasp.net
    SAMKA_LOGISTICS_SOURCE_KEY=<server-only>
    SAMKA_LOGISTICS_TIMEOUT_MS=10000
    SAMKA_COMMERCIAL_POLICY_VERSION=1
    SAMKA_RIDER_COMMISSION_NAIRA=<amount>
    SAMKA_REQUIRED_VEHICLE_TYPE=1

The durable handoff is a strong foundation because upstream downtime cannot silently lose an order.

## Source delivery API

All calls use X-Logistics-Source-Key from the MelaChow backend.

- POST /api/source-deliveries
- GET /api/source-deliveries/{id}?source=MelaChow
- GET /api/source-deliveries/{id}/details?source=MelaChow
- POST /api/source-deliveries/{id}/cancel?source=MelaChow

Create fields are: source, sourceOrderId, sourceOrderReference, pickup, dropoff, requiredVehicleType, estimatedDistance, estimatedFee, commercialPolicyVersion, riderCommission, currency, pickupContactPhone, and dropoffContactPhone.

Use the vendor-order UUID as sourceOrderId because one customer order can contain several restaurants. Pickup and dropoff require verified latitude, longitude, address, and city. Amounts are NGN decimal values.

Swagger documents named enums such as MelaChow and Motorcycle. MelaChow currently sends numeric values 2 and 1. Change to enum names so enum reordering cannot alter their meaning.

The details endpoint returns assigned-rider information. MelaChow currently polls only status, so customer tracking lacks the rider snapshot. Cancellation takes a JSON reason string; MelaChow currently lacks a complete outbound cancellation flow.

## Rider endpoints

These use a rider bearer token and belong to Samka Rider.

Authentication:
- POST /api/rider-auth/register
- POST /api/rider-auth/login
- POST /api/rider-auth/verify-email
- POST /api/rider-auth/resend-email-verification
- POST /api/rider-auth/password-reset/request
- POST /api/rider-auth/password-reset/confirm
- GET /api/rider-auth/banks
- POST /api/rider-auth/bank-account/resolve

Profile and availability:
- GET /api/riders/home
- GET and PUT /api/riders/me
- PUT /api/riders/vehicle
- PUT /api/riders/online
- PUT /api/riders/offline
- PUT /api/riders/location
- POST /api/riders/push-tokens
- DELETE /api/riders/push-tokens/{token}

Delivery flow:
- GET /api/riders/offers
- GET /api/riders/me/deliveries
- GET /api/riders/me/deliveries/active
- GET /api/riders/me/deliveries/{deliveryId}
- POST .../offers/{offerId}/accept
- POST .../offers/{offerId}/reject
- POST .../arrive-pickup
- POST .../confirm-pickup
- POST .../start-delivery
- POST .../complete
- POST .../fail

Wallet:
- GET /api/wallet
- GET /api/wallet/earnings
- GET /api/wallet/ledger
- GET /api/wallet/withdrawals
- POST /api/wallet/withdrawals

The rider frontend correctly permits an unapproved rider to sign in and see the dashboard while blocking online state and offers until approval. Going online requires fresh coordinates. SignalR hub /hubs/riders provides invalidation events; REST remains authoritative with a 30-second polling fallback.

## Admin boundaries

Samka global admin uses /api/admin/* and a Samka admin login. This is for Samka operations staff. MelaChow administrators should not store or use that global account.

Shifa demonstrates the correct source-scoped pattern. Its backend adds:

    X-Logistics-Source-Admin-Key: <server-only admin key>
    X-Source-Admin-Id: <authenticated MelaChow admin UUID>

Verified source-admin routes include rider listing/detail, deliveries, wallet, ledger, withdrawals, approve, reject, suspend, and delivery detail/cancel/reassign under /api/source-admin/* with source=MelaChow.

MelaChow should expose its own authenticated /api/admin/logistics/* proxy. The browser sends only its MelaChow admin JWT. The backend validates the admin, forwards the admin UUID, and injects the private Samka key.

## Shifa reference implementation

Shifa origin/mobile-app provides useful patterns:

1. LogisticsDeliveryService owns creation, cancellation, and assigned-rider lookup.
2. LogisticsAdminClient uses a separate admin key and forwards the source admin ID.
3. Application interfaces isolate domain code from HTTP.
4. Typed HTTP clients use a 15-second timeout.
5. Delivery creation occurs when an order becomes ready.
6. A saved local ready state remains retryable after remote failure.
7. Callbacks use HMAC-SHA256 over timestamp plus the exact raw payload.
8. Timestamps older than five minutes are rejected.
9. Signature comparison is constant-time.
10. Assignment, completion, cancellation, and location callbacks become internal events.
11. Completion settlement is idempotent.
12. Admin integration remains server-side.

## Callbacks MelaChow should add

Recommended route:

    POST /api/integrations/logistics/callbacks
    X-Logistics-Timestamp: <Unix seconds>
    X-Logistics-Signature: <lowercase HMAC-SHA256 hex>

Sign the exact string: timestamp.rawRequestBody.

Events observed in Shifa:
- delivery.rider.assigned
- delivery.completed
- delivery.cancelled
- delivery.rider.location.updated

Store callback eventId under a unique constraint before processing. This prevents replay in addition to the five-minute timestamp window. Update delivery, vendor order, parent order, tracking, notifications, and settlement atomically where possible. Keep polling as reconciliation if callbacks are missed.

## Secret findings

Required backend-only values:

    SAMKA_LOGISTICS_SOURCE_KEY
    SAMKA_LOGISTICS_SOURCE_ADMIN_KEY
    SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET

Security findings:

- Shifa origin/mobile-app contains nonempty source and source-admin values in tracked appsettings. Treat them as exposed, rotate them, remove them from tracked configuration and Git history where practical, and use the deployment secret manager.
- Samka Admin's example environment contains a real-looking admin login. Rotate it and replace it with placeholders.
- Actual values are intentionally omitted here.
- Never use NEXT_PUBLIC variables for these values.
- Enforce MelaChow admin authorization before source-admin calls.
- Do not log keys, signatures, raw callbacks, bank data, phone numbers, or full upstream error bodies.

## MelaChow gaps

1. No signed callback route or replay-safe event table.
2. No source-admin proxy.
3. No assigned-rider lookup through /details.
4. No complete outbound external cancellation.
5. Numeric enums instead of documented names.
6. Polling delays assignment and location updates.
7. Rider location is not forwarded to customer tracking.
8. Failure/cancellation needs explicit refund, reassignment, and notification rules.
9. No contract tests for representative Swagger shapes.
10. Upstream errors need personal-data sanitization.

## Implementation plan

Phase 1:
- Send named source and vehicle enums.
- Add cancelSamkaDelivery().
- Add getSamkaDeliveryDetails() and store a sanitized rider snapshot.
- Keep durable retry and reconciliation.
- Test idempotency, retry, state mapping, cancellation, and settlement.

Phase 2:
- Configure callback signing and exact raw-body capture.
- Validate timestamp and HMAC.
- Store event IDs uniquely.
- Process assignment, completion, cancellation, and location.
- Broadcast through existing sockets and notifications.

Phase 3:
- Add server-only samkaLogisticsAdmin.service.js.
- Add /api/admin/logistics/* routes.
- Forward the authenticated MelaChow admin UUID.
- Normalize Samka enum and monetary responses.
- Audit approve, reject, suspend, cancel, and reassign actions.

Phase 4:
- Return rider name, phone, image, vehicle, and delivery state.
- Broadcast signed location events to the customer order room.
- Throttle persistence and broadcasts.
- Retain REST polling as fallback.

## Acceptance checklist

- A ready vendor order creates exactly one Samka delivery.
- Verified pickup and dropoff coordinates are required.
- An approved online rider can receive and accept the offer.
- MelaChow stores and exposes a sanitized rider snapshot.
- Pickup and transit update the correct vendor and parent order.
- Delivery releases escrow exactly once.
- Cancellation reaches SamkaTech and follows refund policy.
- Callback replay cannot duplicate settlement or notifications.
- Polling reconciles missed callbacks.
- MelaChow admins use source-scoped operations without browser secrets.
- Unapproved riders can sign in but cannot go online or receive offers.
- Keys exist only in backend deployment secrets.

## Immediate action

Rotate the exposed Shifa logistics keys and committed Samka Admin login first. Then add signed callbacks and assigned-rider detail lookup to MelaChow while retaining polling as recovery.

## Integration implementation status (2026-10-02)

Implemented in the MelaChow API staging worktree:

- `POST /api/source-deliveries` is now queued durably when a vendor order reaches ready-for-pickup and dispatched immediately; the existing worker retries failures.
- `GET /api/source-deliveries/{id}` reconciles delivery state; `GET /api/source-deliveries/{id}/details` refreshes rider details; `POST /api/source-deliveries/{id}/cancel` handles cancellations.
- Signed, replay-deduplicated callback routes are mounted at `/api/integrations/logistics/callbacks` .
- Source-admin proxies cover list/get rider, rider deliveries, wallet, ledger, withdrawals, approve/reject/suspend, and delivery get/cancel/reassign.
- Admin screens exist at `/admin/logistics/riders`, `/admin/logistics/riders/{riderId}`, and `/admin/logistics/deliveries/{deliveryId}`.
- Customer tracking consumes the Samka rider snapshot and location callbacks, with REST polling fallback.
- Samka Rider acceptance navigates to a working ongoing-delivery page. Delivery history and detail pages now call the rider deliveries endpoints.

The callback and source key values are stored outside source control in the ignored `.env.samkatech.local` file in the API staging repository. The colleague handoff is in `SAMKATECH_STAGING_HANDOFF.md` and contains variable names and routes, not key values.

## Deployment gates still required

- Configure matching secrets and agreed commercial settings in both staging services using the private handoff process.
- Apply migration `20261001230000_add_samka_callbacks_and_rider_tracking` to staging PostgreSQL before deploying the updated API.
- The SamkaTech developer must configure source keys, callback signing, callback delivery events to match the handoff contract.
- End-to-end delivery acceptance, pickup and delivery-code verification in SamkaTech, cancellation, completion, and escrow release still require both staging services and test accounts. Static validation cannot prove those remote services are configured.

Do not use the previously exposed Shifa/Samka credentials from the audit findings; rotate them independently.


## Pickup and delivery-code ownership correction (2026-10-02)

The MelaChow POST /api/integrations/logistics/deliveries/validate-pickup route was removed. It incorrectly passed a restaurant pickup code to MelaChow's customer delivery-OTP checker. SamkaTech must validate its pickup and customer delivery-completion codes in its own Logistics API. The local SamkaTech Logistics backend repository was not present during this integration; only the Rider frontend and Samka Admin frontend were available. The Rider app currently calls Samka's confirm-pickup and complete operations, but the live API contract reviewed earlier did not show customer delivery-code verification on completion. Implement that validation in the SamkaTech Logistics backend when that repository is available.

