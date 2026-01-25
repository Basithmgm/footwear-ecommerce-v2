const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
    },
    regularPrice: {
        type: Number,
        required: true,
    },
    salePrice: {
        type: Number,
        required: true,
    },
    variants: [{
        color: {
            type: String,
            required: true,
            trim: true
        },
        variantImages: {
            type: [String], // Array of image URLs/paths specific to this color
            required: true,
            validate: [arrayLimit, '{PATH} must have at least 3 images']
        },
        sizes: [{
            size: {
                type: Number, // Or String, depending on footwear standards (UK 6, 7 etc often numbers)
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 0
            }
        }]
    }],
    totalStock: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ["Available", "Out of Stock", "Discontinued"],
        default: "Available",
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    isFeatured: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

function arrayLimit(val) {
    return val.length >= 3;
}

module.exports = mongoose.model("Product", productSchema);
