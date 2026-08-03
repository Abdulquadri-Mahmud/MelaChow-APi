import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  subtitle: { type: String, trim: true, maxlength: 180, default: "" },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  bannerType: { type: String, required: true, enum: ["brand", "restaurant", "food", "announcement", "installation", "promotion"] },
  contentStyle: { type: String, required: true, enum: ["gradient", "image", "image-gradient", "plain"] },
  imageUrl: { type: String, trim: true, default: "" }, mobileImageUrl: { type: String, trim: true, default: "" },
  backgroundGradient: { from: String, to: String, direction: { type: String, default: "to right" } },
  backgroundColor: { type: String, default: "" }, textColor: { type: String, default: "" }, accentColor: { type: String, default: "" },
  ctaText: { type: String, maxlength: 40, default: "" }, ctaLink: { type: String, maxlength: 500, default: "" },
  linkedRestaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null }, linkedCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null }, icon: { type: String, default: "" },
  isActive: { type: Boolean, required: true, default: true }, displayOrder: { type: Number, required: true, min: 0, default: 0 },
  startDate: { type: Date, default: null }, endDate: { type: Date, default: null }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
}, { timestamps: true });
bannerSchema.index({ isActive: 1, displayOrder: 1, startDate: 1, endDate: 1 });
export default mongoose.model("Banner", bannerSchema);
