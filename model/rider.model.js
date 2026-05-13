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
            required: false, // changed from true
            default: null,
            index: true
        },
        stateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "State",
            default: null,
            index: true
        },
        cityId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "City",
            default: null,
            index: true
        },
        locationStatus: {
            type: String,
            enum: ["approved", "pending_review", null],
            default: null,
            index: true,
        },
        requestedState: { type: String, default: "" },
        requestedCity: { type: String, default: "" },
        serviceZones: {
            type: [String],
            default: []
        },
        vehicleOwnership: {
            type: String,
            enum: ["own", "platform"],
            default: "own"
        },
        vehicleType: {
            type: String,
            enum: ["bicycle", "motorbike"],
            default: "bicycle"
        },
        platformVehicleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformVehicle",
            default: null,
            index: true
        },
        managedBy: {
            type: String,
            enum: ["vendor", "admin"],
            default: "vendor",
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
            enum: ["available", "pending_assignment", "on_delivery", "offline"],
            default: "offline",
            index: true
        },
        currentOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null
        },
        assignmentExpiresAt: { type: Date, default: null, index: true },
        approvedAt: { type: Date, default: null },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
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

        // ── Bank account for rider payouts ────────────────────────────────────
        // Populated when rider adds their bank account via the payout setup endpoint.
        // recipientCode is created by Paystack and used for all future transfers.
        payoutDetails: {
            bankCode:       { type: String, default: null },
            bankName:       { type: String, default: null },
            accountNumber:  { type: String, default: null },
            accountName:    { type: String, default: null },
            recipientCode:  { type: String, default: null, select: false },
            payoutEnabled:  { type: Boolean, default: false },
        },
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
riderSchema.index({ cityId: 1, status: 1, isActive: 1, isVerified: 1 });
riderSchema.index(
    { currentOrderId: 1 },
    { unique: true, partialFilterExpression: { currentOrderId: { $type: "objectId" } } }
);

// Virtuals
riderSchema.virtual("isAvailable").get(function () {
    return this.status === "available" && this.isActive && this.isVerified && !this.deletedAt && !this.currentOrderId;
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

riderSchema.methods.freeUp = async function (deliveryEarnings = 0) {
    this.status = "available";
    this.currentOrderId = null;
    this.totalDeliveries += 1;
    if (deliveryEarnings > 0) {
        this.totalEarnings += deliveryEarnings;
    }
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
