# Module Comprehension: Payments, Orders & Escrow

**Scope:** `routes/order/orderRoutes.js`, `routes/transaction/transaction.routes.js`, `routes/payment/payment.routes.js`, `routes/paystack/webhook.js`, `controller/order/orderController.js`, `controller/order/createOrderV2.controller.js`, `controller/transaction/transaction.controller.js`, `services/paymentHardening.service.js`, `services/postgres/payment.repository.js`, `services/refund.service.js`, `services/supportRefundSettlement.service.js`, `utils/moneyContract.js`, `utils/paystackFees.js`.

---

## File-by-File Summary

### `controller/order/orderController.js` (2,596 LOC)
- **Purpose:** Handles legacy V1 order creation, V1 & V2 Paystack payment verification (`verifyPayment`, `verifyPaymentV2`), Paystack webhook processing (`paystackWebhook`), customer order reads/cancellation (`getSingleOrder`, `getUserOrders`, `cancelOrder`), and vendor order status transitions (`updateVendorOrderStatus`, `completeVendorOrder`).
- **Key behaviors & flaws:**
  - `paystackWebhook` (`lines 2273-2498`): verifies `x-paystack-signature` using HMAC-SHA512 over raw body (`Buffer.isBuffer(req.body)`), **but uses non-constant-time `!==`** (`line 2287`). Routes `transfer.{success,failed,reversed}` to `applyTransferOutcome` and `charge.success` to Postgres (`postgresPaymentRepository`) or Mongo (`Order` / legacy `PendingOrder`).
  - `verifyPayment` (`lines 967-1170`), `verifyPaymentV2` (`lines 1171-1366`), and `handlePostgresPaymentVerification` (`lines 67-172`): **IDOR — none of these verify that `order.userId === req.userId`**. Any authenticated customer can pass another customer's payment reference and retrieve the full order object (including delivery address, phone, items) or trigger status updates.
  - `cancelOrder` (`lines 2507-2596`): properly checks `{ _id: orderId, userId }` and restricts cancellation to `orderStatus === 'pending'`.
  - No `timeout` configured on any Paystack `axios.get` call (`lines 82, 1048, 1251`).

### `controller/order/createOrderV2.controller.js` (2,472 LOC)
- **Purpose:** V2 order creation (Mongo & Postgres), Paystack payment initialization, atomic post-payment fulfillment (`updateOrderAfterPayment`), vendor escrow creation & release (`releaseEscrowToVendor`), and mobile deep-link payment return (`returnToCustomerMobilePayment`).
- **Key behaviors & flaws:**
  - `updateOrderAfterPayment` (`lines 2051-2217`): uses atomic `Order.findOneAndUpdate` with `paymentStatus: { $nin: ["paid", "failed", "refunded"] }` inside a Mongoose transaction — prevents double fulfillment in Mongo.
  - `releaseEscrowToVendor` (`lines 1958-2042`): Mongoose-only transaction (no Postgres branch), even though `workers/index.js:22` invokes it from the `escrow-release` BullMQ worker.
  - `createOrderController` (`lines 2224-2471`): in Postgres mode, supports `useWallet` via `postgresPaymentRepository.fulfillPaidOrder(reference, { walletPayment: true })` and Paystack init via `axios.post` (no timeout).
  - `returnToCustomerMobilePayment` (`lines 53-57`): redirects to `melachow://app/verify-payment?reference=...` with `encodeURIComponent`.

### `services/postgres/payment.repository.js` (862 LOC)
- **Purpose:** PostgreSQL payment attempt audit log, Paystack amount/currency/fee validation, webhook deduplication, and atomic order fulfillment (`fulfillPaidOrder`).
- **Key behaviors:**
  - `fulfillPaidOrder` (`lines 615-780+`): runs inside `prisma.$transaction`, uses conditional `tx.order.updateMany({ where: { id, paymentStatus: { notIn: ["paid","failed","refunded"] } } })` for idempotency, and conditional `tx.wallet.updateMany({ where: { id, balance: { gte: order.total } }, data: { balance: { decrement: order.total } } })` for atomic wallet debit — prevents negative balances and double debits.
  - All money stored as integer **kobo** (`BigInt` / `Int`), converted to naira at API boundaries via `utils/moneyContract.js`.

### `controller/transaction/transaction.controller.js` (226 LOC)
- **Purpose:** Legacy `/api/transactions` endpoints (`initialize`, `verify`, `webhook`).
- **Key behaviors & flaws:**
  - `handlePaystackWebhook` (`lines 144-148`): immediately returns `410 Gone` (lines 150-225 are dead code).
  - `initializePayment` (`lines 12-69`): **still live** (`POST /api/transactions/initialize`), accepts arbitrary client-supplied `amount` and `orderId` without validating order ownership or server-side order total, and calls Paystack without timeout.

### `services/refund.service.js` (202 LOC) & `services/supportRefundSettlement.service.js` (114 LOC)
- **Purpose:** Customer wallet refunds on order cancellation/timeout (`refundOrderToWallet`, `refundVendorOrderToWallet`) and admin support-ticket dispute settlements (`settleSupportRefund`).
- **Key flaws:**
  - `refund.service.js:25`: `Refund.findOne({ orderId })` idempotency check runs outside the Mongoose transaction; relies on schema uniqueness of `orderId` on `Refund` (unverified unless indexed unique).
  - `refund.service.js:66-74`: if `adminWallet.balance < refundAmount`, cancels the order and sets `order.paymentStatus = 'refunded'` WITHOUT crediting the customer's wallet (records `status: 'pending_wallet'`).
  - `supportRefundSettlement.service.js:50-96`: **Accounting bug (Mongo path)** — when vendor or rider liability is recovered from their wallet (`lines 72, 82`), `adminWallet` is still debited for the full `amount` (`line 91`) without crediting `adminWallet` back for the recovered vendor/rider share. Money is debited twice from platform/partner wallets for a single customer credit.

### `utils/moneyContract.js` (56 LOC) & `utils/paystackFees.js` (95 LOC)
- **Purpose:** Converts Postgres kobo integers to naira for API responses using regex field matching (`moneyResponseToNaira`), and computes Paystack NGN transfer fees + stamp duty (`calculatePaystackTransferFee`, `computeActorPayout`).
- **Risk:** `moneyContract.js:31-47` converts any numeric field matching `/(amount|balance|subtotal|price|...|fee|...)/i` by `/ 100`. Any future field accidentally matching that regex (and not ending in `kobo` or `nonMoneyFieldPattern`) will be silently divided by 100.

---

## Comprehension Check (5 Non-Obvious Questions & Verified Answers)

1. **Q: Can Customer A inspect Customer B's order details or force-fail Customer B's pending order using only `POST /api/orders/v2/verify/:reference`?**
   - **A: YES (VERIFIED).** `routes/order/orderRoutes.js:40` attaches `auth`, but `verifyPaymentV2` (`orderController.js:1171-1366`), `verifyPayment` (`orderController.js:967-1058`), and `handlePostgresPaymentVerification` (`orderController.js:67-172`) all look up the order by `paymentReference` alone without checking `order.userId === req.userId`, returning the full `order` object in the response.
2. **Q: Is `POST /api/transactions/webhook` exploitable because `index.js` doesn't exempt it from `express.json`?**
   - **A: NO (VERIFIED).** Although `routes/transaction/transaction.routes.js:20` still mounts `handlePaystackWebhook`, the first statement in `controller/transaction/transaction.controller.js:145-148` unconditionally returns `410 Gone`.
3. **Q: In PostgreSQL mode, can two concurrent `useWallet: true` order requests overdraw a customer's wallet?**
   - **A: NO (VERIFIED).** `services/postgres/payment.repository.js:707-710` performs an atomic conditional `tx.wallet.updateMany({ where: { id: customerWallet.id, balance: { gte: order.total } }, data: { balance: { decrement: order.total } } })` inside `prisma.$transaction` and throws if `count !== 1`.
4. **Q: What happens to `adminWallet.balance` in MongoDB when an admin settles a ₦10,000 support refund with 100% vendor wallet liability?**
   - **A: Both the vendor wallet AND the admin wallet are debited ₦10,000 (VERIFIED).** `supportRefundSettlement.service.js:72` debits the vendor wallet by `remaining` (₦10,000), and line `91` unconditionally debits `adminWallet` by full `amount` (₦10,000) without crediting `adminWallet` for the vendor recovery, while crediting the customer wallet ₦10,000 (`line 94`).
5. **Q: How does `validateSuccessfulPaymentForOrder` handle `feeBearer === "customer"`?**
   - **A: It accepts BOTH `expectedKobo + feesKobo` AND `expectedKobo` (`paymentHardening.service.js:210-212`, `payment.repository.js:541-543`) (VERIFIED).** If `feesKobo` is null/missing, it rejects with 409 `PAYMENT_FEES_DATA_MISSING` (`paymentHardening.service.js:179-205`).
