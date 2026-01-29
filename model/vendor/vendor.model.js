// vendor.model.js
// ✅ Written in plain ES6+ (no classes) with detailed inline explanations

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const { Schema, model } = mongoose;

// =========================
// VENDOR SCHEMA DEFINITION
// =========================
const vendorSchema = new Schema(
  {
    // Basic vendor identity info
    name: { type: String, required: true, trim: true }, // Owner's name
    email: { type: String, required: true, unique: false, lowercase: true, index: true }, // Unique vendor email
    phone: { type: String, required: true, index: true }, // Vendor phone number

    // Auth details
    password: { type: String, required: false, select: false }, // Hidden (not returned by default)
    otp: { type: String },
    otpExpires: { type: Date },
    // Store info
    storeName: { type: String, required: true, trim: true, index: true }, // Vendor shop name
    storeSlug: { type: String, unique: true, sparse: true }, // Auto-generated URL slug from storeName
    storeDescription: { type: String, default: "" }, // Short bio or about store
    logo: { type: String, default: "" }, // Store logo (Cloudinary or CDN URL)

    // Address & geo-coordinates
    // Address info (legacy string fields - kept for backward compatibility)
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" }, // Legacy: kept for backward compatibility
      state: { type: String, default: "" }, // Legacy: kept for backward compatibility
      postalCode: { type: String, default: "" },
    },

    // Location references (NEW: database-driven)
    stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State", index: true },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City", index: true },

    // Location request tracking (for pending vendors)
    locationStatus: {
      type: String,
      enum: ["approved", "pending_review", null],
      default: null,
      index: true,
    },
    requestedState: { type: String, default: "" }, // Vendor's requested state (if not in DB)
    requestedCity: { type: String, default: "" }, // Vendor's requested city (if not in DB)

    // Food categories vendor serves
    cuisineTypes: [{ type: String }], // Example: ["Swallow", "Rice", "Salads"]

    // Working hours per day
    openingHours: {
      monday: { open: String, close: String, closed: { type: Boolean, default: false } },
      tuesday: { open: String, close: String, closed: { type: Boolean, default: false } },
      wednesday: { open: String, close: String, closed: { type: Boolean, default: false } },
      thursday: { open: String, close: String, closed: { type: Boolean, default: false } },
      friday: { open: String, close: String, closed: { type: Boolean, default: false } },
      saturday: { open: String, close: String, closed: { type: Boolean, default: false } },
      sunday: { open: String, close: String, closed: { type: Boolean, default: false } },
    },


    // Wallet & bank payout info
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", index: true }, // Linked wallet document
    payoutDetails: {
      bankName: { type: String, default: "" },
      accountName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      payoutMethod: { type: String, enum: ["paystack", "flutterwave", "manual"], default: "paystack" },
      payoutEnabled: { type: Boolean, default: false },
    },

    // Foods linked to this vendor
    foods: [{ type: mongoose.Schema.Types.ObjectId, ref: "Food" }],

    // Vendor Orders linked to this vendor
    vendorOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "VendorOrder" }],

    // Business performance
    totalSales: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    commissionRate: { type: Number, default: 0.1 }, // 10% default platform commission

    // Ratings
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // Status flags
    verified: { type: Boolean, default: false, index: true },
    suspended: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    suspensionReason: {
      type: String,
      default: "",
    },

    // Preferences
    acceptsDelivery: { type: Boolean, default: true },
    flatRateDeliveryFee: {
      type: Number,
      default: 0,
      // Only applicable if acceptsDelivery is true
      validate: {
        validator: function (v) {
          return this.acceptsDelivery || v === 0;
        },
        message: "flatRateDeliveryFee can only be set if acceptsDelivery is true"
      }
    },
    deliveryRadiusKm: { type: Number, default: 5 },
    tags: [{ type: String }], // For search filters

    // Miscellaneous
    metadata: { type: Object, default: {} },
    owners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // For multi-owner setups
    deletedAt: { type: Date, default: null }, // Soft delete flag
    adminNotes: { type: String, default: "" }, // Notes for internal admin use
  },
  {
    role: { type: String, default: "vendor" },
  },
  {
    timestamps: true, // Adds createdAt & updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);


// =========================
// INDEXES
// =========================
// (Removed 2dsphere index as coordinates are no longer used)

// =========================
// VIRTUAL FIELDS
// =========================
vendorSchema.virtual("fullAddress").get(function () {
  const addr = this.address || {};
  return `${addr.street || ""}${addr.street ? ", " : ""}${addr.city || ""}${addr.city ? ", " : ""}${addr.state || ""}`.trim();
});

// =========================
// PRE-SAVE HOOKS
// =========================

// 1️⃣ Hash password before saving (only when changed)
vendorSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // Skip if password not changed
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt); // Hash password
    next();
  } catch (err) {
    next(err);
  }
});

// 2️⃣ Auto-generate storeSlug from storeName
vendorSchema.pre("save", function (next) {
  if (this.isModified("storeName")) {
    this.storeSlug = this.storeName
      .toLowerCase()
      .replace(/[^\w ]+/g, "") // Remove special characters
      .replace(/\s+/g, "-"); // Replace spaces with dashes
  }
  next();
});

// =========================
// INSTANCE METHODS
// =========================

// Compare plain password with hashed one
vendorSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Return public profile (hides sensitive data)
vendorSchema.methods.getPublicProfile = function () {
  return {
    id: this._id,
    name: this.name,
    storeName: this.storeName,
    storeSlug: this.storeSlug,
    storeDescription: this.storeDescription,
    logo: this.logo,
    rating: this.rating,
    ratingCount: this.ratingCount,
    cuisineTypes: this.cuisineTypes,
    acceptsDelivery: this.acceptsDelivery,
    flatRateDeliveryFee: this.flatRateDeliveryFee,
    deliveryRadiusKm: this.deliveryRadiusKm,
    address: this.address,
    fullAddress: this.fullAddress,
    verified: this.verified,
    tags: this.tags,
  };
};

// Update rating dynamically (on new review)
vendorSchema.methods.updateRating = async function (newRating) {
  const totalScore = this.rating * this.ratingCount;
  const newCount = this.ratingCount + 1;
  const newAverage = (totalScore + newRating) / newCount;
  this.rating = Math.round(newAverage * 10) / 10; // Round to 1 decimal
  this.ratingCount = newCount;
  return this.save();
};

// Remove rating dynamically (on review deletion)
vendorSchema.methods.removeRating = async function (oldRating) {
  if (this.ratingCount <= 0) return this.save();
  const totalScore = this.rating * this.ratingCount;
  const newCount = this.ratingCount - 1;
  const newAverage = newCount > 0 ? (totalScore - oldRating) / newCount : 0;
  this.rating = Math.max(0, Math.round(newAverage * 10) / 10);
  this.ratingCount = newCount;
  return this.save();
};

// Add new food to vendor
vendorSchema.methods.addFood = async function (foodId) {
  if (!this.foods) this.foods = [];
  this.foods.push(foodId);
  return this.save();
};

// Remove food from vendor
vendorSchema.methods.removeFood = async function (foodId) {
  if (!this.foods) return this.save();
  this.foods = this.foods.filter((f) => f.toString() !== foodId.toString());
  return this.save();
};

// =========================
// STATIC METHODS
// =========================

// Create vendor and wallet together (atomic transaction)
vendorSchema.statics.createWithWallet = async function (vendorPayload, WalletModel) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1. Create vendor
    const vendor = await this.create([vendorPayload], { session });

    // 2. Create linked wallet
    const wallet = await WalletModel.create(
      [
        {
          ownerId: vendor[0]._id,
          ownerModel: "Vendor",
          balance: 0,
          totalEarned: 0,
          totalWithdrawn: 0,
        },
      ],
      { session }
    );

    // 3. Link wallet to vendor
    vendor[0].wallet = wallet[0]._id;
    await vendor[0].save({ session });

    // 4. Commit transaction
    await session.commitTransaction();
    session.endSession();

    return vendor[0];
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// =========================
// QUERY HELPERS
// =========================

// Chainable helper for active vendors only
vendorSchema.query.active = function () {
  return this.where({ active: true, suspended: false });
};

// =========================
// EXPORT MODEL
// =========================
export default mongoose.models.Vendor || model("Vendor", vendorSchema);
