import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: { 
        type: mongoose.Schema.Types.ObjectId, ref: "User", required: true
    },
    vendorId: { 
        type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true
    },
    foodId: { 
        type: mongoose.Schema.Types.ObjectId, ref: "Food"
    },
    rating: { 
        type: Number, min: 1, max: 5, required: true
    },
    comment: { 
        type: String },
  },
  { timestamps: true }
);

const Reviews = mongoose.model("Review", reviewSchema);

export default Reviews;