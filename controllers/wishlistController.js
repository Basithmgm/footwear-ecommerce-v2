const User = require("../models/User");
const Product = require("../models/Product");

// Get Wishlist Page
const getWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId).populate({
            path: 'wishlist',
            populate: { path: 'category' }
        });

        // Filter out nulls (deleted products)
        const validWishlist = user.wishlist.filter(item => item !== null);

        res.render("user/wishlist", {
            pageTitle: "My Wishlist",
            wishlist: validWishlist,
            activeMenu: 'shop' // Keep shop active or create new 'wishlist' menu item if desired
        });
    } catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).render("user/wishlist", {
            pageTitle: "My Wishlist",
            wishlist: [],
            activeMenu: 'shop',
            error: "Failed to load wishlist."
        });
    }
};

// Toggle Wishlist Item (Add/Remove)
const toggleWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { productId } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to add to wishlist" });
        }

        const user = await User.findById(userId);
        const index = user.wishlist.findIndex(id => id.toString() === productId);

        let added = false;
        if (index === -1) {
            // Add to wishlist
            user.wishlist.push(productId);
            added = true;
        } else {
            // Remove from wishlist
            user.wishlist.splice(index, 1);
            added = false;
        }

        await user.save();

        res.json({ success: true, added, message: added ? "The item added in to whishlist" : "The item removed from whishlist" });

    } catch (error) {
        console.error("Error toggling wishlist:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Remove from Wishlist (Explicit)
const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { productId } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login" });
        }

        await User.findByIdAndUpdate(userId, {
            $pull: { wishlist: productId }
        });

        res.json({ success: true, message: "Removed from Wishlist" });

    } catch (error) {
        console.error("Error removing from wishlist:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getWishlist,
    toggleWishlist,
    removeFromWishlist
};
