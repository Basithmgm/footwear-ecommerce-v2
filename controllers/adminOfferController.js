const Offer = require("../models/Offer");
const Product = require("../models/Product");
const Category = require("../models/Category");
const ReferralOffer = require("../models/ReferralOffer");

// Render the Offers List Page
exports.getOffers = async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate("targetId")
      .sort({ createdAt: -1 });
    res.render("admin/offers/list", {
      pageTitle: "Manage Offers",
      path: "/admin/offers",
      offers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};
// Render the Add Offer Page
exports.getAddOffer = async (req, res) => {
  try {
    const products = await Product.find({ isDeleted: false });
    const categories = await Category.find({ isDeleted: false });

    res.render("admin/offers/add", {
      pageTitle: "Add New Offer",
      path: "/admin/offers",
      products,
      categories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

// Create the Offer and mathematically sync it to the Target
exports.addOffer = async (req, res) => {
  try {
    const { name, offerType, targetId, discountType, discountValue, expiresAt } =
      req.body;

    if (discountType === "Percentage" && Number(discountValue) > 50) {
      return res.status(400).json({
        success: false,
        message: "Offer percentage cannot exceed 50%.",
      });
    }
    // 1. Save the Offer to our central tracking model
    const newOffer = new Offer({
      name,
      offerType,
      targetId,
      targetModel: offerType, // 'Product' or 'Category'
      discountType,
      discountValue,
      expiresAt,
    });
    await newOffer.save();

    // 2. Sync the Offer data to the Product or Category
    const updateData = {
      offerType: discountType,
      offerValue: discountValue,
      offerPercentage: (discountType === "Percentage") ? discountValue : 0
    };

    if (offerType === "Product") {
      await Product.findByIdAndUpdate(targetId, updateData);
    } else if (offerType === "Category") {
      await Category.findByIdAndUpdate(targetId, updateData);
    }
    res.json({
      success: true,
      message: "Offer successfully created and synced!",
    });
  } catch (error) {
    console.error("Add Offer Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// Render the Edit Offer Page
exports.getEditOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) {
      return res.redirect("/admin/offers");
    }

    // Pass the name of the target for the readonly display
    let targetName = "";
    if (offer.offerType === "Product") {
      const p = await Product.findById(offer.targetId);
      targetName = p ? (p.productName || (p.brand + ' ' + p.model)) : "Unknown Product";
    } else {
      const c = await Category.findById(offer.targetId);
      targetName = c ? c.name : "Unknown Category";
    }

    res.render("admin/offers/edit", {
      pageTitle: "Edit Offer",
      path: "/admin/offers",
      offer,
      targetName
    });
  } catch (error) {
    console.error("Get Edit Offer Error:", error);
    res.redirect("/admin/offers");
  }
};

// Update the Offer and mathematically re-sync it to the Target
exports.postEditOffer = async (req, res) => {
  try {
    const { name, discountType, discountValue, expiresAt } = req.body;

    if (discountType === "Percentage" && Number(discountValue) > 50) {
      return res.status(400).json({
        success: false,
        message: "Offer percentage cannot exceed 50%.",
      });
    }
    const offer = await Offer.findById(req.params.id);
    
    if (!offer) {
      return res.status(404).json({ success: false, message: "Offer not found." });
    }

    offer.name = name;
    offer.discountType = discountType;
    offer.discountValue = discountValue;
    offer.expiresAt = expiresAt;
    await offer.save();

    // Sync the updated data to the Product or Category
    const updateData = {
      offerType: discountType,
      offerValue: discountValue,
      offerPercentage: (discountType === "Percentage") ? discountValue : 0
    };

    if (offer.offerType === "Product") {
      await Product.findByIdAndUpdate(offer.targetId, updateData);
    } else if (offer.offerType === "Category") {
      await Category.findByIdAndUpdate(offer.targetId, updateData);
    }
    
    res.json({
      success: true,
      message: "Offer successfully updated and synced!",
    });
  } catch (error) {
    console.error("Edit Offer Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// Delete the Offer and remove the synced percentage
exports.deleteOffer = async (req, res) => {
  try {
    const offerId = req.params.id;
    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res
        .status(404)
        .json({ success: false, message: "Offer not found." });
    }
    // First remove the synced percentage from the Product or Category
    const resetData = { 
      offerPercentage: 0,
      offerType: "Percentage",
      offerValue: 0
    };
    if (offer.offerType === "Product") {
      await Product.findByIdAndUpdate(offer.targetId, resetData);
    } else if (offer.offerType === "Category") {
      await Category.findByIdAndUpdate(offer.targetId, resetData);
    }
    // Now safely delete the Offer entirely
    await Offer.findByIdAndDelete(offerId);
    res.json({
      success: true,
      message: "Offer deleted and Product/Category reset!",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete offer." });
  }
};

// ==========================================
// REFERRAL OFFERS (Global Settings)
// ==========================================

exports.getReferralOffer = async (req, res) => {
  try {
    let referralOffer = await ReferralOffer.findOne();
    if (!referralOffer) {
      // Create a default one if it doesn't exist
      referralOffer = await ReferralOffer.create({
        isActive: false,
        referrerReward: 100, // default placeholder
        refereeReward: 50, // default placeholder
      });
    }

    const successMessage = req.session.successMessage || null;
    const errorMessage = req.session.errorMessage || null;
    delete req.session.successMessage;
    delete req.session.errorMessage;

    res.render("admin/offers/referral", {
      pageTitle: "Manage Referral Offer",
      path: "/admin/referral-offer",
      referralOffer,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error("Get Referral Offer Error:", error);
    res.status(500).send("Server Error");
  }
};

exports.updateReferralOffer = async (req, res) => {
  try {
    const { isActive, referrerReward, refereeReward, title, description } = req.body;
    
    let referralOffer = await ReferralOffer.findOne();
    if (!referralOffer) {
      referralOffer = new ReferralOffer();
    }

    referralOffer.isActive = isActive === "on" || isActive === true;
    referralOffer.referrerReward = Number(referrerReward) || 0;
    referralOffer.refereeReward = Number(refereeReward) || 0;
    if (title !== undefined) referralOffer.title = title;
    if (description !== undefined) referralOffer.description = description;

    await referralOffer.save();

    req.session.successMessage = "Referral Offer updated successfully!";
    res.redirect("/admin/referral-offer");
  } catch (error) {
    console.error("Update Referral Offer Error:", error);
    req.session.errorMessage = "Failed to update Referral Offer.";
    res.redirect("/admin/referral-offer");
  }
};
