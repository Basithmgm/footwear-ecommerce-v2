const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    productName: {
      type: String,
      required: false, // Auto-generated from Brand + Model
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
      required: false, // Calculated from variants (min or range)
    },
    salePrice: {
      type: Number,
      required: false, // Calculated from variants
    },
    variants: [
      {
        color: {
          type: String,
          required: true,
          trim: true,
        },
        colorImage: {
          type: String, // Path to the small color representation image
          required: true,
        },
        variantImages: {
          type: [String], // Array of gallery images
          required: true,
          validate: [arrayLimit, "{PATH} must have at least 3 images"],
        },
        orderLimit: {
          type: Number,
          default: 5,
          min: [1, "Order limit must be at least 1"],
        },
        sizes: [
          {
            size: {
              type: Number,
              required: true,
            },
            quantity: {
              type: Number,
              required: true,
              min: 0,
            },
            sku: {
              type: String,
              required: true,
              trim: true,
            },
            regularPrice: {
              type: Number,
              required: true,
              min: 0,
            },
            salePrice: {
              type: Number,
              required: true,
              min: 0,
            },
            isBlocked: {
              type: Boolean,
              default: false,
            },
            status: {
              type: String,
              enum: ["Active", "Inactive", "Draft"],
              default: "Active",
            },
            updatedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
      },
    ],
    totalStock: {
      type: Number,
      default: 0,
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
    status: {
      type: String,
      enum: [
        "Available",
        "Out of Stock",
        "Discontinued",
        "Unavailable",
        "Inactive",
      ],
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
  },
  { timestamps: true },
);

function arrayLimit(val) {
  return val.length >= 3;
}

module.exports = mongoose.model("Product", productSchema);
