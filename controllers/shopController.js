const Product = require('../models/Product');

exports.getShop = async (req, res) => {
    try {
        // Fetch all available products
        // In future we can add pagination and filtering here
        const products = await Product.find({ isAvailable: true }).sort({ createdAt: -1 });

        res.render('user/shop', {
            pageTitle: 'Shop All Products',
            products: products,
            activeMenu: 'home'
        });
    } catch (err) {
        console.error("Shop Error:", err);
        res.render('user/shop', {
            pageTitle: 'Shop',
            products: [],
            error: "Could not load products",
            activeMenu: 'home'
        });
    }
};
