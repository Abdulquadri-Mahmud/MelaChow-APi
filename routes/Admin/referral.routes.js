import express from "express";
import { superAdminOnly } from "../../middleware/adminAuth.js";
import {
  getAdminReferralsAttributions,
  getAdminReferralsConfig,
  getAdminReferralsOverview,
  patchAdminReferralsConfig,
  patchAdminUserReferralCode,
  reviewAdminReferral,
  revokeAdminCredit,
} from "../../controller/referral.controller.js";

const router = express.Router();

router.get("/config", superAdminOnly, getAdminReferralsConfig);
router.patch("/config", superAdminOnly, patchAdminReferralsConfig);
router.get("/overview", superAdminOnly, getAdminReferralsOverview);
router.get("/attributions", superAdminOnly, getAdminReferralsAttributions);
router.patch("/attributions/:id/review", superAdminOnly, reviewAdminReferral);
router.post("/credits/:id/revoke", superAdminOnly, revokeAdminCredit);
router.patch("/codes/:userId", superAdminOnly, patchAdminUserReferralCode);

export default router;
