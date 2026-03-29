const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const User = require("./models/User");

async function checkAdminLogin() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    const email = "admin@footwear.com";
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log("Admin user not found in DB.");
      process.exit(0);
    }

    console.log("User found:", user.email);
    console.log("Hash in DB:", user.password);
    
    const plainText = "admin123";
    const isMatch = await bcrypt.compare(plainText, user.password);
    console.log(`Bcrypt compare for 'admin123':`, isMatch ? "SUCCESS" : "FAIL");

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkAdminLogin();
