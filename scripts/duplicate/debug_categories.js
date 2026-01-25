const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('./models/Category');

async function checkCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const categories = await Category.find({ isDeleted: false }).populate('parentCategory');

        console.log("Total Categories:", categories.length);

        categories.forEach(c => {
            console.log("---------------------------------------------------");
            console.log(`Name: ${c.name}`);
            console.log(`Gender: ${c.gender}`);
            console.log(`Parent: ${c.parentCategory ? c.parentCategory.name : 'NULL'}`);
            console.log(`Parent ID: ${c.parentCategory ? c.parentCategory._id : 'NULL'}`);
            console.log(`Raw Parent Field:`, c.parentCategory);
        });

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkCategories();
