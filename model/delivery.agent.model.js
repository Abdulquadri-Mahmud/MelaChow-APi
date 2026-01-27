// models/DeliveryAgent.js
import mongoose from "mongoose";

const deliveryAgentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String },
  password: { type: String, required: true },
  vehicleType: { type: String, enum: ['bicycle', 'motorbike'], default: 'bicycle' },
  currentLocation: {
    lat: Number,
    lng: Number
  },
  isAvailable: { type: Boolean, default: true },
  assignedOrders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    }
  ],
  earnings: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  totalDeliveries: { type: Number, default: 0 },
  dateJoined: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("DeliveryAgent", deliveryAgentSchema);
