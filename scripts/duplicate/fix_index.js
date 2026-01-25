const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('./models/Category');

async function fixIndex() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const collection = mongoose.connection.collection('categories');
        const indexes = await collection.indexes();

        console.log("Current Indexes:", indexes.map(i => i.name));

        const oldIndexName = "name_1_parentCategory_1";
        const hasOldIndex = indexes.some(i => i.name === oldIndexName);

        if (hasOldIndex) {
            console.log(`Dropping old index: ${oldIndexName}`);
            await collection.dropIndex(oldIndexName);
            console.log("Dropped old index.");
        } else {
            console.log("Old index not found or already dropped.");
        }

        // Mongoose auto-sync ensures the new index is created on app start, 
        // but we can trigger it here to be safe.
        await Category.syncIndexes();
        console.log("Synced Indexes. New index should be active.");

        const newIndexes = await collection.indexes();
        console.log("New Indexes:", newIndexes.map(i => i.name));

        process.exit();
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
fixIndex();
