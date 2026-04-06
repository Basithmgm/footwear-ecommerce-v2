const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');

async function checkOfferFields() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        const count = await Product.countDocuments({ offerPercentage: { $gt: 0 }, offerValue: 0 });
        console.log('Products with offerPercentage > 0 and offerValue === 0:', count);

        const catCount = await Category.countDocuments({ offerPercentage: { $gt: 0 }, offerValue: 0 });
        console.log('Categories with offerPercentage > 0 and offerValue === 0:', catCount);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOfferFields();
