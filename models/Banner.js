const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    },
    link: {
        type: String,
        default: '/shop'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Banner', bannerSchema, 'marquee');
