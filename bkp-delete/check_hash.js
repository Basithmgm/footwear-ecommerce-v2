const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function checkUserHash() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    const email = "royixo9913@qvmao.com";
    const user = await User.findOne({ email });
    
    if (user) {
        console.log(`User: ${user.email}, Hash: ${user.password}`);
    } else {
        console.log("User not found.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkUserHash();
