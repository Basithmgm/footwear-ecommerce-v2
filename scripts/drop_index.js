const mongoose = require('mongoose');

const dropIndex = async () => {
    try {
        // Use the connection string from check_cats.js or .env
        await mongoose.connect('mongodb://127.0.0.1:27017/footwear-master');
        console.log("Connected to DB");

        const collection = mongoose.connection.collection('categories');

        // Check if index exists
        const indexes = await collection.indexes();
        const indexExists = indexes.some(idx => idx.name === 'name_1');

        if (indexExists) {
            await collection.dropIndex('name_1');
            console.log("SUCCESS: Index 'name_1' dropped.");
        } else {
            console.log("INFO: Index 'name_1' does not exist.");
        }

        // Optional: Force create new indexes
        // await require('../models/Category').init(); 
        // console.log("Indexes re-synced.");

        process.exit(0);
    } catch (err) {
        console.error("ERROR:", err.message);
        process.exit(1);
    }
};

dropIndex();
