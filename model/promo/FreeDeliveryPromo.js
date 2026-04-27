import mongoose from "mongoose";

const freeDeliveryPromoSchema = new mongoose.Schema(
  {
    name:       { type: String, default: "first_order_free_delivery", unique: true },
    totalSlots: { type: Number, default: 100 },
    usedSlots:  { type: Number, default: 0 },
    isActive:   { type: Boolean, default: false },
    startsAt:   { type: Date },
    endsAt:     { type: Date },
  },
  { timestamps: true }
);

const FreeDeliveryPromo =
  mongoose.models.FreeDeliveryPromo ||
  mongoose.model("FreeDeliveryPromo", freeDeliveryPromoSchema);

export default FreeDeliveryPromo;
