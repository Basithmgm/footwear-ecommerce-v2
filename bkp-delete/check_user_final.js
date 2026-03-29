const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function checkUserFieldsSimple() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    const email = "royixo9913@qvmao.com";
    const user = await User.findOne({ email });
    
    if (user) {
        console.log("USER_EMAIL:" + user.email);
        console.log("USER_ROLE_ID:" + user.role_id);
        console.log("USER_STATUS:" + user.status);
        console.log("USER_VERIFIED:" + user.isVerified);
        console.log("USER_HASH:" + user.password);
    } else {
        console.log("User not found.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkUserFieldsSimple();
