import { samkaLogisticsAdmin } from "../../services/logistics/samkaLogisticsAdmin.service.js";

const adminId = (req) => req.postgresAdminId || req.admin?.id || req.admin?._id;
const respond = (handler) => async (req, res) => {
  try { return res.json({ success: true, data: await handler(req) }); }
  catch (error) { return res.status(error.status || 502).json({ success: false, message: error.message }); }
};

export const listRiders = respond((req) => samkaLogisticsAdmin.listRiders(adminId(req), req.query));
export const getRider = respond((req) => samkaLogisticsAdmin.getRider(adminId(req), req.params.riderId));
export const getRiderDeliveries = respond((req) => samkaLogisticsAdmin.getRiderDeliveries(adminId(req), req.params.riderId, req.query));
export const getRiderWallet = respond((req) => samkaLogisticsAdmin.getRiderWallet(adminId(req), req.params.riderId));
export const getRiderLedger = respond((req) => samkaLogisticsAdmin.getRiderLedger(adminId(req), req.params.riderId, req.query));
export const getRiderWithdrawals = respond((req) => samkaLogisticsAdmin.getRiderWithdrawals(adminId(req), req.params.riderId, req.query));
export const approveRider = respond((req) => samkaLogisticsAdmin.approveRider(adminId(req), req.params.riderId));
export const rejectRider = respond((req) => samkaLogisticsAdmin.rejectRider(adminId(req), req.params.riderId, req.body.reason));
export const suspendRider = respond((req) => samkaLogisticsAdmin.suspendRider(adminId(req), req.params.riderId, req.body.reason));
export const getDelivery = respond((req) => samkaLogisticsAdmin.getDelivery(adminId(req), req.params.deliveryId));
export const cancelDelivery = respond((req) => samkaLogisticsAdmin.cancelDelivery(adminId(req), req.params.deliveryId, req.body.reason));
export const reassignDelivery = respond((req) => samkaLogisticsAdmin.reassignDelivery(adminId(req), req.params.deliveryId, req.body.riderId, req.body.reason));
