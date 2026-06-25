/**
 * ⛔ DEPRECATED — DO NOT USE
 *
 * This file is a legacy wallet controller stub and has been intentionally disabled.
 *
 * Vulnerabilities it contained:
 *   - Direct axios.post to Paystack API from inside a controller (no service delegation)
 *   - Hardcoded fee logic and no idempotency reference
 *   - Wallet balance mutation without a MongoDB session (no atomicity)
 *   - Import from non-existent "../models/Wallet.js" path
 *
 * The correct vendor withdrawal flow lives in:
 *   → controller/wallet/withdrawal.controller.js  (initiateWithdrawal, getWithdrawalHistory)
 *   → services/paystackTransfer.service.js        (initiatePaystackTransfer, createTransferRecipient)
 *
 * Vendor wallet reads live in:
 *   → controller/user/wallet.controller.js
 *   → routes/wallet/wallet.routes.js
 */

export const getVendorWallet = (_req, res) =>
    res.status(410).json({ success: false, message: "Deprecated. Use GET /api/vendor/wallet instead." });

export const getPlatformWallet = (_req, res) =>
    res.status(410).json({ success: false, message: "Deprecated. Use the admin finance API instead." });

export const withdrawFunds = (_req, res) =>
    res.status(410).json({ success: false, message: "Deprecated. Use POST /api/vendor/wallet/withdraw instead." });