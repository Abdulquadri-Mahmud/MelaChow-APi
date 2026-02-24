import mongoose from "mongoose";
import slugify from "slugify";

const foodSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, "Food name is required"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    images: [
      {
        url: String,
        publicId: String // if you're using Cloudinary or similar
      }
    ],
    price: {
      type: Number,
      required: [true, "Price is required"],
    },
    categories: {
      type: [String], // [rootCategory, subCategory]
      required: [true, "Multi-level categorization is required (e.g., ['Fast Food', 'Pizza'])"],
      index: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 2;
        },
        message: "Categories must contain at least [rootCategory, subCategory]",
      },
    },
    // Dynamic portions and price scaling (relevant for Rice Dishes, Swallow, etc.)
    portions: [
      {
        portionNumber: { type: Number, required: true }, // e.g., 1, 2, 3
        price: { type: Number, required: true },
        label: { type: String }, // e.g., "1 Portion", "Double Portion"
      }
    ],
    // Flexible groups for extras (e.g., "Choice of Protein", "Add-ons")
    // 4️⃣ Stock Control (Global)
    stock: { type: Number, default: Infinity },

    // 5️⃣ Discounts (Legacy - Simple Price Reduction)
    discount: {
      active: { type: Boolean, default: false },
      percentage: { type: Number, default: 0 },
      flatAmount: { type: Number, default: 0 },
      expiresAt: { type: Date },
    },

    // 🆕 Advanced Discounts (Linked to Discount Model)
    // Vendors can link robust coupons/campaigns here for visibility
    activePromotions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Discount",
      }
    ],

    // 6️⃣ Order Popularity
    orderCount: { type: Number, default: 0 },

    // 7️⃣ Availability Schedule (Automated)
    availabilitySchedule: {
      enabled: { type: Boolean, default: false },
      days: [{ type: String }], // ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      startTime: { type: String }, // "09:00"
      endTime: { type: String }, // "22:00"
    },

    // 8️⃣ Customer Instructions
    allowInstructions: { type: Boolean, default: true },

    // 9️⃣ Packaging Fee
    packagingFee: { type: Number, default: 0 },

    // 1️⃣ Nutrition
    nutrition: {
      calories: Number,
      protein: Number,
      carbs: Number,
      fat: Number,
      fiber: Number,
      sugar: Number,
    },

    // 2️⃣ Prep Time
    prepTime: { type: Number, default: 15 }, // minutes

    // 3️⃣ Food Type
    foodType: {
      type: String,
      enum: ["veg", "non-veg", "vegan", "halal", "kosher", "mixed"],
      default: "mixed"
    },

    choiceGroups: [
      {
        name: { type: String, required: true }, // e.g. "Choose your Protein"
        minSelect: { type: Number, default: 0 },
        maxSelect: { type: Number, default: 1 },
        options: [
          {
            name: { type: String, required: true }, // e.g. "Beef", "Chicken"
            price: { type: Number, default: 0 },
            image: { type: String, default: "" }, // Cloudinary URL
            stock: { type: Number, default: Infinity }
          }
        ]
      }
    ],
    available: {
      type: Boolean,
      default: true,
    },
    tags: [
      {
        type: String,
      },
    ],
    estimatedDeliveryTime: {
      type: Number,
      default: 30,
    },
    rating: {
      type: Number,
      default: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Object,
      default: {},
    },
    variants: [
      {
        name: { type: String, required: true }, // e.g. "Small", "Large"
        price: { type: Number, required: true },
        image: { type: String, default: "" },
        stock: { type: Number, default: Infinity }
      },
    ],
  },
  { timestamps: true }
);

// 🧠 Auto-generate slug & validate portions before save
foodSchema.pre("save", function (next) {
  if (this.isModified("name") || !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }

  // Auto-validate portions scaling
  if (this.portions && this.portions.length > 0) {
    // Sort portions by number to be safe
    this.portions.sort((a, b) => a.portionNumber - b.portionNumber);

    // Ensure price scaling: subsequent portions must be >= previous portions
    for (let i = 1; i < this.portions.length; i++) {
      if (this.portions[i].price < this.portions[i - 1].price) {
        return next(new Error(`Portion pricing error: ${this.portions[i].portionNumber} portions cannot be cheaper than ${this.portions[i - 1].portionNumber} portions.`));
      }
    }
  }

  next();
});

// 🧩 Weighted Text Index for Fuzzy Search
foodSchema.index(
  {
    name: "text",
    description: "text",
    "variants.name": "text",
    tags: "text",
  },
  {
    weights: {
      name: 5,
      tags: 3,
      description: 1,
    },
    name: "FoodTextIndex",
  }
);

// Update rating dynamically (on new review)
foodSchema.methods.updateRating = async function (newRating) {
  const totalScore = this.rating * this.ratingCount;
  const newCount = this.ratingCount + 1;
  const newAverage = (totalScore + newRating) / newCount;
  this.rating = Math.round(newAverage * 10) / 10; // Round to 1 decimal
  this.ratingCount = newCount;
  return this.save();
};

// Remove rating dynamically (on review deletion)
foodSchema.methods.removeRating = async function (oldRating) {
  if (this.ratingCount <= 0) return this.save();
  const totalScore = this.rating * this.ratingCount;
  const newCount = this.ratingCount - 1;
  const newAverage = newCount > 0 ? (totalScore - oldRating) / newCount : 0;
  this.rating = Math.max(0, Math.round(newAverage * 10) / 10);
  this.ratingCount = newCount;
  return this.save();
};

const Food = mongoose.model("Food", foodSchema);

export default Food;
