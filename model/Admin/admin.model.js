import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "super-admin", "finance-admin"], default: "admin" },
    otp: { type: String },
    otpExpires: { type: Date },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
    },
  },
  { timestamps: true }
);

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
adminSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Public profile (to hide sensitive fields)
adminSchema.methods.getPublicProfile = function () {
  const { _id, name, email, role, createdAt } = this;
  return { _id, name, email, role, createdAt };
};

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
