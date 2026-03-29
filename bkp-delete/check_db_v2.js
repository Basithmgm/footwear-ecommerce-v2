const mongoose = require("mongoose");
require("dotenv").config();

async function checkCollections() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
    console.log("Connected to MongoDB:", mongoose.connection.name);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Total Collections:", collections.length);
    console.log("Names:", collections.map(c => c.name));

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkCollections();
