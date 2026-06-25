// config/payouts.js
// ─────────────────────────────────────────────────────────────────────
// Single source of truth for MelaChow payout constants.
// Import this file everywhere. NEVER hardcode 800 or fee values inline.
// ─────────────────────────────────────────────────────────────────────

/** Flat rider payout per completed delivery (NGN). Platform absorbs Paystack transfer fee. */
export const RIDER_FIXED_PAYOUT = 800;

/** Minimum wallet balance required to trigger payout sweep. ₦0 at launch = every naira pays out. */
export const RIDER_PAYOUT_THRESHOLD  = 0;
export const VENDOR_PAYOUT_THRESHOLD = 0;

/** Rider sweep: 9:30 PM WAT = 20:30 UTC */
export const RIDER_SWEEP_CRON  = "0 30 20 * * *";

/** Vendor sweep: 10:30 PM WAT = 21:30 UTC */
export const VENDOR_SWEEP_CRON = "0 30 21 * * *";

/** Broadcast TTL in seconds. 5 minutes. */
export const BROADCAST_TTL_SECONDS = 300;

/** Delivery watchdog timeout in milliseconds. 1 hour. */
export const DELIVERY_TIMEOUT_MS = 60 * 60 * 1_000;

/** Termination strike threshold before suspension. */
export const TERMINATION_STRIKE_LIMIT   = 2;

/** Suspension duration in milliseconds after hitting strike limit. 48 hours. */
export const SUSPENSION_DURATION_MS = 48 * 60 * 60 * 1_000;

/** Vendor remake response window in milliseconds. 15 minutes. */
export const VENDOR_REMAKE_WINDOW_MS = 15 * 60 * 1_000;
