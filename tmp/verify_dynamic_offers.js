const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Offer = require('../models/Offer');

async function verifyDynamicOffers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/footwear-master");
        
        const now = new Date();
        console.log(`Current Time (Verification): ${now}`);

        // Mock the aggregation pipeline stages
        const aggregation = [
            { $match: { productName: "SparX ABC", isDeleted: false } },
            { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "cat0" } },
            { $unwind: { path: "$cat0", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: "categories", localField: "cat0.parentCategory", foreignField: "_id", as: "cat1" } },
            { $unwind: { path: "$cat1", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: "categories", localField: "cat1.parentCategory", foreignField: "_id", as: "cat2" } },
            { $unwind: { path: "$cat2", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "offers",
                    let: { pId: "$_id", c0Id: "$cat0._id", c1Id: "$cat1._id", c2Id: "$cat2._id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$isActive", true] },
                                        { $gt: ["$expiresAt", now] },
                                        {
                                            $or: [
                                                { $and: [{ $eq: ["$targetModel", "Product"] }, { $eq: ["$targetId", "$$pId"] }] },
                                                { $and: [{ $eq: ["$targetModel", "Category"] }, { $in: ["$targetId", ["$$c0Id", "$$c1Id", "$$c2Id"]] }] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "matchedOffers"
                }
            },
            {
                $addFields: {
                    maxDiscount: {
                        $reduce: {
                            input: "$matchedOffers",
                            initialValue: 0,
                            in: {
                                $let: {
                                    vars: {
                                        currentDisc: {
                                            $cond: [
                                                { $eq: ["$$this.discountType", "Percentage"] },
                                                { $multiply: ["$salePrice", { $divide: ["$$this.discountValue", 100] }] },
                                                "$$this.discountValue"
                                            ]
                                        }
                                    },
                                    in: { $max: ["$$value", "$$currentDisc"] }
                                }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    validDiscount: {
                        $cond: [
                            { $gt: ["$maxDiscount", { $multiply: ["$salePrice", 0.5] }] },
                            0,
                            "$maxDiscount",
                        ],
                    },
                }
            },
            {
                $addFields: {
                    effectivePrice: { $subtract: ["$salePrice", "$validDiscount"] },
                }
            }
        ];

        const results = await Product.aggregate(aggregation);
        if (results.length > 0) {
            const p = results[0];
            console.log(`Product: ${p.productName}`);
            console.log(`  Sale Price: ${p.salePrice}`);
            console.log(`  Matched Offers Count: ${p.matchedOffers.length}`);
            console.log(`  Calculated Discount: ${p.validDiscount}`);
            console.log(`  Effective Price: ${p.effectivePrice}`);
            
            if (p.matchedOffers.length === 0 && p.validDiscount === 0) {
                console.log("SUCCESS: Expired offers are now ignored.");
            } else {
                console.log("FAILURE: Expired offers are still being applied.");
                p.matchedOffers.forEach(o => console.log(`  - Offer: ${o.name}, Expires: ${o.expiresAt}`));
            }
        } else {
            console.log("Product not found.");
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verifyDynamicOffers();
