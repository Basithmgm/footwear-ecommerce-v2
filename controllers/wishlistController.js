const Product = require("../models/Product");
const Category = require("../models/Category");
const User = require("../models/User");

// Get Wishlist Page
const getWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId).populate({
            path: 'wishlist.productId',
            populate: { path: 'category' }
        });

        // Filter out nulls and map to a clean object list
        const wishlistItems = user.wishlist.filter(item => item.productId !== null);

        // ==== OFFER MATH CALCULATION (Wishlist) ====
        const activeCategories = await Category.findActiveCategories();
        
        const getCategoryOffer = (catId) => {
            let currentCat = activeCategories.find(c => c._id.toString() === catId.toString());
            let bestOffer = { type: 'Percentage', value: 0 };
            
            while (currentCat) {
                const currentVal = currentCat.offerValue || 0;
                const currentType = currentCat.offerType || 'Percentage';
                
                // Compare relative value (on a 1000 unit baseline)
                const bestEq = bestOffer.type === 'Percentage' ? bestOffer.value * 10 : bestOffer.value;
                const currEq = currentType === 'Percentage' ? currentVal * 10 : currentVal;

                if (currEq > bestEq) {
                    bestOffer = { type: currentType, value: currentVal };
                }

                if (currentCat.parentCategory) {
                    currentCat = activeCategories.find(c => c._id.toString() === currentCat.parentCategory.toString());
                } else {
                    break;
                }
            }
            return bestOffer;
        };

        const parsedWishlist = wishlistItems.map(item => {
            let pObj = item.productId.toObject();
            const pOption = { type: pObj.offerType || 'Percentage', value: pObj.offerValue || 0 };
            const cOption = pObj.category ? getCategoryOffer(pObj.category._id) : { type: 'Percentage', value: 0 };

            const getPrice = (price, offer) => {
                if (offer.type === 'Percentage') {
                    return price - (price * (offer.value / 100));
                } else {
                    return Math.max(0, price - offer.value);
                }
            };

            const pPrice = getPrice(pObj.salePrice, pOption);
            const cPrice = getPrice(pObj.salePrice, cOption);

            if (pPrice < pObj.salePrice || cPrice < pObj.salePrice) {
                pObj.hasOffer = true;
                const bestPrice = Math.min(pPrice, cPrice);
                pObj.discountedPrice = Math.round(bestPrice);
                pObj.offerDiscount = Math.round(((pObj.salePrice - bestPrice) / pObj.salePrice) * 100);
            } else {
                pObj.hasOffer = false;
                pObj.discountedPrice = pObj.salePrice;
            }
            
            // Inject the selected size into the product object for the view
            pObj.wishlistSize = item.size;
            return pObj;
        });
        // ===========================================

        res.render("user/wishlist", {
            pageTitle: "My Wishlist",
            wishlist: parsedWishlist,
            activeMenu: 'shop'
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
        const { productId, size } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to add to wishlist" });
        }

        const user = await User.findById(userId);
        const index = user.wishlist.findIndex(item => item.productId.toString() === productId);

        let added = false;
        if (index === -1) {
            // Add to wishlist
            if (!size) {
                 return res.status(400).json({ success: false, message: "Size is required" });
            }
            user.wishlist.push({ productId, size });
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
            $pull: { wishlist: { productId: productId } }
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
