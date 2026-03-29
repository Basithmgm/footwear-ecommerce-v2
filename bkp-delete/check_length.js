const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function checkHashLength() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    
    const user = await User.findOne({ email: "royixo9913@qvmao.com" });
    
    if (user) {
        console.log(`Hash: '${user.password}'`);
        console.log(`Length: ${user.password.length}`);
        if (user.password.length < 60) {
            console.log("CRITICAL ERROR: Hash is truncated! Bcrypt hashes must be 60 characters.");
        }
    } else {
        console.log("User not found.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkHashLength();
