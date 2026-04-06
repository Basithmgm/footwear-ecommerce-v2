const mongoose = require('mongoose');
const Product = require('../models/Product');

async function checkOfferStatus() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        const productsWithOffers = await Product.find({
            $or: [ { offerValue: { $gt: 0 } }, { offerPercentage: { $gt: 0 } } ]
        });

        for (const p of productsWithOffers) {
            if (!["Available", "Out of Stock"].includes(p.status)) {
                console.log(`Product hidden due to status: ${p.productName}`);
                console.log(`  Current Status: ${p.status}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOfferStatus();
