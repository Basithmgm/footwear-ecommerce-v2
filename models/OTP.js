const mongoose = require("mongoose");

const OTP_EXPIRY_MINUTES = 5; // OTP valid for 5 minutes

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  otp: {
    type: String,
    required: true,
  },
  // When this OTP becomes invalid (checked in controller)
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: OTP_EXPIRY_MINUTES * 60, // TTL index: auto-remove after 5 minutes
  },
});

module.exports = mongoose.model("OTP", otpSchema);