const Category = require("../models/Category");

const fetchNavbarData = async (req, res, next) => {
    try {
        // Fetch all active categories (using the existing static method that handles blocking logic)
        const activeCategories = await Category.findActiveCategories();

        // Group by gender
        const navCategories = {
            men: activeCategories.filter(c => c.gender === 'Men'),
            women: activeCategories.filter(c => c.gender === 'Women'),
            kids: activeCategories.filter(c => c.gender === 'Kids'),
            unisex: activeCategories.filter(c => c.gender === 'Unisex')
        };

        // Attach to res.locals for EJS views
        res.locals.navCategories = navCategories;

        // Fetch Cart Count if User is Logged In
        let cartCount = 0;
        if (req.session && req.session.userId) {
            try {
                const Cart = require("../models/Cart");
                const cart = await Cart.findOne({ userId: req.session.userId });
                if (cart && cart.items) {
                    cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);
                }
            } catch (cartError) {
                console.error("Error fetching cart count:", cartError);
            }
        }
        res.locals.cartCount = cartCount;

        next();
    } catch (error) {
        console.error("Error in fetchNavbarData middleware:", error);
        res.locals.navCategories = { men: [], women: [], kids: [], unisex: [] };
        res.locals.cartCount = 0;
        next();
    }
};

module.exports = fetchNavbarData;
