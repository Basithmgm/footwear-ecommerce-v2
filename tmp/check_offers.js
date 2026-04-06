const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');

async function checkOffers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        const productsCount = await Product.countDocuments({
            $or: [
                { offerValue: { $gt: 0 } },
                { offerPercentage: { $gt: 0 } }
            ]
        });

        const categoriesCount = await Category.countDocuments({
            $or: [
                { offerValue: { $gt: 0 } },
                { offerPercentage: { $gt: 0 } }
            ]
        });

        const productsWithCategoryOffers = await Product.aggregate([
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "cat"
                }
            },
            { $unwind: "$cat" },
            {
                $match: {
                    $or: [
                        { "cat.offerValue": { $gt: 0 } },
                        { "cat.offerPercentage": { $gt: 0 } }
                    ]
                }
            }
        ]);

        console.log('Products with direct offers:', productsCount);
        console.log('Categories with offers:', categoriesCount);
        console.log('Products with category-inherited offers:', productsWithCategoryOffers.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOffers();
