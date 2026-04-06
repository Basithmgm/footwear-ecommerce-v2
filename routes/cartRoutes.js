const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const noCache = require("../middlewares/noCache");

router.get("/", noCache, cartController.getCart);
router.get("/count", cartController.getCartCount);
router.post("/add", cartController.addToCart);
router.post("/update-quantity", cartController.updateQuantity);
router.post("/remove", cartController.removeFromCart);
module.exports = router;
