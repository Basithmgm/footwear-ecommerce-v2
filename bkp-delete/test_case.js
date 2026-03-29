const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function testQueryCase() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    // Case 1: Search for lowercase royixo9913@qvmao.com (which exists in DB)
    const u1 = await User.findOne({ email: "royixo9913@qvmao.com" });
    console.log("Searching for lowercase: ", u1 ? "FOUND" : "NOT FOUND");

    // Case 2: Search for uppercase Royixo9913@qvmao.com
    const u2 = await User.findOne({ email: "Royixo9913@qvmao.com" });
    console.log("Searching for MixedCase: ", u2 ? "FOUND" : "NOT FOUND");

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

testQueryCase();
