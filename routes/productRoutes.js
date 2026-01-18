const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const adminAuth = require('../middlewares/adminAuth');
const multer = require('multer');
const path = require('path');

// Multer Config for Products
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/products');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Routes
router.get('/admin/products', adminAuth, productController.getProducts);
router.get('/admin/products/add', adminAuth, productController.getAddProduct);
router.post('/admin/products/add', adminAuth, upload.array('productImages', 10), productController.postAddProduct);
router.get('/admin/products/edit/:id', adminAuth, productController.getEditProduct);
router.post('/admin/products/edit/:id', adminAuth, upload.array('productImages', 10), productController.postEditProduct);
router.post('/admin/products/delete/:id', adminAuth, productController.deleteProduct);

module.exports = router;
