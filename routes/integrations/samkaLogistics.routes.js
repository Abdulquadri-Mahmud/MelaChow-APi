import express from "express";
import { receiveSamkaCallback, requestSamkaDeliveryCode, validateSamkaDeliveryCode } from "../../controller/integrations/samkaLogistics.controller.js";

const router = express.Router();
const signedJson = express.raw({ type: "application/json", limit: "100kb" });

router.post("/callbacks", signedJson, receiveSamkaCallback);
router.post("/deliveries/request-completion-code", signedJson, requestSamkaDeliveryCode);
router.post("/deliveries/validate-completion", signedJson, validateSamkaDeliveryCode);

export default router;

