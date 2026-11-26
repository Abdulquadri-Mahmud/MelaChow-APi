# SamkaTech staging handoff

## Secret configuration

The three generated secrets are stored locally in the ignored file `.env.samkatech.local` in the MelaChow API staging repository. Copy the values into the matching Render staging environment variables and share the matching secret values with the SamkaTech backend developer through a private secret manager or other private channel. Do not commit or paste their values into chat.

Configure these variables on the MelaChow API staging service:

- `SAMKA_LOGISTICS_SOURCE_KEY`: MelaChow-to-Samka delivery API authentication.
- `SAMKA_LOGISTICS_SOURCE_ADMIN_KEY`: MelaChow admin proxy authentication at SamkaTech.
- `SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET`: signature verification for SamkaTech callbacks.

The SamkaTech service needs the callback signing secret and MelaChow API callback URL below. It also needs to accept `source=MelaChow` and the source key header `X-Logistics-Source-Key` for source delivery create, detail, and cancel operations.

## MelaChow callback URL

Replace the host with the deployed MelaChow staging API host:

- Callback receiver: `POST /api/integrations/logistics/callbacks`

Requests use JSON. Sign the exact raw JSON body with HMAC-SHA256 over `${unixTimestamp}.${rawBody}`. Send `X-Logistics-Timestamp` (Unix seconds) and `X-Logistics-Signature` (hex digest). Timestamps older than five minutes are rejected.

Callback event types handled:

- `delivery.rider.assigned`
- `delivery.rider.location.updated`
- `delivery.completed`
- `delivery.cancelled`
- `delivery.failed`

Each callback must include a unique `eventId` for retry deduplication, and either the Samka delivery ID or MelaChow `sourceOrderId`. Rider location data uses numeric `latitude` and `longitude`.

SamkaTech should own validation for its rider pickup and delivery-completion codes. The current MelaChow integration does not provide a pickup-code validation route; the earlier draft would have incorrectly checked a customer delivery OTP as a restaurant pickup code.

## Required staging values

MelaChow API staging must also have:

- `DELIVERY_PROVIDER=samka`
- `SAMKA_LOGISTICS_BASE_URL` set to the SamkaTech API host
- `SAMKA_LOGISTICS_TIMEOUT_MS` set to an appropriate request timeout
- `SAMKA_REQUIRED_VEHICLE_TYPE=Motorcycle` unless the Samka API contract specifies a different enum string
- `SAMKA_RIDER_COMMISSION_NAIRA` and `SAMKA_COMMERCIAL_POLICY_VERSION` set to the agreed commercial terms

After deploying, run the Prisma migration `20261001230000_add_samka_callbacks_and_rider_tracking` before enabling Samka dispatch. The vendor order transition to ready queues a durable delivery and attempts immediate dispatch; the background worker retries transient failures.


