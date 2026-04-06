const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');

async function checkParentOffers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        // Find categories with offers
        const catsWithOffers = await Category.find({
            $or: [ { offerValue: { $gt: 0 } }, { offerPercentage: { $gt: 0 } } ]
        });

        for (const cat of catsWithOffers) {
            console.log(`Checking Category with Offer: ${cat.name} (Level ${cat.level || 0})`);
            
            // Find ALL DESCENDANT categories (recursive)
            // This is simple for now: find children, then find children's children
            const childCats = await Category.find({ parentCategory: cat._id });
            const grandchildCats = await Category.find({ parentCategory: { $in: childCats.map(c => c._id) } });
            
            const allCatIds = [cat._id, ...childCats.map(c => c._id), ...grandchildCats.map(c => c._id)];
            
            const productCount = await Product.countDocuments({ category: { $in: allCatIds } });
            console.log(`  Total products in this branch: ${productCount}`);
            
            if (productCount > 0) {
                const products = await Product.find({ category: { $in: allCatIds } }).select('productName');
                console.log(`  Products: ${products.map(p => p.productName).join(', ')}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkParentOffers();
