import express from "express";
import * as riderAuthController from "../controller/riderAuth.controller.js";
import { requireRiderAuth } from "../middleware/riderAuth.middleware.js";

const router = express.Router();

router.post("/auth/rider/login", riderAuthController.loginRider);
router.post("/auth/rider/logout", riderAuthController.logoutRider);
router.get("/auth/rider/me", requireRiderAuth, riderAuthController.getMe);
router.post("/auth/rider/subscribe", requireRiderAuth, riderAuthController.subscribeRider);

export default router;
