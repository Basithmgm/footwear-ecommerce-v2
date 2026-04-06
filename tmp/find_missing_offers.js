const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');

async function findMissingOffers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        // Find categories with offers
        const catsWithOffers = await Category.find({
            $or: [ { offerValue: { $gt: 0 } }, { offerPercentage: { $gt: 0 } } ]
        });
        
        console.log('Categories with Offers:', catsWithOffers.map(c => ({ 
            id: c._id, 
            name: c.name, 
            val: c.offerValue, 
            perc: c.offerPercentage 
        })));

        // Find ALL products in those categories
        const catIds = catsWithOffers.map(c => c._id);
        const productsInThoseCats = await Product.find({ category: { $in: catIds } })
            .select('productName isBlocked isDeleted status category');
            
        console.log('Products in Offer Categories:', productsInThoseCats.map(p => ({
            name: p.productName,
            blocked: p.isBlocked,
            deleted: p.isDeleted,
            status: p.status,
            catId: p.category
        })));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findMissingOffers();
