const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');

async function checkHighDiscounts() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        const products = await Product.find({}).populate('category');
        
        for (const p of products) {
            const salePrice = p.salePrice || 0;
            if (salePrice === 0) continue;

            let pDisc = 0;
            if (p.offerType === 'Percentage') {
                pDisc = salePrice * (p.offerValue / 100);
            } else {
                pDisc = p.offerValue || 0;
            }

            let catDisc = 0;
            if (p.category) {
                if (p.category.offerType === 'Percentage') {
                    catDisc = salePrice * (p.category.offerValue / 100);
                } else {
                    catDisc = p.category.offerValue || 0;
                }
            }

            const maxDisc = Math.max(pDisc, catDisc);
            if (maxDisc > (salePrice * 0.5)) {
                console.log(`High Discount Found: ${p.productName}`);
                console.log(`  SalePrice: ${salePrice}`);
                console.log(`  MaxDiscount: ${maxDisc} (${(maxDisc/salePrice*100).toFixed(1)}%)`);
                console.log(`  Status in getOffers: REJECTED (Hidden)`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkHighDiscounts();
