const uploadProduct = require("../config/multerProduct");
const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.get("/admin/products", productController.getProductList);
router.get("/admin/products/add", productController.getAddProduct);
// Wrapped middleware to catch Multer errors for ADD
router.post("/admin/products/add", (req, res, next) => {
    console.log("DEBUG ROUTE: Hit POST /admin/products/add");
    uploadProduct.any()(req, res, (err) => {
        if (err) {
            console.error("Multer/Upload Error (Add Product):", err);
            // Return 500 so frontend catch block handles it, or render the page with error
            // Since frontend uses fetch and document.write, sending text is okay.
            return res.status(500).send("Image Upload Error: " + err.message);
        }
        next();
    });
}, productController.postAddProduct);

router.get("/admin/products/edit/:id", productController.getEditProduct);
// Wrapped middleware to catch Multer errors
router.post("/admin/products/edit/:id", (req, res, next) => {
    uploadProduct.any()(req, res, (err) => {
        if (err) {
            console.error("Multer/Upload Error:", err);
            // Check for specific Multer errors if needed, but generic catch-all is better for now
            return res.status(500).send("Image Upload Error: " + err.message);
        }
        next();
    });
}, productController.postEditProduct);

router.post("/admin/products/delete/:id", productController.softDeleteProduct);
router.post("/admin/products/delete/:id", productController.softDeleteProduct);
router.post("/admin/products/toggle-block/:id", productController.toggleBlockProduct);

// Variant Management Routes
router.get("/admin/products/variants/:id", productController.getProductVariants);
router.post("/admin/products/variants/toggle-block/:productId/:variantId/:sizeId", productController.toggleVariantBlock);
router.post("/admin/products/variants/delete/:productId/:variantId/:sizeId", productController.deleteVariantSize);
router.post("/admin/products/variants/edit-size/:productId/:variantId/:sizeId", productController.editVariantSize);

module.exports = router;
