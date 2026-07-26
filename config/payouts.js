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

/**
 * T+1 payout timing: Paystack settles collected payments the NEXT business
 * day. Sweeping payouts the same evening an order is paid risks attempting
 * a transfer before the platform's real Paystack balance has caught up.
 * Both sweeps now run the following morning, after settlement has landed.
 * No longer staggered — both are gated by the same settlement clock — but
 * kept as separate exported constants in case they need to diverge later.
 *
 * Sweep time: 7:30 AM WAT = 06:30 UTC
 */
export const PAYOUT_SWEEP_HOUR_UTC = 6;
export const PAYOUT_SWEEP_MINUTE_UTC = 30;

export const RIDER_SWEEP_CRON  = "0 30 6 * * *";
export const VENDOR_SWEEP_CRON = "0 30 6 * * *";

/** Broadcast TTL in seconds. 5 minutes. */
export const BROADCAST_TTL_SECONDS = 300;

/** Delivery watchdog timeout in milliseconds. 1 hour. */
export const DELIVERY_TIMEOUT_MS = 60 * 60 * 1_000;

/** Termination strike threshold before suspension. */
export const TERMINATION_STRIKE_LIMIT   = 2;

/** Default suspension duration after hitting the strike limit. */
// Fallback only. Runtime suspension duration is read from PlatformConfig.
export const SUSPENSION_DURATION_MS = 24 * 60 * 60 * 1_000;

/** Vendor remake response window in milliseconds. 15 minutes. */
export const VENDOR_REMAKE_WINDOW_MS = 15 * 60 * 1_000;
