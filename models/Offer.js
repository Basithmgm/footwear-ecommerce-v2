const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    offerType: {
      type: String,
      enum: ["Product", "Category"],
      required: true,
    },
    //It will use targetId to store either the Product ID or the Category ID
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "targetModel",
    },
    //Dynamically tell Mongoose which schema the targetId references
    targetModel: {
      type: String,
      required: true,
      enum: ["Product", "Category"],
    },
    discountType: {
      type: String,
      enum: ["Percentage", "Fixed Amount"],
      default: "Percentage",
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);
module.exports = mongoose.model("offer", offerSchema);
