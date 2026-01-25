const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' }); // Adjust path if running from scripts/ dir

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master";

async function migrate() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        const siteSettingsCollection = db.collection('sitesettings');
        const bannerSettingsCollection = db.collection('bannersettings');

        // Check if source exists
        const collections = await db.listCollections({ name: 'sitesettings' }).toArray();
        if (collections.length === 0) {
            console.log("Collection 'sitesettings' does not exist. Nothing to migrate.");
            process.exit(0);
        }

        // Check if target exists
        const targetCollections = await db.listCollections({ name: 'bannersettings' }).toArray();
        if (targetCollections.length > 0) {
            console.log("Collection 'bannersettings' already exists.");
            // Optional: Check if empty. If so, drop and rename. If not, manual intervention needed.
            const count = await bannerSettingsCollection.countDocuments();
            if (count === 0) {
                console.log("Target is empty. Dropping target and renaming source...");
                await bannerSettingsCollection.drop();
                await siteSettingsCollection.rename('bannersettings');
                console.log("Successfully renamed 'sitesettings' to 'bannersettings'.");
            } else {
                console.log("Target 'bannersettings' is not empty. Skipping rename to avoid data loss.");
                console.log("Please manually merge or rename if needed.");
            }
        } else {
            // Rename
            await siteSettingsCollection.rename('bannersettings');
            console.log("Successfully renamed 'sitesettings' to 'bannersettings'.");
        }

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

migrate();
