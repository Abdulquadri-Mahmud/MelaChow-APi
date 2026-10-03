import { issueVendorPickupCode } from "../../services/logistics/pickupCode.service.js";
import { usesSamkaLogistics } from "../../services/logistics/samkaLogistics.service.js";
export async function getVendorPickupCode(req, res, next) {
  if (!usesSamkaLogistics()) return res.status(409).json({ success: false, message: "Pickup codes are only available for Samka deliveries." });
  try {
    const data = await issueVendorPickupCode(req.params.vendorOrderId, String(req.vendor._id));
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
}