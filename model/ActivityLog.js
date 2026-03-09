import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
    {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
            index: true,
        },
        action: {
            type: String,
            required: true,
            enum: [
                "LOGIN",
                "LOGOUT",
                "APPROVE_VENDOR",
                "REJECT_VENDOR",
                "SUSPEND_VENDOR",
                "REACTIVATE_VENDOR",
                "SUSPEND_USER",
                "BAN_USER",
                "REACTIVATE_USER",
                "UPDATE_COMMISSION",
                "UPDATE_DELIVERY_MODE",
                "UPDATE_CITY_FEE",
                "CREATE_LOCATION",
                "DELETE_ADMIN",
            ],
        },
        targetType: {
            type: String,
            enum: ["Vendor", "User", "Admin", "Location", "Commission", "System"],
            required: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: false, // System actions might not have a targetId
        },
        details: {
            type: String,
            required: true,
        },
        metadata: {
            type: Object,
            default: {},
        },
        ipAddress: String,
        userAgent: String,
    },
    { timestamps: true }
);

// Index for fast dashboard queries
activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.models.ActivityLog || mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
