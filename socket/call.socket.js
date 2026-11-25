import {
  acceptCall,
  clearDisconnectGrace,
  emitToSessionParticipant,
  endCall,
  failCall,
  getActiveCallForActor,
  initiateCall,
  markCallConnected,
  rejectCall,
  scheduleDisconnectTermination,
  verifySignalingAccess,
} from "../services/call/callSession.service.js";

function buildSocketCallActor(socket) {
  if (socket.userRole === "samka_rider" && socket.riderId) {
    return {
      role: "rider",
      provider: "samka",
      actorId: String(socket.riderId),
      riderId: String(socket.riderId),
      name: socket.riderName || "Rider",
    };
  }
  if (socket.userRole === "user" && (socket.postgresUserId || socket.userId)) {
    return {
      role: "customer",
      provider: "melachow",
      actorId: String(socket.postgresUserId || socket.userId),
      legacyId: socket.userId ? String(socket.userId) : null,
      name: socket.userName || "Customer",
    };
  }
  return null;
}

function safeAck(ack, payload) {
  if (typeof ack === "function") {
    try {
      ack(payload);
    } catch {
      // Ignore client ack failures
    }
  }
}

function formatError(err) {
  return {
    success: false,
    code: err.code || "CALL_ERROR",
    message: err.statusCode && err.statusCode < 500
      ? err.message
      : "Unable to process call request. Please try again.",
  };
}

/**
 * Registers authenticated WebRTC voice-call signaling handlers on an existing Socket.IO socket.
 */
export function registerCallSocketHandlers(io, socket) {
  const actor = buildSocketCallActor(socket);
  if (!actor) return;

  // Cancel any pending disconnect-grace timer if the participant reconnected in time
  getActiveCallForActor(actor)
    .then((active) => {
      if (active?.callId) {
        clearDisconnectGrace(active.callId, actor.role);
      }
    })
    .catch(() => {});

  socket.on("call:initiate", async (payload = {}, ack) => {
    try {
      const session = await initiateCall({
        actor,
        orderId: payload.orderId,
        vendorOrderId: payload.vendorOrderId,
        deliveryId: payload.deliveryId,
      });
      safeAck(ack, { success: true, session });
    } catch (err) {
      const formatted = formatError(err);
      socket.emit("call:error", formatted);
      safeAck(ack, formatted);
    }
  });

  socket.on("call:accept", async (payload = {}, ack) => {
    try {
      const session = await acceptCall({ actor, callId: payload.callId });
      safeAck(ack, { success: true, session });
    } catch (err) {
      const formatted = formatError(err);
      socket.emit("call:error", formatted);
      safeAck(ack, formatted);
    }
  });

  socket.on("call:reject", async (payload = {}, ack) => {
    try {
      const session = await rejectCall({
        actor,
        callId: payload.callId,
        reason: payload.reason || "rejected_by_callee",
      });
      safeAck(ack, { success: true, session });
    } catch (err) {
      const formatted = formatError(err);
      socket.emit("call:error", formatted);
      safeAck(ack, formatted);
    }
  });

  socket.on("call:offer", async (payload = {}, ack) => {
    try {
      if (!payload.callId || !payload.sdp) {
        throw Object.assign(new Error("Invalid call offer payload"), { statusCode: 400 });
      }
      const { session, peerRole } = await verifySignalingAccess(actor, payload.callId);
      await emitToSessionParticipant(session, peerRole, "call:offer", {
        callId: session.id,
        sdp: payload.sdp,
        fromRole: actor.role,
      });
      safeAck(ack, { success: true });
    } catch (err) {
      safeAck(ack, formatError(err));
    }
  });

  socket.on("call:answer", async (payload = {}, ack) => {
    try {
      if (!payload.callId || !payload.sdp) {
        throw Object.assign(new Error("Invalid call answer payload"), { statusCode: 400 });
      }
      const { session, peerRole } = await verifySignalingAccess(actor, payload.callId);
      await emitToSessionParticipant(session, peerRole, "call:answer", {
        callId: session.id,
        sdp: payload.sdp,
        fromRole: actor.role,
      });
      safeAck(ack, { success: true });
    } catch (err) {
      safeAck(ack, formatError(err));
    }
  });

  socket.on("call:ice-candidate", async (payload = {}, ack) => {
    try {
      if (!payload.callId || !payload.candidate) {
        throw Object.assign(new Error("Invalid ICE candidate payload"), { statusCode: 400 });
      }
      const { session, peerRole } = await verifySignalingAccess(actor, payload.callId);
      await emitToSessionParticipant(session, peerRole, "call:ice-candidate", {
        callId: session.id,
        candidate: payload.candidate,
        fromRole: actor.role,
      });
      safeAck(ack, { success: true });
    } catch (err) {
      safeAck(ack, formatError(err));
    }
  });

  socket.on("call:connected", async (payload = {}, ack) => {
    try {
      const session = await markCallConnected({ actor, callId: payload.callId });
      safeAck(ack, { success: true, session });
    } catch (err) {
      safeAck(ack, formatError(err));
    }
  });

  socket.on("call:cancel", async (payload = {}, ack) => {
    try {
      const session = await endCall({
        actor,
        callId: payload.callId,
        reason: payload.reason || "cancelled_by_caller",
      });
      safeAck(ack, { success: true, session });
    } catch (err) {
      safeAck(ack, formatError(err));
    }
  });

  socket.on("call:end", async (payload = {}, ack) => {
    try {
      const session = await endCall({
        actor,
        callId: payload.callId,
        reason: payload.reason || "ended_by_user",
      });
      safeAck(ack, { success: true, session });
    } catch (err) {
      safeAck(ack, formatError(err));
    }
  });

  socket.on("call:failed", async (payload = {}, ack) => {
    try {
      const session = await failCall({
        actor,
        callId: payload.callId,
        reason: payload.reason || "webrtc_connection_failed",
      });
      safeAck(ack, { success: true, session });
    } catch (err) {
      safeAck(ack, formatError(err));
    }
  });

  socket.on("disconnect", async () => {
    try {
      // Only start disconnect grace timer if the actor has NO other active sockets in their room
      const room =
        actor.role === "rider"
          ? `samka_rider_${actor.actorId}`
          : `user_${actor.actorId}`;
      const remaining = await io.in(room).fetchSockets();
      if (remaining.length === 0) {
        await scheduleDisconnectTermination(actor);
      }
    } catch {
      // Non-fatal
    }
  });
}
