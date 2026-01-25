const mongoose = require('mongoose');
const Product = require('./models/Product');
const productController = require('./controllers/productController');

console.log("Loading Product Model...");

try {
    const ProductModel = mongoose.model('Product');
    console.log("Product Model loaded successfully.");

    // Create a mock product to test validation
    const validProduct = new ProductModel({
        productName: "Test Shoe",
        description: "A test shoe",
        category: new mongoose.Types.ObjectId(), // Fake ID
        regularPrice: 100,
        salePrice: 80,
        variants: [{
            color: "Red",
            variantImages: ["img1.jpg", "img2.jpg", "img3.jpg"],
            sizes: [{ size: 8, quantity: 10 }]
        }]
    });

    console.log("Validating mock product...");
    const err = validProduct.validateSync();
    if (err) {
        console.error("Validation failed (unexpected):", err);
    } else {
        console.log("Validation passed for correct structure.");
    }

    // Test invalid product (missing images)
    const invalidProduct = new ProductModel({
        productName: "Bad Shoe",
        variants: [{
            color: "Blue",
            variantImages: ["img1.jpg"], // Too few
            sizes: []
        }]
    });

    const err2 = invalidProduct.validateSync();
    if (err2 && err2.errors['variants.0.variantImages']) {
        console.log("Validation correctly caught missing images:", err2.errors['variants.0.variantImages'].message);
    } else {
        console.error("Validation FAILED to catch missing images.");
    }

} catch (e) {
    console.error("Model loading failed:", e);
}

console.log("Checking Controller Syntax...");
if (productController.postAddProduct) {
    console.log("Controller loaded and postAddProduct exists.");
} else {
    console.error("Controller missing postAddProduct.");
}
