import mongoose from "mongoose";

const platformVehicleSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true },
        vehicleType: { type: String, enum: ["bicycle", "motorbike"], required: true, index: true },
        identifier: { type: String, required: true, unique: true, trim: true },
        stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State", default: null, index: true },
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City", default: null, index: true },
        status: { type: String, enum: ["available", "assigned", "maintenance", "retired"], default: "available", index: true },
        assignedRiderId: { type: mongoose.Schema.Types.ObjectId, ref: "Rider", default: null, index: true },
        notes: { type: String, default: "" },
    },
    { timestamps: true }
);

export default mongoose.models.PlatformVehicle || mongoose.model("PlatformVehicle", platformVehicleSchema);
