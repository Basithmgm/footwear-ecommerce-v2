const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const User = require("./models/User");
const Role = require("./models/Role");

async function verifyFix() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB for Verification");

    const rawEmail = "  Royixo9913@qvmao.com  "; // Mixed case and spaces
    const password = "password123";

    // Replicate logic from UPDATED authController.js
    let email = rawEmail ? rawEmail.trim().toLowerCase() : "";
    
    console.log(`Testing processed email: '${email}'`);

    const user = await User.findOne({ email }).populate("role_id");
    
    if (!user) {
        console.log("FAIL: User not found even after processing!");
        process.exit(1);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (isMatch) {
        console.log("SUCCESS: Login verified with processed email and password.");
    } else {
        console.log("FAIL: Password mismatch!");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

verifyFix();
