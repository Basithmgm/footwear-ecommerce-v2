const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const User = require("./models/User");

async function resetUserPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    const email = "royixo9913@qvmao.com";
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log("User not found.");
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("password123", salt);
    
    user.password = hashedPassword;
    await user.save();
    
    console.log("User password reset to 'password123' successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

resetUserPassword();
