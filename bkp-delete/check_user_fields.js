const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function checkUserFields() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    const email = "royixo9913@qvmao.com";
    const user = await User.findOne({ email }).populate("role_id");
    
    if (user) {
        console.log(`User: ${user.email}`);
        console.log(`Role: ${user.role_id ? user.role_id.role_name : 'No Role Found (MISSING!)'}`);
        console.log(`Status: ${user.status}`);
        console.log(`Verified: ${user.isVerified}`);
    } else {
        console.log("User not found.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkUserFields();
