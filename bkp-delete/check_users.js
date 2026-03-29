const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB");

    const users = await User.find({}).limit(5);
    console.log("Total users in DB:", await User.countDocuments());
    
    if (users.length === 0) {
      console.log("No users found in the database.");
    } else {
      users.forEach(u => {
        console.log(`User: ${u.email}, Hashed Password: ${u.password ? 'Exists' : 'MISSING'}, Status: ${u.status}, Verified: ${u.isVerified}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkUsers();
