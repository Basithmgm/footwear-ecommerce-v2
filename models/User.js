// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true }, // will store HASH directly
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// IMPORTANT: no userSchema.pre("save") here

module.exports = mongoose.model("User", userSchema);
