const mongoose = require('mongoose');

const bannerSettingSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    description: String
}, { timestamps: true });

module.exports = mongoose.model('BannerSetting', bannerSettingSchema, 'marqueesettings');
