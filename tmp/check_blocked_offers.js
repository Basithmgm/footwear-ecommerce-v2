const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');

async function checkBlockedOffers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        // Find products with offers
        const productsWithOffers = await Product.find({
            $or: [ { offerValue: { $gt: 0 } }, { offerPercentage: { $gt: 0 } } ]
        }).populate('category');

        for (const p of productsWithOffers) {
            if (!p.category) {
                console.log(`Product with offer has no category: ${p.productName}`);
                continue;
            }
            if (p.category.isBlocked || p.category.isDeleted) {
                console.log(`Product hidden due to category status: ${p.productName}`);
                console.log(`  Category: ${p.category.name} (${p.category.isBlocked ? 'Blocked' : 'Deleted'})`);
            }
        }

        // Find products in categories with offers
        const catsWithOffers = await Category.find({
            $or: [ { offerValue: { $gt: 0 } }, { offerPercentage: { $gt: 0 } } ]
        });

        for (const cat of catsWithOffers) {
            if (cat.isBlocked || cat.isDeleted) {
                const productsInCat = await Product.find({ category: cat._id });
                if (productsInCat.length > 0) {
                    console.log(`Category with offer is ${cat.isBlocked ? 'Blocked' : 'Deleted'}: ${cat.name}`);
                    console.log(`  Products hidden: ${productsInCat.map(p => p.productName).join(', ')}`);
                }
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkBlockedOffers();
