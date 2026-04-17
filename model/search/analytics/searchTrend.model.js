// models/analytics/searchTrend.model.js
import mongoose from "mongoose";

/**
 * SearchTrend model tracks user search behavior.
 * Includes keyword frequency, user context, location, and time.
 */

const searchTrendSchema = new mongoose.Schema(
  {
    keyword: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    count: {
      type: Number,
      default: 1,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    state: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },

    city: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },

    lastSearchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for fast sorting by popularity
searchTrendSchema.index({ count: -1 });

const SearchTrend = mongoose.model("SearchTrend", searchTrendSchema);
export default SearchTrend;
