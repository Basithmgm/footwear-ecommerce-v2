const Product = require('../models/Product');
const fs = require('fs');
const path = require('path');

// Helper to delete file
const deleteFile = (filePath) => {
    if (filePath) {
        fs.unlink(path.join(__dirname, '../public', filePath), (err) => {
            if (err) console.error("Error deleting file:", err);
        });
    }
};

// GET All Products
exports.getProducts = async (req, res) => {
    try {
        const products = await Product.find({ isDeleted: false }).sort({ createdAt: -1 });
        res.render('admin/product/list', {
            products,
            path: '/admin/products',
            success: req.session.successMessage || null,
            error: req.query.error
        });
        req.session.successMessage = null;
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=Server Error');
    }
};

const Category = require('../models/Category');

// GET Add Product
exports.getAddProduct = async (req, res) => {
    try {
        const categories = await Category.find({ isDeleted: false });
        res.render('admin/product/add', {
            path: '/admin/products',
            error: null,
            categories,
            oldInput: {}
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products?error=Server Error');
    }
};

// POST Add Product
exports.postAddProduct = async (req, res) => {
    try {
        const { productName, category, gender, regularPrice, salePrice, productDescription, stock, isAvailable } = req.body;

        // Fetch categories for error re-render
        const categories = await Category.find({ isDeleted: false });

        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            imageUrls = req.files.map(file => '/uploads/products/' + file.filename);
        }

        if (imageUrls.length < 3) {
            imageUrls.forEach(url => deleteFile(url));
            return res.render('admin/product/add', {
                path: '/admin/products',
                error: 'Minimum 3 images required',
                categories,
                oldInput: req.body
            });
        }

        await Product.create({
            productName,
            category,
            gender,
            regularPrice,
            salePrice,
            productDescription,
            productImages: imageUrls,
            stock,
            isAvailable: isAvailable === 'on'
        });

        req.session.successMessage = "Product added successfully";
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        const categories = await Category.find({ isDeleted: false });
        res.render('admin/product/add', {
            path: '/admin/products',
            error: 'Failed to add product: ' + err.message,
            categories,
            oldInput: req.body
        });
    }
};

// GET Edit Product
exports.getEditProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product || product.isDeleted) return res.redirect('/admin/products?error=Product not found');

        const categories = await Category.find({ isDeleted: false });

        res.render('admin/product/edit', {
            path: '/admin/products',
            product,
            categories,
            error: null
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products?error=Server Error');
    }
};

// POST Edit Product
exports.postEditProduct = async (req, res) => {
    try {
        const { productName, category, gender, regularPrice, salePrice, productDescription, stock, isAvailable } = req.body;
        const product = await Product.findById(req.params.id);

        if (!product) return res.redirect('/admin/products?error=Product not found');

        let imageUrls = product.productImages || [];

        // Handle deleted images
        if (req.body.deletedImages) {
            const deleted = Array.isArray(req.body.deletedImages) ? req.body.deletedImages : [req.body.deletedImages];
            imageUrls = imageUrls.filter(img => !deleted.includes(img));
            // Async delete from disk 
            deleted.forEach(img => deleteFile(img));
        }

        // If new images are uploaded, append them
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => '/uploads/products/' + file.filename);
            imageUrls = [...imageUrls, ...newImages];
        }

        product.productName = productName;
        product.category = category;
        product.gender = gender;
        product.regularPrice = regularPrice;
        product.salePrice = salePrice;
        product.productDescription = productDescription;
        product.stock = stock;
        product.isAvailable = isAvailable === 'on';
        product.productImages = imageUrls;

        await product.save();

        req.session.successMessage = "Product updated successfully";
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.redirect(`/admin/products/edit/${req.params.id}?error=Update Failed`);
    }
};

// Soft Delete Product
exports.deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.id, { isDeleted: true });
        req.session.successMessage = "Product deleted successfully";
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products?error=Delete Failed');
    }
};
