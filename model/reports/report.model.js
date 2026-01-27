import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
        type: mongoose.Schema.Types.ObjectId, ref: "User", required: true
    },
    targetType: {
        type: String, enum: ["vendor", "food", "user"], required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId, required: true
    },
    reason: {
        type: String, required: true
    },
    status: {
        type: String, enum: ["pending", "resolved"], default: "pending"
    },
  },
  { timestamps: true }
);

const Reports =  mongoose.model("Report", reportSchema);

export default Reports