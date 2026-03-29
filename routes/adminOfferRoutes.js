const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const adminOfferController = require("../controllers/adminOfferController");

router.get("/admin/offers", auth, adminOfferController.getOffers);
router.get("/admin/offers/add", auth, adminOfferController.getAddOffer);
router.post("/admin/offers/add", auth, adminOfferController.addOffer);
router.delete(
  "/admin/offers/delete/:id",
  auth,
  adminOfferController.deleteOffer,
);
router.get("/admin/offers/edit/:id", auth, adminOfferController.getEditOffer);
router.post("/admin/offers/edit/:id", auth, adminOfferController.postEditOffer);

// Referral Offer routes
router.get("/admin/referral-offer", auth, adminOfferController.getReferralOffer);
router.post("/admin/referral-offer", auth, adminOfferController.updateReferralOffer);

module.exports = router;
