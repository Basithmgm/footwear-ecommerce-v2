const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        variantId: {
            type: String, // Assuming variant ID is a string from the frontend or product structure
            required: true
        },
        size: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
            default: 1
        },
        price: {
            type: Number,
            required: true
        },
        regularPrice: Number,
        salePrice: Number,
        // Snapshot of product details in case product is deleted/changed (optional but good practice)
        productName: String,
        image: String,
        isSelected: {
            type: Boolean,
            default: true
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Cart', cartSchema);
