# Database Migration And Transaction Hardening Notes

Date: 2026-05-07

## MongoDB To PostgreSQL Discussion

Moving from MongoDB to PostgreSQL can be a good long-term decision for MelaChow, but it should not be treated as a small refactor. PostgreSQL would give stronger guarantees around orders, payments, refunds, wallet balances, commissions, coupons, vendor availability, and reconciliation. Those are relational and money-sensitive flows where transactions, constraints, and reporting matter a lot.

MongoDB is not automatically wrong for the current platform. If the current system is stable, the better business move before launch may be to keep MongoDB, harden the important flows, and only migrate once production usage exposes reporting, finance, reconciliation, or consistency pain.

## Where PostgreSQL Would Help

- Orders, payments, refunds, wallet ledger, commissions, and payouts.
- Preventing inconsistent states with database transactions.
- Easier finance reports and admin analytics.
- Stronger schema validation at the database level.
- Better audit trails and reconciliation queries.
- Cleaner relationships between users, vendors, riders, orders, order items, coupons, and transactions.

## Where Migration Gets Expensive

- Existing Mongoose models must be redesigned as relational tables.
- Controllers and services need rewriting.
- Data migration scripts must map embedded Mongo documents into tables.
- Order and payment flows need careful testing.
- Admin, vendor, customer, and rider APIs may need response compatibility layers so existing frontends do not break.
- Production migration needs rollback planning.

## Realistic Timeline

For this platform, assuming one strong full-stack/backend engineer:

- Audit and schema design: 1-2 weeks.
- PostgreSQL models and ORM setup: 1 week.
- Rewrite core backend flows: 3-5 weeks.
- Data migration scripts: 1-2 weeks.
- Testing and bug fixing: 2-3 weeks.
- Deployment, rollback, and monitoring: 1 week.

Estimated full migration timeline: 8-12 weeks.

A phased hybrid approach, where only critical finance/order tables move first while menus, reviews, settings, and low-risk content remain in MongoDB temporarily, could take 3-5 weeks for phase one.

## Recommendation

Do not migrate before launch unless MongoDB is actively blocking the business. Launch with MongoDB, strengthen transactions and validation around payments and orders, then plan PostgreSQL as a post-launch architecture upgrade.

## Transaction And Validation Hardening Direction

The immediate priority is to make payment/order creation idempotent, verifiable, recoverable, and auditable. The platform should never depend only on the customer staying on the verify-payment page.

Recommended hardening:

- Treat the payment provider reference as the source of truth for payment confirmation.
- Make checkout/order creation idempotent by enforcing one successful order per payment reference.
- Store pending payment attempts before redirecting or verifying payment.
- Reconcile abandoned or incomplete payment references from backend/admin flows.
- Use MongoDB sessions/transactions for order, vendor order, coupon usage, wallet ledger, stock decrement, and payment record writes where the deployment supports replica sets.
- Add strict backend validation for restaurant open status, cart vendor consistency, item availability, coupon eligibility, totals, service fees, delivery fees, and paid amount.
- Never trust frontend totals. The backend should recompute every payable amount.
- Add admin payment recovery tooling for paid-but-not-ordered cases.
- Add audit events for every major payment/order transition.

## Implementation Added

Implemented on 2026-05-07:

- Added a `PaymentAttempt` collection for Paystack references, expected amount, paid amount, provider status, recovery state, and event history.
- Created a payment hardening service that verifies Paystack references and blocks fulfillment when provider amount/reference does not match the backend order.
- The V2 order create endpoint now records a payment attempt before redirecting customers to Paystack.
- Customer verification and Paystack webhook processing now validate the successful provider payment against the backend-calculated order total before creating vendor orders.
- Admin payment recovery now records missing-order references, amount mismatches, failed provider payments, and recovery events.
- The admin payment recovery page now shows expected amount, provider-paid amount, attempt status, and latest recovery event.
