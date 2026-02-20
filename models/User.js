const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  full_name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true
  },
  phone_number: {
    type: String
  },
  image: {
    type: String,
    default: '/images/default-avatar.jpg'
  },
  role_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    // required: true // Can't start as required if we need to migrate or seed, but logic should enforce it
  },
  status: {
    type: String,
    enum: ['Active', 'Blocked'],
    default: 'Active'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  last_login_at: {
    type: Date
  },
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }]
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'users'
});

module.exports = mongoose.model("User", userSchema);
