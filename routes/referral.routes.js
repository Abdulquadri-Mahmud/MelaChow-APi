import express from "express";
import auth from "../middleware/auth.middleware.js";
import {
  applyReferralCode,
  getMyReferrals,
  getMyRewardCredits,
} from "../controller/referral.controller.js";

const router = express.Router();

router.get("/me", auth, getMyReferrals);
router.get("/credits", auth, getMyRewardCredits);
router.post("/apply", auth, applyReferralCode);

export default router;
