const express = require("express");
const router = express.Router();
const shopController = require("../controllers/shopController");
const walletController = require("../controllers/walletController");
const auth = require("../middlewares/authMiddleware");
const checkoutController = require("../controllers/checkoutController");

const noCache = require("../middlewares/noCache");

router.get("/shop", shopController.getShop);
router.get("/men", shopController.getShop);
router.get("/women", shopController.getShop);
router.get("/offers", shopController.getOffers);
router.get("/about", shopController.getAbout);
router.get("/contact", shopController.getContact);
router.get("/product/:id", shopController.getProductDetails);
router.get("/wallet", auth, walletController.getWallet);
router.post("/wallet/add-money", auth, walletController.createWalletOrder);
router.post("/wallet/verify-payment", auth, walletController.verifyWalletPayment);
router.post("/checkout/apply-coupon", auth, checkoutController.applyCoupon);
router.post("/checkout/remove-coupon", auth, checkoutController.removeCoupon);

module.exports = router;
