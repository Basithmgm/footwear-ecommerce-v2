const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('./models/Category');

async function checkCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const categories = await Category.find({ isDeleted: false }).populate('parentCategory');
        console.log(JSON.stringify(categories, null, 2));
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
checkCategories();
