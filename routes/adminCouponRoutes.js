const express = require("express");
const router = express.Router();
const adminCouponController = require("../controllers/adminCouponController");
const auth = require("../middlewares/authMiddleware"); // Or the exact path string they use

router.get("/admin/coupons", auth, adminCouponController.getCoupons);
router.get("/admin/coupons/add", auth, adminCouponController.getAddCoupon);
router.post("/admin/coupons/add", auth, adminCouponController.postAddCoupon);
router.get("/admin/coupons/edit/:id", auth, adminCouponController.getEditCoupon);
router.post("/admin/coupons/edit/:id", auth, adminCouponController.postEditCoupon);
router.patch("/admin/coupons/toggle/:id", auth, adminCouponController.toggleStatus);
router.delete("/admin/coupons/delete/:id", auth, adminCouponController.deleteCoupon);

module.exports = router;
