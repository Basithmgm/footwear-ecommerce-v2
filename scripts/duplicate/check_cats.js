const mongoose = require('mongoose');
const Category = require('./models/Category');

// Connect to DB (Need URI from env or common config, assuming local default or from .env)
const dotenv = require('dotenv');
dotenv.config();

const checkCategories = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/footwear-master'); // Fallback to guess, usually in .env
        console.log("Connected to DB");

        const allCats = await Category.find({}).lean();
        console.log(`Total Categories: ${allCats.length}`);

        const noLevel = allCats.filter(c => c.level === undefined);
        console.log(`Categories missing 'level': ${noLevel.length}`);

        const level0 = allCats.filter(c => c.level === 0);
        console.log(`Categories with level 0: ${level0.length}`);

        const level1 = allCats.filter(c => c.level === 1);
        console.log(`Categories with level 1: ${level1.length}`);

        console.log("--- Sample No Level ---");
        console.log(noLevel.slice(0, 3));

        console.log("--- Sample Level 0 ---");
        console.log(level0.slice(0, 3));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

checkCategories();
