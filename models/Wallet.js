const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    transactions: [
      {
        amount: {
          type: Number,
          required: true,
        },
        type: {
          type: String,
          enum: ["Credit", "Debit"],
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        orderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Order",
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Wallet", walletSchema);
