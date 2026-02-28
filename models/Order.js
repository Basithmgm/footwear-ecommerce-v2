const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
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
        productName: { type: String, required: true },
        variantId: { type: String, required: true }, // Color
        size: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        itemTotal: { type: Number, required: true },
        image: { type: String },
        itemStatus: {
            type: String,
            enum: ['Ordered', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Requested', 'Returned', 'Return Rejected'],
            default: 'Ordered'
        },
        cancelReason: { type: String },
        returnReason: { type: String },
        adminReturnComment: { type: String }
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    shippingAddress: {
        full_name: { type: String, required: true },
        phone_number: { type: String, required: true },
        full_address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, required: true },
        zip_code: { type: String, required: true }
    },
    paymentMethod: {
        type: String,
        enum: ['COD'],
        default: 'COD',
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    orderStatus: {
        type: String,
        enum: ['Ordered', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Requested', 'Returned', 'Return Rejected'],
        default: 'Ordered'
    },
    orderedDate: {
        type: Date,
        default: Date.now
    },
    deliveryDate: {
        type: Date
    },
    discount: {
        type: Number,
        default: 0
    },
    tax: {
        type: Number,
        default: 0
    },
    shippingFee: {
        type: Number,
        default: 0
    },
    cancellationReason: {
        type: String
    },
    returnReason: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
