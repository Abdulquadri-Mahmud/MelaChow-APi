import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },

    // ✅ Enhanced password field
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false
    },

    role: { type: String, enum: ["admin", "super-admin", "finance-admin"], required: true },

    // ✅ NEW: Password reset fields
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // ✅ NEW: Login security fields
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLogin: { type: Date },

    // ✅ OTP fields (hidden by default)
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },

    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  // Don't hash if password is being cleared
  if (!this.password) return next();

  try {
    const salt = await bcrypt.genSalt(12); // Strength 12
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
adminSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    if (!this.password) {
      throw new Error('No password set for this admin');
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
adminSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

/**
 * Increment login attempts and lock account if threshold reached
 * @returns {Promise} - Update promise
 */
adminSchema.methods.incLoginAttempts = async function () {
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
adminSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: Date.now() },
    $unset: { lockUntil: 1 }
  });
};

// Public profile (to hide sensitive fields)
adminSchema.methods.getPublicProfile = function () {
  const { _id, name, email, role, createdAt } = this;
  return { _id, name, email, role, createdAt };
};

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
export default Admin;
