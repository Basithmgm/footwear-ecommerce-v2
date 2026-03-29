const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

async function checkUserSpaces() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    
    // Find raw doc to see exactly what's in there
    const rawUser = await mongoose.connection.db.collection("users").findOne({ email: /.*royixo9913.*/i });
    
    if (rawUser) {
        console.log(`Email in DB: '${rawUser.email}' (Length: ${rawUser.email.length})`);
        if (rawUser.email !== rawUser.email.trim()) {
            console.log("WARNING: Email has hidden spaces!");
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

checkUserSpaces();
