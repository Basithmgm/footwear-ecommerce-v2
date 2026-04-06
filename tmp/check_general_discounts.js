const mongoose = require('mongoose');
const Product = require('../models/Product');

async function checkGeneralDiscounts() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        const count = await Product.countDocuments({
            $expr: { $lt: ["$salePrice", "$regularPrice"] }
        });
        console.log('Products with salePrice < regularPrice:', count);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkGeneralDiscounts();
