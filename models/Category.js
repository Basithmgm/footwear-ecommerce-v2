const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ["Men", "Women", "Kids", "Unisex"],
      required: true,
      index: true,
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    level: {
      type: Number,
      required: true,
      default: 0, // 0: Main (Gender-based), 1: Subcategory, 2: Child Category
    },
    description: {
      type: String,
      trim: true,
    },
    offerPercentage: {
      type: Number,
      default: 0,
    },
    offerType: {
      type: String,
      enum: ["Percentage", "Fixed Amount"],
      default: "Percentage",
    },
    offerValue: {
      type: Number,
      default: 0,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    // We can keep soft delete if desired, or remove it as per 'clean slate' request.
    // Keeping it is safer for data integrity.
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Static method to find Categories respecting cascade blocking (User Side)
categorySchema.statics.findActiveCategories = function () {
  return this.aggregate([
    // 1. Filter out self-blocked
    { $match: { isBlocked: false, isDeleted: false } },

    // 2. Lookup Parent
    {
      $lookup: {
        from: "categories",
        localField: "parentCategory",
        foreignField: "_id",
        as: "parent",
      },
    },
    { $unwind: { path: "$parent", preserveNullAndEmptyArrays: true } },

    // 3. Lookup Grandparent (to handle Level 2 blocked by Level 0)
    {
      $lookup: {
        from: "categories",
        localField: "parent.parentCategory",
        foreignField: "_id",
        as: "grandparent",
      },
    },
    { $unwind: { path: "$grandparent", preserveNullAndEmptyArrays: true } },

    // 4. Filter if Parent OR Grandparent is blocked
    {
      $match: {
        "parent.isBlocked": { $ne: true },
        "grandparent.isBlocked": { $ne: true },
      },
    },

    // 5. Clean up temporary fields
    {
      $project: { parent: 0, grandparent: 0 },
    },
  ]);
};

// Compound unique index: Name must be unique within the same parent AND gender
categorySchema.index(
  { name: 1, parentCategory: 1, gender: 1 },
  { unique: true },
);

module.exports = mongoose.model("Category", categorySchema);
