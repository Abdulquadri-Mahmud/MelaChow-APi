# PostgreSQL and Mobile Rollout Checklist

Last updated: 28 September 2026

## Current decisions and local status

- PostgreSQL is the primary database for local development.
- All configured database read and write providers use PostgreSQL.
- MongoDB must not be connected or used for current production-targeted development.
- The local `melachow` database has been reset and contains only one superadmin account.
- Customer and vendor web applications use the local backend at `http://localhost:5000`.
- Live backend URLs have been removed from executable fallbacks in the isolated local testing worktree.
- Customer frontend runs at `http://localhost:3100`.
- Vendor frontend runs at `http://localhost:3102`.
- Backend runs at `http://localhost:5000`.
- Redis runs locally on port `6379`.

## Local superadmin

- Email: `superadmin@local.melachow.test`
- Password: `Test1234!`
- Role: `super-admin`
- Superadmin login requires email OTP after password verification.
- The local `.test` address cannot receive email. A deliverable address must be provided through `LOCAL_SUPERADMIN_EMAIL` before testing admin MFA.

## Google Maps Platform

### API responsibilities

- Places API (New): address autocomplete and Place Details.
- Maps JavaScript API: interactive maps when a visible map is needed.
- Geocoding API: optional address-to-coordinate fallback.
- Routes API: road distance and estimated journey duration.

### Current status

- Google currently rejects Places and Routes requests because the account has not completed its required $30 prepayment and is not active.
- Create separate Google API keys for browser and backend use.
- The browser key should use website/referrer restrictions and only allow required browser APIs.
- The backend key should use server-compatible restrictions and only allow Places API (New), Routes API and Geocoding API.
- Development, staging and production must use separate keys.
- Real keys must not be stored in `.env.example` or committed to source control.
- Previously exposed keys should be rotated.

## PostGIS and distance calculations

### Current status

- PostgreSQL is installed and active locally.
- PostGIS is not currently installed in the local PostgreSQL server.
- The migration detects PostGIS and creates geography columns and GiST indexes when the extension is available.
- Haversine straight-line distance is the active geographic fallback.
- Google Routes is configured as the preferred checkout road-distance provider but cannot work until the Google account is active.
- A flat fee is used when valid coordinates are unavailable.

### PostGIS requirements

- Install the PostGIS package that matches the PostgreSQL server version.
- Enable it separately in each applicable database:

```sql
CREATE EXTENSION postgis;
```

- Confirm that the selected local, staging and production PostgreSQL providers support PostGIS.
- After enabling PostGIS, ensure migrations create:
  - `user_addresses.location`
  - `vendors.pickup_location`
  - Geography GiST indexes for both columns
- Verify `ST_Distance` calculations against known coordinates.

### Default distance pricing

- Base delivery fee: ₦400
- Included distance: 1 km
- Additional fee: ₦150 per km
- Distance rounding: nearest 0.5 km
- Minimum fee: ₦400
- Maximum fee: ₦5,000
- Default maximum delivery distance: 20 km

### Distance selection order

1. At checkout, try Google Routes for road distance when enabled and available.
2. Use PostGIS geographic distance when geography points and PostGIS are available.
3. Use the Haversine calculation when PostGIS or its geography points are unavailable.
4. Use the configured flat fee only for controlled operational fallback.

Missing customer coordinates should trigger address confirmation instead of silently charging the flat fee.

## Existing-customer address verification

After MongoDB data is migrated to PostgreSQL, existing customer addresses may not contain Google coordinates.

### Login behavior

1. After successful login, the backend checks whether the customer has a default address containing:
   - Google place ID
   - Latitude
   - Longitude
   - Formatted address
   - Verification timestamp
2. The backend returns an explicit field such as:

```json
{
  "requiresAddressVerification": true
}
```

3. When verification is required, the mobile app opens the address confirmation flow.
4. The customer searches with Google Places autocomplete.
5. The app retrieves Place Details for the selected result.
6. The app sends the place ID, formatted address, address components and coordinates to the backend.
7. PostgreSQL stores the confirmed address and verification timestamp.
8. The prompt stops appearing after a verified address has been saved.

### Checkout behavior

- Customers may browse before confirming an address.
- A verified address should be required before delivery quotes or checkout.
- Checkout must stop if the selected address has no valid coordinates.
- The customer must be sent into address confirmation and returned to checkout afterward.
- Delivery availability, distance and price must be recalculated after confirmation.
- Browser/device geolocation may be offered as an additional option, but current location may differ from the requested delivery address.
- Google Places selection remains the primary address-confirmation method.
- Decide whether all saved addresses must be verified or only the selected/default address.
- Existing vendors also need a process to confirm missing pickup coordinates.

## Mobile application environment configuration

Mobile builds require separate environment settings for:

- Local development
- Staging
- Production

### Physical-device testing

`localhost` on a physical phone points to the phone, not the development computer.

The development computer's LAN address at the time of this document was:

```text
10.110.243.204
```

A physical-device development build should use values similar to:

```env
API_URL=http://10.110.243.204:5000
SOCKET_URL=http://10.110.243.204:5000
```

- The phone and computer must be on the same network.
- Windows Firewall must allow the backend port.
- The LAN address may change and must not be compiled into staging or production builds.
- Android emulator networking may use `10.0.2.2` to access the host machine.
- Production builds must never contain localhost, LAN or staging addresses.

## PostgreSQL production environment

- Select the production PostgreSQL provider.
- Confirm PostGIS support.
- Use separate staging and production databases and credentials.
- Enable SSL connections.
- Configure connection pooling and connection limits.
- Enable automated backups.
- Enable point-in-time recovery where available.
- Define database retention and restore procedures.
- Test restoring a production-sized backup before launch.

## Migration verification

Create a reconciliation report after migrating MongoDB data to PostgreSQL.

Verify:

- Customer count
- Vendor count
- Rider count
- Admin count
- Order and order-item counts
- Wallet balances and transaction totals
- Vendor menus, sections, portions, choices and inventory
- Reviews
- Discounts and promotions
- Address conversion results
- Missing or malformed relationships
- Duplicate email addresses and phone numbers
- Money conversion accuracy between naira and kobo
- Legacy IDs required by existing clients or external references

MongoDB should be read-only during final verification and cutover. Prevent simultaneous writes from splitting data between MongoDB and PostgreSQL.

## Rollback strategy

- Define measurable rollback triggers.
- Decide how long the MongoDB snapshot remains available.
- Prevent writes to the old database after cutover.
- Prepare PostgreSQL database restore commands.
- Document which services must be stopped during rollback.
- Test rollback in staging.
- Reconcile orders and payments created during the cutover window.

## Authentication lifecycle

Test on mobile devices:

- Customer registration
- Vendor registration
- OTP delivery and expiry
- Login and logout
- Access-token refresh
- Password reset
- Account suspension and reactivation
- Multiple devices
- Expired sessions
- Application reinstall
- Secure token storage on Android and iOS
- Superadmin password and email OTP authentication

## Mobile permissions

Define when and why the application requests:

- Location
- Notifications
- Camera
- Photo library
- Background location if rider tracking later requires it

Every denied permission must have a usable explanation and fallback.

## Offline and unstable-network behavior

Test connection loss during:

- Address selection
- Cart changes
- Checkout
- Payment verification
- Vendor order acceptance
- Order status updates

Requests that modify orders, payments, wallets or inventory need idempotency keys so retries cannot create duplicate effects.

## Payment recovery

Handle and test:

- Payment succeeds but the app closes.
- Payment succeeds after the frontend times out.
- A webhook is delivered multiple times.
- The customer retries checkout.
- Payment succeeds but order creation fails.
- Refund processing fails midway.
- Webhook delivery is delayed or arrives out of order.

Backend payment verification and signed webhooks must determine payment truth.

## Inventory concurrency

- Prevent two customers from buying the same final unit.
- Use transactional stock reservations.
- Expire abandoned reservations.
- Restore stock after cancellation or failed payment.
- Verify choices and add-on inventory as well as menu-item inventory.
- Make stock release operations idempotent.

## Delivery pricing verification

Test:

- PostGIS distance
- Google Routes road distance
- Haversine fallback
- Maximum delivery radius
- Distance rounding
- Vendor-managed delivery
- Platform-managed delivery
- Promotional free delivery
- Missing customer coordinates
- Missing vendor coordinates
- Google Routes outage
- PostGIS outage or missing geography point
- Minimum and maximum fee boundaries

Every order must retain its pricing snapshot so historical fees do not change when the global configuration changes.

## Background workers and Redis

Confirm:

- Which production process runs queue workers.
- Jobs survive process restarts.
- Redis persistence is configured appropriately.
- Failed jobs retry with controlled backoff.
- Dead-letter or permanently failed jobs are visible to operators.
- Duplicate jobs cannot duplicate payouts, emails, cancellations or stock changes.
- Order timeout, payout, email and notification workers use PostgreSQL.

## Monitoring and alerts

Monitor:

- API availability and response times
- PostgreSQL health, connection usage and slow queries
- Redis availability
- Queue delays and worker failures
- Google Places and Routes errors
- Payment webhook failures
- Order-state transition failures
- Login and OTP failures
- Address verification completion rate
- Delivery quote failures and flat-fee fallbacks

Create actionable alerts for failures affecting orders, payments, wallets, inventory or delivery pricing.

## Security and secrets

- Remove real credentials from example environment files.
- Rotate exposed credentials.
- Keep local, staging and production secrets separate.
- Restrict API keys by API and application type.
- Apply least-privilege PostgreSQL credentials.
- Do not expose database or backend secrets in mobile application bundles.
- Review CORS allowlists for each environment.
- Rate-limit authentication, address search and payment endpoints appropriately.

## Privacy and application-store requirements

Prepare:

- Privacy policy
- Account deletion flow
- Data-retention policy
- Location-data explanation
- Notification consent explanation
- Google Play Data Safety submission
- Apple privacy declarations if an iOS application is planned

## Recommended delivery order

1. Provision staging PostgreSQL with PostGIS.
2. Activate Google Maps billing and configure separate browser and backend keys.
3. Implement migrated-customer address verification.
4. Implement checkout blocking for unverified delivery coordinates.
5. Complete migration reconciliation.
6. Test authentication, ordering, payment and cancellation end to end.
7. Test physical-device networking, permissions and unstable connections.
8. Test backups and rollback.
9. Run a controlled staging migration.
10. Perform production cutover with monitoring and final reconciliation.

