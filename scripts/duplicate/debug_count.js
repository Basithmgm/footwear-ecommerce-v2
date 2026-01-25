const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('./models/Category');

async function checkCount() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to:", process.env.MONGO_URI);

        const count = await Category.countDocuments({});
        console.log("Total Categories (including deleted):", count);

        const activeCount = await Category.countDocuments({ isDeleted: false });
        console.log("Active Categories (isDeleted: false):", activeCount);

        const all = await Category.find({});
        console.log("IDs:", all.map(c => c._id));

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
checkCount();
