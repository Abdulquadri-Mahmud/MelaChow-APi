import express from "express";
import { authenticateCallParticipant } from "../services/call/callAuth.service.js";
import {
  acceptCallHttp,
  endCallHttp,
  getActiveCall,
  getCallById,
  getIceServers,
  initiateCallHttp,
  rejectCallHttp,
} from "../controller/call/call.controller.js";

const router = express.Router();

// All calling endpoints require either an authenticated MelaChow Customer JWT
// or a short-lived Samka Rider Call Token minted by SamkaTech.Logistics.
router.use(authenticateCallParticipant);

router.get("/ice-servers", getIceServers);
router.get("/active", getActiveCall);
router.get("/:callId", getCallById);
router.post("/initiate", initiateCallHttp);
router.post("/:callId/accept", acceptCallHttp);
router.post("/:callId/reject", rejectCallHttp);
router.post("/:callId/end", endCallHttp);

export default router;
