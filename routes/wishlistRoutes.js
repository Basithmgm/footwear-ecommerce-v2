const express = require("express");
const router = express.Router();
const wishlistController = require("../controllers/wishlistController");
const noCache = require("../middlewares/noCache");

// Use middleware to check if user is logged in for these routes?
// app.js seems to handle user loading globally, but doesn't block routes.
// The controller handles the check, which is fine for now.

router.get("/wishlist", noCache, wishlistController.getWishlist);
router.post("/wishlist/toggle", wishlistController.toggleWishlist);
router.post("/wishlist/remove", wishlistController.removeFromWishlist);

module.exports = router;
