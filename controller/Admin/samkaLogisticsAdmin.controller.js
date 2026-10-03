import { samkaLogisticsAdmin } from "../../services/logistics/samkaLogisticsAdmin.service.js";

const adminId = (req) => req.postgresAdminId || req.admin?.id || req.admin?._id;
const sourceAdminId = (req) => {
  const id = adminId(req);
  // Samka Logistics records source-admin actions against a GUID. In Mongo mode,
  // the fallback _id is a Mongo ObjectId and cannot be used for that audit trail.
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    const error = new Error("A PostgreSQL MelaChow admin UUID is required for Samka rider actions.");
    error.status = 503;
    throw error;
  }
  return id;
};
const respond = (handler) => async (req, res) => {
  try { return res.json({ success: true, data: await handler(req) }); }
  catch (error) {
    // An upstream Samka 401 is an integration credential/identity failure, not
    // a rejected MelaChow session. Never forward it as a browser-facing 401.
    const upstreamUnauthorized = error.status === 401;
    const status = upstreamUnauthorized ? 502 : (error.status || 502);
    return res.status(status).json({
      success: false,
      ...(upstreamUnauthorized ? { code: "SAMKA_UPSTREAM_UNAUTHORIZED", upstreamStatus: 401 } : {}),
      message: upstreamUnauthorized
        ? "Samka Logistics rejected this admin action. Check the source-admin key and PostgreSQL admin UUID configuration."
        : error.message,
    });
  }
};

export const listRiders = respond((req) => samkaLogisticsAdmin.listRiders(adminId(req), req.query));
export const getRider = respond((req) => samkaLogisticsAdmin.getRider(adminId(req), req.params.riderId));
export const getRiderDeliveries = respond((req) => samkaLogisticsAdmin.getRiderDeliveries(adminId(req), req.params.riderId, req.query));
export const getRiderWallet = respond((req) => samkaLogisticsAdmin.getRiderWallet(adminId(req), req.params.riderId));
export const getRiderLedger = respond((req) => samkaLogisticsAdmin.getRiderLedger(adminId(req), req.params.riderId, req.query));
export const getRiderWithdrawals = respond((req) => samkaLogisticsAdmin.getRiderWithdrawals(adminId(req), req.params.riderId, req.query));
export const approveRider = respond((req) => samkaLogisticsAdmin.approveRider(sourceAdminId(req), req.params.riderId));
export const rejectRider = respond((req) => samkaLogisticsAdmin.rejectRider(sourceAdminId(req), req.params.riderId, req.body.reason));
export const suspendRider = respond((req) => samkaLogisticsAdmin.suspendRider(sourceAdminId(req), req.params.riderId, req.body.reason));
export const getDelivery = respond((req) => samkaLogisticsAdmin.getDelivery(adminId(req), req.params.deliveryId));
export const cancelDelivery = respond((req) => samkaLogisticsAdmin.cancelDelivery(sourceAdminId(req), req.params.deliveryId, req.body.reason));
export const reassignDelivery = respond((req) => samkaLogisticsAdmin.reassignDelivery(sourceAdminId(req), req.params.deliveryId, req.body.riderId, req.body.reason));
