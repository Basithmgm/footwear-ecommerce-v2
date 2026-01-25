const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('./models/Category');

async function clearCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to:", process.env.MONGO_URI);

        const countBefore = await Category.countDocuments({});
        console.log("Count Before Deletion:", countBefore);

        // Delete ALL, not just isDeleted: false, because user wants to re-enter everything
        const result = await Category.deleteMany({});
        console.log("Deleted Count:", result.deletedCount);

        const countAfter = await Category.countDocuments({});
        console.log("Count After Deletion:", countAfter);

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
clearCategories();
