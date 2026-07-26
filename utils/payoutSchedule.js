import { PAYOUT_SWEEP_HOUR_UTC, PAYOUT_SWEEP_MINUTE_UTC } from "../config/payouts.js";

/**
 * Computes a rider/vendor-facing message for when Paystack's platform balance
 * can't cover a requested manual withdrawal right now (funds not yet settled
 * T+1). Used by manual withdrawal endpoints to explain WHEN to try again,
 * rather than a bare "insufficient balance" error that looks like their
 * fault.
 */
export function getNextPayoutWindowMessage() {
    const WAT_OFFSET_MS = 60 * 60 * 1000; // WAT = UTC+1, no DST
    const nowWat = new Date(Date.now() + WAT_OFFSET_MS);
    const target = new Date(nowWat);
    target.setUTCHours(PAYOUT_SWEEP_HOUR_UTC, PAYOUT_SWEEP_MINUTE_UTC, 0, 0);

    let dayLabel = "today";
    if (target <= nowWat) {
        target.setUTCDate(target.getUTCDate() + 1);
        dayLabel = "tomorrow";
    }

    const weekday = target.toLocaleDateString("en-NG", { weekday: "long", timeZone: "UTC" });

    return {
        dayLabel,
        weekday,
        time: "7:30 AM",
        message: `Your withdrawal couldn't be processed right now because today's funds are still settling with our payment provider. Your next payout window is ${dayLabel} (${weekday}) at 7:30 AM — please try again after that time.`,
    };
}
