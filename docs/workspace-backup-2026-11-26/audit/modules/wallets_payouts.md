# Module Comprehension: Wallets, Bank Accounts, Withdrawals & Payouts

**Scope:** `routes/wallet/wallet.routes.js`, `controller/user/wallet.controller.js`, `controller/wallet/bankAccount.controller.js`, `controller/wallet/withdrawal.controller.js`, `controller/rider/riderWithdrawal.controller.js`, `jobs/scheduledPayout.job.js`, `services/postgres/payout.repository.js`, `services/transferReconciliation.service.js`, `model/wallet/Withdrawal.model.js`.

---

## File-by-File Summary

### `controller/user/wallet.controller.js` (193 LOC)
- **Purpose:** Customer wallet balance retrieval (`getUserWallet`), Paystack wallet top-up init/verify (`initiateWalletFunding`, `verifyWalletFunding`), and admin manual wallet credit (`creditUserWallet`).
- **CRITICAL flaws:**
  - `verifyWalletFunding` (`lines 93-155`, mounted at `GET /api/wallet/verify/:reference`):
    1. Does **not** verify `data.metadata?.type === "wallet_funding"` → any paid food order's Paystack reference (`PSK_...`) can be replayed here to credit the full order total as free wallet money.
    2. Does **not** verify `data.metadata?.userId === String(req.userId)` → any user can replay another user's Paystack reference.
    3. Idempotency only scans `wallet.transactions.find(t => t.description === description)` on the **caller's own wallet** (`line 126`), NOT globally across all wallets → the same Paystack reference can be credited once to Account A, once to Account B, once to Account C, ad infinitum.
    4. Non-atomic read-modify-write (`Wallet.findOne` → `wallet.balance += amountPaid` → `wallet.save()`, `lines 116-141`) → concurrent requests on the same account double-credit the wallet.
    5. Does not check `data.currency === "NGN"` and has no Postgres branch (crashes on STAGING).
  - `creditUserWallet` (`lines 160-193`, mounted at `POST /api/wallet/admin/credit` with `adminAuth`, NOT `financeAdminOnly`): no validation that `amount` is finite/positive (`Number(amount)` could be negative or `NaN`), no `ActivityLog` audit record, and Mongoose-only.

### `controller/wallet/bankAccount.controller.js` (153 LOC)
- **Purpose:** Bank list lookup, Paystack account resolution, and vendor payout bank account registration/removal.
- **HIGH flaws:**
  - `saveBankAccount` (`lines 80-85`) enforces a security lock preventing vendors from overwriting an already-enabled bank account (`BANK_DETAILS_LOCKED`), **but `removeBankAccount` (`lines 122-153`, `DELETE /api/wallet/bank-account`) allows the vendor to delete their own bank account (`payoutEnabled: false`) and then immediately call `saveBankAccount` with a new bank account**, completely defeating the lock.
  - Both `saveBankAccount` and `removeBankAccount` are Mongoose-only (crash on STAGING).
  - `routes/wallet/wallet.routes.js:35` exposes `GET /api/wallet/public/resolve-account` **unauthenticated** (only behind `walletLimiter` 20/15m), proxying Paystack account name resolution (PII enumeration of Nigerian bank account holders' full names).

### `controller/wallet/withdrawal.controller.js` (854 LOC) & `controller/rider/riderWithdrawal.controller.js` (557 LOC)
- **Purpose:** Manual vendor and rider withdrawals via Paystack transfers (dual Mongo/Postgres), withdrawal history, and admin `forceFailWithdrawal`.
- **Behaviors & flaws:**
  - Postgres path (`payout.repository.js:103-132`): well-structured `Serializable` transaction with atomic `balance: { gte: requestedAmount }` decrement and unique `activePayoutKey`.
  - Mongo path (`withdrawal.controller.js:172-199`): relies on `Withdrawal.model.js:68` `activePayoutKey: { unique: true, sparse: true }` to prevent concurrent withdrawals, but wallet debit (`lines 189-197`) is non-atomic outside a transaction (if a concurrent order escrow release lands between `Wallet.findOne` and `wallet.save()`, the credit can be overwritten/lost).
  - `withdrawal.controller.js:302`: leaks `stack: error.stack` in 500 error responses.
  - `withdrawal.controller.js:309-345` (`legacyForceFailWithdrawal`, mounted at `PATCH /api/wallet/admin/withdrawals/:withdrawalId/force-fail` with `adminAuth`): restores wallet balance without checking Paystack transfer status or unsetting `activePayoutKey`.
  - `riderWithdrawal.controller.js:39,104,128`: interpolates `accountNumber` and `bankCode` unencoded into Paystack URL query strings.

### `jobs/scheduledPayout.job.js` (474 LOC) & `services/transferReconciliation.service.js` (184 LOC)
- **Purpose:** Daily T+1 automated payout sweeps (06:30 UTC) via BullMQ `scheduled-payout` queue, and 5-minute Paystack transfer reconciliation.
- **Flaws:**
  - `scheduledPayout.job.js:443-445`: `triggerScheduledPayouts` cleans `"completed"` and `"failed"` jobs at the start of every sweep, which destroys BullMQ `jobId` deduplication (`vendor-payout-${id}-${today}`) if triggered twice on the same day (though 24h cooldown in `reserveWithdrawal` helps in Postgres, Mongo `processPayoutJob` has **no 24h cooldown check**!).
  - `scheduledPayout.job.js:108,285`: reuses `bullmqRedisConnection` directly without `.duplicate()` for both `Queue` and `Worker` (contradicting `config/redis.js:91-92` and `config/queue.js:17`!).

---

## Comprehension Check (5 Non-Obvious Questions & Verified Answers)

1. **Q: Can a customer get free wallet credit by replaying an already-paid food order's Paystack reference against `GET /api/wallet/verify/:reference`?**
   - **A: YES (VERIFIED).** `controller/user/wallet.controller.js:93-155` checks only `data.status === "success"` and whether `wallet.transactions` on the caller's wallet contains `Wallet funding via ${reference}`. It never checks `data.metadata.type`, `data.metadata.userId`, or whether the reference already paid an Order or funded another user's wallet.
2. **Q: Can a compromised vendor account bypass the `BANK_DETAILS_LOCKED` restriction without admin intervention?**
   - **A: YES (VERIFIED).** `routes/wallet/wallet.routes.js:41` mounts `DELETE /api/wallet/bank-account` → `removeBankAccount` (`bankAccount.controller.js:122-148`), which resets `payoutEnabled: false` and `accountNumber: ""`. The attacker can then call `POST /api/wallet/bank-account` to bind their own bank account.
3. **Q: In MongoDB (LIVE PROD), what prevents a vendor from firing two simultaneous `POST /api/wallet/withdraw` requests?**
   - **A: `Withdrawal.model.js:68` defines `activePayoutKey: { type: String, unique: true, sparse: true }` (VERIFIED).** However, wallet balance updates (`withdrawal.controller.js:189-197`) are non-atomic `findOne` + `save` (not `$inc`), so a concurrent escrow credit can be lost.
4. **Q: Does `verifyWalletFunding` work on `MelaChow-API-staging` (`DB_PRIMARY_PROVIDER=postgres`)?**
   - **A: NO (VERIFIED).** `controller/user/wallet.controller.js:93-155` has no `usePostgresWalletReads()` / Postgres branch; line 116 calls Mongoose `Wallet.findOne`, which fails immediately when `mongoose.set("bufferCommands", false)` is active.
5. **Q: What happens if `triggerScheduledPayouts` is invoked twice in the same day in MongoDB mode?**
   - **A: It can enqueue and pay out a second time (VERIFIED).** `scheduledPayout.job.js:444` calls `scheduledPayoutQueue.clean(0, 1000, "completed")`, erasing the `jobId` deduplication lock for `today`, and `processPayoutJob` (`lines 140-226`) does not enforce a 24-hour cooldown in Mongo mode.
