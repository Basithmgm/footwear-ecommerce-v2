const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');

async function checkOffers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        const direct = await Product.find({
            $or: [
                { offerValue: { $gt: 0 } },
                { offerPercentage: { $gt: 0 } }
            ]
        }).select('productName salePrice offerValue offerPercentage');

        const catInherited = await Product.aggregate([
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
            },
            {
                $project: {
                    productName: 1,
                    salePrice: 1,
                    catName: "$cat.name",
                    catOfferValue: "$cat.offerValue",
                    catOfferPercentage: "$cat.offerPercentage"
                }
            }
        ]);

        console.log('Direct Offers:', JSON.stringify(direct, null, 2));
        console.log('Cat Inherited Offers:', JSON.stringify(catInherited, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOffers();
