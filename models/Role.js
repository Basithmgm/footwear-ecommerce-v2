const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
    role_name: {
        type: String,
        enum: ['user', 'admin'],
        required: true,
        unique: true
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'user_roles'
});

module.exports = mongoose.model("Role", roleSchema);
