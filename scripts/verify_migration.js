const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master";

async function verify() {
    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const names = collections.map(c => c.name);
        console.log("Collections:", names);

        if (names.includes('bannersettings') && !names.includes('sitesettings')) {
            console.log("VERIFICATION PASSED: 'bannersettings' exists and 'sitesettings' is gone.");
        } else if (names.includes('bannersettings') && names.includes('sitesettings')) {
            console.log("VERIFICATION WARNING: Both collections exist.");
        } else {
            console.log("VERIFICATION STATE:", names);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
verify();
