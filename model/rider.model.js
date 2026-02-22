import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const riderSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        phone: { type: String, required: true, index: true },
        email: { type: String, sparse: true, index: true },
        avatar: { type: String, default: "" },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
            index: true
        },
        password: {
            type: String,
            select: false,
            minlength: 8
        },
        otp: { type: String, select: false },
        otpExpires: { type: Date, select: false },
        resetPasswordToken: { type: String, select: false },
        resetPasswordExpires: { type: Date, select: false },
        loginAttempts: { type: Number, default: 0 },
        lockUntil: { type: Date },
        lastLogin: { type: Date },
        status: {
            type: String,
            enum: ["available", "on_delivery", "offline"],
            default: "offline",
            index: true
        },
        currentOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null
        },
        isActive: { type: Boolean, default: true },
        isVerified: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        totalDeliveries: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
        ratingCount: { type: Number, default: 0 },
        notes: { type: String },
        metadata: { type: Object },
        role: { type: String, default: "rider" },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Compound Indexes
riderSchema.index({ vendorId: 1, status: 1 });
riderSchema.index({ vendorId: 1, isActive: 1, deletedAt: 1 });

// Virtuals
riderSchema.virtual("isAvailable").get(function () {
    return this.status === "available" && this.isActive && !this.deletedAt;
});

// Instance Methods
riderSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        if (!this.password) {
            throw new Error('No password set for this rider');
        }
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed: ' + error.message);
    }
};

riderSchema.methods.isLocked = function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

riderSchema.methods.incLoginAttempts = async function () {
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }

    const updates = { $inc: { loginAttempts: 1 } };
    const maxAttempts = 5;
    const lockTime = 15 * 60 * 1000;

    if (this.loginAttempts + 1 >= maxAttempts) {
        updates.$set = { lockUntil: Date.now() + lockTime };
    }

    return this.updateOne(updates);
};

riderSchema.methods.resetLoginAttempts = async function () {
    return this.updateOne({
        $set: { loginAttempts: 0, lastLogin: Date.now() },
        $unset: { lockUntil: 1 }
    });
};

riderSchema.methods.getPublicProfile = function () {
    const profile = this.toObject();
    delete profile.password;
    delete profile.otp;
    delete profile.otpExpires;
    delete profile.resetPasswordToken;
    delete profile.resetPasswordExpires;
    return profile;
};

riderSchema.methods.assignOrder = async function (orderId) {
    this.status = "on_delivery";
    this.currentOrderId = orderId;
    return this.save();
};

riderSchema.methods.freeUp = async function () {
    this.status = "available";
    this.currentOrderId = null;
    this.totalDeliveries += 1;
    return this.save();
};

riderSchema.methods.updateRating = async function (newRating) {
    const totalScore = this.rating * this.ratingCount;
    const newCount = this.ratingCount + 1;
    const newAverage = (totalScore + newRating) / newCount;
    this.rating = Math.round(newAverage * 10) / 10;
    this.ratingCount = newCount;
    return this.save();
};

// Static Methods
riderSchema.statics.getAvailableForVendor = function (vendorId) {
    return this.find({
        vendorId,
        status: "available",
        isActive: true,
        deletedAt: null
    });
};

riderSchema.statics.getAllForVendor = function (vendorId) {
    return this.find({
        vendorId,
        deletedAt: null
    });
};

// Query Helpers
riderSchema.query.active = function () {
    return this.where({ isActive: true, deletedAt: null });
};

riderSchema.query.available = function () {
    return this.where({ status: "available", isActive: true, deletedAt: null });
};

// Pre-save hook for password hashing
riderSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    if (!this.password) return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

const Rider = mongoose.models.Rider || mongoose.model("Rider", riderSchema);

export default Rider;
