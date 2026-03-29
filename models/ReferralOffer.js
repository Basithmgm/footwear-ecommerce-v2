const mongoose = require("mongoose");

const referralOfferSchema = new mongoose.Schema(
  {
    isActive: {
      type: Boolean,
      default: false,
    },
    referrerReward: {
      type: Number,
      required: true,
      min: 0,
    },
    refereeReward: {
      type: Number,
      required: true,
      min: 0,
    },
    title: {
      type: String,
      default: "Refer & Earn",
    },
    description: {
      type: String,
      default: "Invite your friends and earn rewards!",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ReferralOffer", referralOfferSchema);
