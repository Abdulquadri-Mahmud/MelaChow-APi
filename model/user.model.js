import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const AddressSchema = new mongoose.Schema({
  label: { type: String, default: "Home" },         // e.g. "Home", "Work"
  addressLine: { type: String, required: true },    // Full address
  city: { type: String },                           // Legacy string field
  state: { type: String },                          // Legacy string field
  cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
  cityName: { type: String },
  stateName: { type: String },
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

    // ✅ Enhanced password field with select: false (don't return in queries by default)
    password: {
      type: String,
      required: false,  // Optional during migration (existing users won't have it)
      minlength: 8,
      select: false     // Don't return password in queries by default
    },

    phone: { type: String },
    avatar: { type: String },

    addresses: [AddressSchema],

    walletBalance: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },  // ✅ NEW: Account active status
    lastLogin: { type: Date },

    // ✅ NEW: Password reset fields
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // ✅ NEW: Login security fields
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    // Account suspension/ban fields
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

    // ✅ OTP fields (keep for registration/reset) - also hidden by default
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// ============================================
// PRE-SAVE HOOK: Hash password before saving
// ============================================
UserSchema.pre('save', async function (next) {
  // Only hash if password is modified
  if (!this.isModified('password')) return next();

  // Don't hash if password is being cleared
  if (!this.password) return next();

  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Compare candidate password with stored hash
 * @param {string} candidatePassword - Plain text password to compare
 * @returns {Promise<boolean>} - True if passwords match
 */
UserSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    if (!this.password) {
      throw new Error('No password set for this user');
    }
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed: ' + error.message);
  }
};

/**
 * Check if account is currently locked
 * @returns {boolean} - True if account is locked
 */
UserSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

/**
 * Increment login attempts and lock account if threshold reached
 * @returns {Promise} - Update promise
 */
UserSchema.methods.incLoginAttempts = async function () {
  // Reset attempts if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts (15 minutes lockout)
  const maxAttempts = 5;
  const lockTime = 15 * 60 * 1000; // 15 minutes

  if (this.loginAttempts + 1 >= maxAttempts) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

/**
 * Reset login attempts on successful login
 * @returns {Promise} - Update promise
 */
UserSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 }
  });
};

// Avoid recompilation issues in dev (important for Next.js)
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;