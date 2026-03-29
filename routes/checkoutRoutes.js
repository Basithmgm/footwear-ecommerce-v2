const express = require("express");
const router = express.Router();
const checkoutController = require("../controllers/checkoutController");
const razorpayController = require("../controllers/razorpayController");
const noCache = require("../middlewares/noCache");
const auth = require("../middlewares/authMiddleware");

router.get("/", auth, noCache, checkoutController.getCheckout);

router.post("/place-order", checkoutController.placeOrder);
router.get("/success/:orderId", checkoutController.getOrderSuccess);
router.get("/failure", checkoutController.getOrderFailure);
router.post("/add-address", checkoutController.addAddress);
router.post("/apply-coupon", auth, checkoutController.applyCoupon);
router.post("/remove-coupon", auth, checkoutController.removeCoupon);

// Razorpay Routes
router.post("/razorpay/create-order", auth, razorpayController.createOrder);
router.post("/razorpay/verify-payment", auth, razorpayController.verifyPayment);
router.post("/razorpay/retry-payment", auth, razorpayController.retryPaymentOrder);

module.exports = router;
