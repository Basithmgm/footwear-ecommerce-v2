const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    full_address: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true
    },
    zip_code: {
        type: String,
        required: true
    },
    phone_number: {
        type: String,
        required: true
    },
    is_default: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: false, // Not explicitly requested, but usually good practice. User didn't ask for it in address description though.
    collection: 'shipping_address'
});

module.exports = mongoose.model("Address", addressSchema);
