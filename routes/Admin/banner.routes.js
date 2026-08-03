import express from "express";
import { superAdminOnly } from "../../middleware/adminAuth.js";
import { createBanner, deleteBanner, getBanner, getPublicBanners, listBanners, reorderBanners, setBannerStatus, updateBanner } from "../../controller/Admin/banner.controller.js";
const router = express.Router();
router.get("/public", getPublicBanners);
router.use(superAdminOnly);
router.get("/", listBanners); router.patch("/reorder", reorderBanners); router.post("/", createBanner);
router.get("/:id", getBanner); router.patch("/:id", updateBanner); router.delete("/:id", deleteBanner); router.patch("/:id/status", setBannerStatus);
export default router;
