const mongoose = require('mongoose');
const Product = require('../models/Product');

async function checkOfferSizes() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        const productsWithOffers = await Product.find({
            $or: [ { offerValue: { $gt: 0 } }, { offerPercentage: { $gt: 0 } } ]
        });

        for (const p of productsWithOffers) {
            let hasActiveSize = false;
            for (const v of p.variants || []) {
                for (const s of v.sizes || []) {
                    if (s.status === 'Active' && !s.isBlocked) {
                        hasActiveSize = true;
                        break;
                    }
                }
                if (hasActiveSize) break;
            }
            if (!hasActiveSize) {
                console.log(`Product hidden because no sizes are Active/Unblocked: ${p.productName}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOfferSizes();
