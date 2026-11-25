import { getIceServersForActor } from "../../services/call/turnCredentials.service.js";
import {
  acceptCall,
  endCall,
  getActiveCallForActor,
  getCallForActor,
  initiateCall,
  rejectCall,
} from "../../services/call/callSession.service.js";

function handleCallError(res, err) {
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  return res.status(status).json({
    success: false,
    code: err.code || "CALL_ERROR",
    message:
      status < 500
        ? err.message
        : "Unable to complete your call request right now. Please try again.",
  });
}

export async function getIceServers(req, res) {
  try {
    const config = await getIceServersForActor(req.callActor.actorId);
    return res.status(200).json({
      success: true,
      ...config,
    });
  } catch (err) {
    return handleCallError(res, err);
  }
}

export async function getActiveCall(req, res) {
  try {
    const session = await getActiveCallForActor(req.callActor);
    return res.status(200).json({
      success: true,
      session,
    });
  } catch (err) {
    return handleCallError(res, err);
  }
}

export async function getCallById(req, res) {
  try {
    const session = await getCallForActor(req.callActor, req.params.callId);
    return res.status(200).json({
      success: true,
      session,
    });
  } catch (err) {
    return handleCallError(res, err);
  }
}

export async function initiateCallHttp(req, res) {
  try {
    const { orderId, vendorOrderId, deliveryId } = req.body || {};
    const session = await initiateCall({
      actor: req.callActor,
      orderId,
      vendorOrderId,
      deliveryId,
    });
    return res.status(201).json({
      success: true,
      session,
    });
  } catch (err) {
    return handleCallError(res, err);
  }
}

export async function acceptCallHttp(req, res) {
  try {
    const session = await acceptCall({
      actor: req.callActor,
      callId: req.params.callId,
    });
    return res.status(200).json({
      success: true,
      session,
    });
  } catch (err) {
    return handleCallError(res, err);
  }
}

export async function rejectCallHttp(req, res) {
  try {
    const session = await rejectCall({
      actor: req.callActor,
      callId: req.params.callId,
      reason: req.body?.reason || "rejected_by_callee",
    });
    return res.status(200).json({
      success: true,
      session,
    });
  } catch (err) {
    return handleCallError(res, err);
  }
}

export async function endCallHttp(req, res) {
  try {
    const session = await endCall({
      actor: req.callActor,
      callId: req.params.callId,
      reason: req.body?.reason || "ended_by_user",
    });
    return res.status(200).json({
      success: true,
      session,
    });
  } catch (err) {
    return handleCallError(res, err);
  }
}
