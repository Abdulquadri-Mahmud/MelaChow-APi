import Banner from "../../model/banner.model.js";
import logger from "../../config/logger.js";

const allowed = ["title", "subtitle", "description", "bannerType", "contentStyle", "imageUrl", "mobileImageUrl", "backgroundGradient", "backgroundColor", "textColor", "accentColor", "ctaText", "ctaLink", "linkedRestaurantId", "linkedCategoryId", "icon", "isActive", "displayOrder", "startDate", "endDate"];
const clean = (body) => Object.fromEntries(Object.entries(body).filter(([key, value]) => allowed.includes(key) && value !== undefined));
const isUrlOrPath = (value) => /^https?:\/\//i.test(value) || /^\//.test(value);
function validate(data) {
  if (!data.title?.trim()) return "Title is required.";
  if (!data.bannerType || !data.contentStyle) return "Banner type and content style are required.";
  if (["image", "image-gradient"].includes(data.contentStyle) && !data.imageUrl) return "An image is required for this content style.";
  if (["gradient", "image-gradient"].includes(data.contentStyle) && (!data.backgroundGradient?.from || !data.backgroundGradient?.to)) return "Both gradient colours are required.";
  if (data.ctaText && !data.ctaLink) return "CTA destination is required when CTA text is provided.";
  if (data.ctaLink && !isUrlOrPath(data.ctaLink)) return "CTA destination must be an absolute URL or app path.";
  if (data.startDate && data.endDate && new Date(data.endDate) <= new Date(data.startDate)) return "End date must be after start date.";
  return null;
}
const publicBanner = (banner) => { const { createdBy, __v, ...safe } = banner.toObject ? banner.toObject() : banner; return safe; };
export const getPublicBanners = async (_req, res) => { try { const now = new Date(); const banners = await Banner.find({ isActive: true, $and: [{ $or: [{ startDate: null }, { startDate: { $lte: now } }] }, { $or: [{ endDate: null }, { endDate: { $gt: now } }] }] }).sort({ displayOrder: 1, createdAt: -1 }).lean(); res.json({ success: true, banners: banners.map(publicBanner) }); } catch (error) { logger.error({ error: error.message }, "Failed to fetch public banners"); res.status(500).json({ success: false, message: "Unable to load banners." }); } };
export const listBanners = async (_req, res) => { try { res.json({ success: true, banners: await Banner.find().sort({ displayOrder: 1, createdAt: -1 }).populate("createdBy", "name email") }); } catch { res.status(500).json({ success: false, message: "Unable to load banners." }); } };
export const getBanner = async (req, res) => { const banner = await Banner.findById(req.params.id); if (!banner) return res.status(404).json({ success: false, message: "Banner not found." }); res.json({ success: true, banner }); };
export const createBanner = async (req, res) => { try { const data = clean(req.body); const error = validate(data); if (error) return res.status(400).json({ success: false, message: error }); const banner = await Banner.create({ ...data, createdBy: req.admin._id }); res.status(201).json({ success: true, banner }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
export const updateBanner = async (req, res) => { try { const banner = await Banner.findById(req.params.id); if (!banner) return res.status(404).json({ success: false, message: "Banner not found." }); const data = clean(req.body); const error = validate({ ...banner.toObject(), ...data }); if (error) return res.status(400).json({ success: false, message: error }); Object.assign(banner, data); await banner.save(); res.json({ success: true, banner }); } catch (error) { res.status(400).json({ success: false, message: error.message }); } };
export const deleteBanner = async (req, res) => { const banner = await Banner.findByIdAndDelete(req.params.id); if (!banner) return res.status(404).json({ success: false, message: "Banner not found." }); res.json({ success: true }); };
export const setBannerStatus = async (req, res) => { if (typeof req.body.isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive must be a boolean." }); const banner = await Banner.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true }); if (!banner) return res.status(404).json({ success: false, message: "Banner not found." }); res.json({ success: true, banner }); };
export const reorderBanners = async (req, res) => { const ids = Array.isArray(req.body.bannerIds) ? req.body.bannerIds : []; if (!ids.length) return res.status(400).json({ success: false, message: "bannerIds is required." }); await Promise.all(ids.map((id, displayOrder) => Banner.findByIdAndUpdate(id, { displayOrder }))); res.json({ success: true }); };
