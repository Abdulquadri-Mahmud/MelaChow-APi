import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },

    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    description: {
      type: String,
      default: "",
    },

    image: {
      type: String,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound uniqueness (slug per parent)
categorySchema.index({ slug: 1, parent: 1 }, { unique: true });

// Auto-generate / sanitize slug
categorySchema.pre("save", function (next) {
  const normalizeSlug = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  // If admin provided or edited slug → sanitize only
  if (this.isModified("slug") && this.slug) {
    this.slug = normalizeSlug(this.slug);
  }

  // If slug is missing → generate from name
  if (!this.slug && this.name) {
    this.slug = normalizeSlug(this.name);
  }

  next();
});

const Category = mongoose.model("Category", categorySchema);
export default Category;
