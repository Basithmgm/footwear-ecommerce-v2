const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Offer = require('../models/Offer');

async function debugOfferDisplay() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        // 1. All products with their offer settings
        const products = await Product.find({ isDeleted: false }).populate('category');
        console.log(`Total Products in DB: ${products.length}`);

        const productsWithOffers = products.filter(p => {
            const hasDirect = (p.offerValue || 0) > 0;
            const hasCat = p.category && (p.category.offerValue || 0) > 0;
            return hasDirect || hasCat;
        });
        
        console.log(`Products with some offer field > 0: ${productsWithOffers.length}`);
        productsWithOffers.forEach(p => {
            console.log(`- ${p.productName}: pOffer=${p.offerValue || 0}, catOffer=${p.category ? p.category.offerValue : 'No Cat'}`);
        });

        // 2. Specialized Offer models
        const activeOffers = await Offer.find({ isActive: true });
        console.log(`Active Specialized Offers in DB: ${activeOffers.length}`);
        activeOffers.forEach(o => {
            console.log(`- Offer: ${o.name}, Target: ${o.targetId}, Expires: ${o.expiresAt}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugOfferDisplay();
