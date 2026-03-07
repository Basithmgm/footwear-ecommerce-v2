require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB.');
        const db = mongoose.connection.db;

        // Collections to drop
        const collectionsToDrop = ['marque', 'marquesettings', 'bannars', 'bannersettings'];

        for (const collName of collectionsToDrop) {
            try {
                const collections = await db.listCollections({ name: collName }).toArray();
                if (collections.length > 0) {
                    await db.dropCollection(collName);
                    console.log(`Dropped collection: ${collName}`);
                } else {
                    console.log(`Collection ${collName} not found, skipping drop.`);
                }
            } catch (error) {
                console.error(`Error dropping collection ${collName}:`, error);
            }
        }

        console.log('Finished dropping collections.');
        mongoose.disconnect();
    })
    .catch(err => {
        console.error('Error connecting to MongoDB:', err);
        process.exit(1);
    });
