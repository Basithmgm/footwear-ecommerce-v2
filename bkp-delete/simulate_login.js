const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const User = require("./models/User");

async function simulateLogin() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    const email = "royixo9913@qvmao.com";
    const password = "password123";

    // Replicate logic from authController.js exactly
    const user = await User.findOne({ email }).populate("role_id");
    
    if (!user) {
        console.log("FAIL: User not found");
        process.exit(1);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (isMatch) {
        console.log("SUCCESS: Login simulated correctly.");
    } else {
        console.log("FAIL: Password mismatch!");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

simulateLogin();
