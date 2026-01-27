// routes/walletRoutes.js
import express from "express";
import { getPlatformWallet, getVendorWallet } from "../../controller/wallet/wallet.controller";

const router = express.Router();

router.get("/vendor", getVendorWallet);
router.get("/platform", getPlatformWallet);

router.post("/withdraw", withdrawFunds);

export default router;
