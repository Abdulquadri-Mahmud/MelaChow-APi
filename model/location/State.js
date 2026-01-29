import mongoose from "mongoose";

const stateSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
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

// Index for efficient queries
stateSchema.index({ name: 1, isActive: 1 });

// Query helper for active states
stateSchema.query.active = function () {
    return this.where({ isActive: true });
};

export default mongoose.models.State || mongoose.model("State", stateSchema);
