import mongoose from "mongoose";
import Vendor from "../../../model/vendor/vendor.model.js";
import Rider from "../../../model/rider.model.js";

/**
 * Payout fee overrides (fee-bearer + markup) per vendor/rider.
 * Notice to riders is handled MANUALLY outside this system (email/WhatsApp
 * sent by an admin directly) — there is no automated send integration.
 * A rider override cannot take effect until an admin explicitly confirms
 * the manual notice was sent, via the separate confirm-notice endpoint.
 * Vendor overrides activate immediately — vendors already contractually
 * absorb their own transfer fee, so a markup is not the same category of
 * change as flipping fee-bearer onto a rider who was previously fully covered.
 */

const setVendorOverride = async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { feeBearer, markupAmount, reason } = req.body;

        if (feeBearer && !["platform", "vendor"].includes(feeBearer)) {
            return res.status(400).json({ success: false, message: "feeBearer must be 'platform' or 'vendor'" });
        }
        if (markupAmount != null && (isNaN(markupAmount) || markupAmount < 0)) {
            return res.status(400).json({ success: false, message: "markupAmount must be a non-negative number" });
        }

        const vendor = await Vendor.findById(vendorId);
        if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

        const historyEntry = {
            feeBearer: feeBearer ?? vendor.payoutFeeOverride?.feeBearer ?? null,
            markupAmount: markupAmount ?? vendor.payoutFeeOverride?.markupAmount ?? null,
            status: "active",
            changedBy: req.admin?._id || req.user?._id || null,
            changedAt: new Date(),
            note: reason || "",
        };

        vendor.payoutFeeOverride = {
            feeBearer: feeBearer ?? vendor.payoutFeeOverride?.feeBearer ?? null,
            markupAmount: markupAmount ?? vendor.payoutFeeOverride?.markupAmount ?? null,
            status: "active",
            noticeSentAt: null,
            effectiveAt: new Date(),
            setBy: req.admin?._id || req.user?._id || null,
            setAt: new Date(),
            reason: reason || "",
            history: [...(vendor.payoutFeeOverride?.history || []), historyEntry],
        };

        await vendor.save();

        return res.status(200).json({
            success: true,
            message: "Vendor payout fee override is now active.",
            data: vendor.payoutFeeOverride,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const setRiderOverride = async (req, res) => {
    try {
        const { riderId } = req.params;
        const { feeBearer, markupAmount, reason } = req.body;

        if (feeBearer && !["platform", "rider"].includes(feeBearer)) {
            return res.status(400).json({ success: false, message: "feeBearer must be 'platform' or 'rider'" });
        }
        if (markupAmount != null && (isNaN(markupAmount) || markupAmount < 0)) {
            return res.status(400).json({ success: false, message: "markupAmount must be a non-negative number" });
        }

        const rider = await Rider.findById(riderId);
        if (!rider) return res.status(404).json({ success: false, message: "Rider not found" });

        // Any nonzero markup OR a non-platform feeBearer reduces what the rider
        // actually receives — both require manual notice before activation.
        const effectiveBearer = feeBearer ?? rider.payoutFeeOverride?.feeBearer;
        const effectiveMarkup = markupAmount ?? rider.payoutFeeOverride?.markupAmount ?? 0;
        const requiresNotice = effectiveBearer === "rider" || effectiveMarkup > 0;

        const status = requiresNotice ? "pending_notice" : "active";

        const historyEntry = {
            feeBearer: effectiveBearer ?? null,
            markupAmount: effectiveMarkup,
            status,
            changedBy: req.admin?._id || req.user?._id || null,
            changedAt: new Date(),
            note: reason || "",
        };

        rider.payoutFeeOverride = {
            feeBearer: effectiveBearer ?? null,
            markupAmount: effectiveMarkup,
            status,
            noticeSentAt: null,
            effectiveAt: requiresNotice ? null : new Date(),
            setBy: req.admin?._id || req.user?._id || null,
            setAt: new Date(),
            reason: reason || "",
            history: [...(rider.payoutFeeOverride?.history || []), historyEntry],
        };

        await rider.save();

        return res.status(200).json({
            success: true,
            message: requiresNotice
                ? "Override saved but INACTIVE. This rider must be manually notified (email/WhatsApp) before confirming via the confirm-notice endpoint."
                : "Rider payout fee override is now active (no notice required — no change to what the rider receives).",
            data: rider.payoutFeeOverride,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Admin attests the manual notice (email/WhatsApp, sent outside this system)
 * has actually been delivered to the rider. Only then does the override
 * become active and start affecting real payout calculations.
 */
const confirmRiderNotice = async (req, res) => {
    try {
        const { riderId } = req.params;
        const rider = await Rider.findById(riderId);
        if (!rider) return res.status(404).json({ success: false, message: "Rider not found" });

        if (rider.payoutFeeOverride?.status !== "pending_notice") {
            return res.status(400).json({
                success: false,
                message: `No pending notice to confirm. Current status: ${rider.payoutFeeOverride?.status || "none"}`,
            });
        }

        rider.payoutFeeOverride.status = "active";
        rider.payoutFeeOverride.noticeSentAt = new Date();
        rider.payoutFeeOverride.effectiveAt = new Date();
        rider.payoutFeeOverride.history.push({
            feeBearer: rider.payoutFeeOverride.feeBearer,
            markupAmount: rider.payoutFeeOverride.markupAmount,
            status: "active",
            changedBy: req.admin?._id || req.user?._id || null,
            changedAt: new Date(),
            note: "Manual notice confirmed by admin",
        });

        await rider.save();

        return res.status(200).json({
            success: true,
            message: "Notice confirmed. Override is now active and will apply to this rider's next withdrawal.",
            data: rider.payoutFeeOverride,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const clearVendorOverride = async (req, res) => {
    try {
        const { vendorId } = req.params;
        const vendor = await Vendor.findById(vendorId);
        if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

        vendor.payoutFeeOverride = {
            feeBearer: null,
            markupAmount: null,
            status: "none",
            noticeSentAt: null,
            effectiveAt: null,
            setBy: req.admin?._id || req.user?._id || null,
            setAt: new Date(),
            reason: "Cleared — reverted to platform default",
            history: [...(vendor.payoutFeeOverride?.history || []), {
                feeBearer: null, markupAmount: null, status: "none",
                changedBy: req.admin?._id || req.user?._id || null, changedAt: new Date(),
                note: "Override cleared",
            }],
        };
        await vendor.save();
        return res.status(200).json({ success: true, message: "Vendor override cleared — reverted to platform default.", data: vendor.payoutFeeOverride });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const clearRiderOverride = async (req, res) => {
    try {
        const { riderId } = req.params;
        const rider = await Rider.findById(riderId);
        if (!rider) return res.status(404).json({ success: false, message: "Rider not found" });

        rider.payoutFeeOverride = {
            feeBearer: null,
            markupAmount: null,
            status: "none",
            noticeSentAt: null,
            effectiveAt: null,
            setBy: req.admin?._id || req.user?._id || null,
            setAt: new Date(),
            reason: "Cleared — reverted to platform default",
            history: [...(rider.payoutFeeOverride?.history || []), {
                feeBearer: null, markupAmount: null, status: "none",
                changedBy: req.admin?._id || req.user?._id || null, changedAt: new Date(),
                note: "Override cleared",
            }],
        };
        await rider.save();
        return res.status(200).json({ success: true, message: "Rider override cleared — reverted to platform default.", data: rider.payoutFeeOverride });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export { setVendorOverride, setRiderOverride, confirmRiderNotice, clearVendorOverride, clearRiderOverride };
