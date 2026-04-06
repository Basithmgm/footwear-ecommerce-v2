const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["Percentage", "Fixed Amount"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
    },
    minPurchaseAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    maxDiscountAmount: {
      type: Number,
      default: null, // Only for percentage discounts
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usageLimit: {
      type: Number, // Optional: Maximum global times this coupon can be used
      default: null,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    // CRITICAL: We track who used it to prevent a user from using the same coupon multiple times!
    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Coupon", couponSchema);
