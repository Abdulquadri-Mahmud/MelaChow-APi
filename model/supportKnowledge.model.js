import mongoose from "mongoose";

const supportKnowledgeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    content: { type: String, required: true, trim: true, maxlength: 12000 },
    audience: { type: String, enum: ["customer", "vendor", "all"], default: "customer", index: true },
    category: { type: String, trim: true, default: "general", index: true },
    keywords: { type: [String], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

supportKnowledgeSchema.index({ audience: 1, isPublished: 1, updatedAt: -1 });
supportKnowledgeSchema.index({ title: "text", content: "text", keywords: "text" });

export default mongoose.models.SupportKnowledge || mongoose.model("SupportKnowledge", supportKnowledgeSchema);
