const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true, // One entry per day
  },
  uniqueVisitors: {
    type: Number,
    default: 0,
  },
  visitedSessions: [String], // Store session IDs for the day to count unique visitors
}, { timestamps: true });

module.exports = mongoose.model("Analytics", analyticsSchema);
