import mongoose from "mongoose";

const citySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        stateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "State",
            required: true,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound unique index: same city name can exist in different states
citySchema.index({ name: 1, stateId: 1 }, { unique: true });

// Index for efficient queries
citySchema.index({ stateId: 1, isActive: 1 });

// Query helper for active cities
citySchema.query.active = function () {
    return this.where({ isActive: true });
};

export default mongoose.models.City || mongoose.model("City", citySchema);
