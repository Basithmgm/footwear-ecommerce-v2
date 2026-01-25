const uploadProduct = require("../config/multerProduct");
const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.get("/admin/products", productController.getProductList);
router.get("/admin/products/add", productController.getAddProduct);
router.post("/admin/products/add", uploadProduct.array("productImages", 5), productController.postAddProduct);

router.get("/admin/products/edit/:id", productController.getEditProduct);
router.post("/admin/products/edit/:id", uploadProduct.array("productImages", 5), productController.postEditProduct);

router.post("/admin/products/delete/:id", productController.softDeleteProduct);
router.post("/admin/products/toggle-block/:id", productController.toggleBlockProduct);

module.exports = router;
