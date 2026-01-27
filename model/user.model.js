import mongoose from "mongoose";

const AddressSchema = new mongoose.Schema({
  label: { type: String, default: "Home" },         // e.g. "Home", "Work"
  addressLine: { type: String, required: true },    // Full address
  city: { type: String },
  state: { type: String },
  postalCode: { type: String },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number },
  },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const UserSchema = new mongoose.Schema(
  {
    firstname: { type: String, trim: true },
    lastname: { type: String, trim: true },
    fullName: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: false },
    phone: { type: String },
    avatar: { type: String },

    addresses: [AddressSchema],

    walletBalance: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    lastLogin: { type: Date },

    // 🟢 Add these fields
    suspended: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    suspensionReason: { type: String },
    banReason: { type: String },
    activityLog: [
      {
        action: String,
        timestamp: { type: Date, default: Date.now },
        metadata: Object,
      },
    ],

    role: { type: String, default: "user" },
    otp: { type: String },
    otpExpires: { type: Date },
  },
  { timestamps: true }
);


// Avoid recompilation issues in dev (important for Next.js)
const User = mongoose.model("User", UserSchema);

export default User;