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

        next();
    } catch (error) {
        console.error("Error in fetchNavbarData middleware:", error);
        res.locals.navCategories = { men: [], women: [], kids: [], unisex: [] };
        next();
    }
};

module.exports = fetchNavbarData;
