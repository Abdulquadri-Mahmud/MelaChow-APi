import express from "express";
import * as riderAuthController from "../controller/riderAuth.controller.js";
import { requireRiderAuth } from "../middleware/riderAuth.middleware.js";

const router = express.Router();

router.post("/auth/rider/login", riderAuthController.loginRider);
router.post("/auth/rider/logout", riderAuthController.logoutRider);
router.get("/auth/rider/me", requireRiderAuth, riderAuthController.getMe);
router.post("/auth/rider/subscribe", requireRiderAuth, riderAuthController.subscribeRider);

router.post("/auth/rider/forgot-password", riderAuthController.forgotRiderPassword);
router.post("/auth/rider/verify-reset-code", riderAuthController.verifyRiderResetCode);
router.post("/auth/rider/reset-password", riderAuthController.resetRiderPassword);

export default router;
