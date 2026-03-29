const Coupon = require("../models/Coupon");

exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.render("admin/coupons/list", {
      pageTitle: "Manage Coupons",
      path: "/admin/coupons",
      coupons,
      successMessage: req.session.successMessage || null,
      errorMessage: req.session.errorMessage || null,
    });
    delete req.session.successMessage;
    delete req.session.errorMessage;
  } catch (error) {
    console.error("Get Coupons Error:", error);
    res.status(500).send("Server Error");
  }
};

exports.getAddCoupon = (req, res) => {
  res.render("admin/coupons/add", {
    pageTitle: "Add Coupon",
    path: "/admin/coupons",
    errorMessage: req.session.errorMessage || null,
    oldInput: req.session.oldInput || {},
  });
  delete req.session.errorMessage;
  delete req.session.oldInput;
};

exports.postAddCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, minPurchaseAmount, expiresAt, usageLimit } = req.body;
    
    if (Number(discountValue) < 0 || Number(minPurchaseAmount) < 0) {
      req.session.errorMessage = "Values cannot be negative.";
      req.session.oldInput = req.body;
      return res.redirect("/admin/coupons/add");
    }

    if (new Date(expiresAt) < new Date()) {
      req.session.errorMessage = "Expiration date cannot be in the past.";
      req.session.oldInput = req.body;
      return res.redirect("/admin/coupons/add");
    }

    if (discountType === "Percentage" && Number(discountValue) > 100) {
      req.session.errorMessage = "Percentage discount cannot exceed 100.";
      req.session.oldInput = req.body;
      return res.redirect("/admin/coupons/add");
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      req.session.errorMessage = "Coupon code already exists.";
      req.session.oldInput = req.body;
      return res.redirect("/admin/coupons/add");
    }

    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      discountType,
      discountValue: Number(discountValue),
      minPurchaseAmount: Number(minPurchaseAmount) || 0,
      expiresAt,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      isActive: true, // Default to true on creation
    });

    await newCoupon.save();
    req.session.successMessage = "Coupon created successfully!";
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Add Coupon Error:", error);
    req.session.errorMessage = "Failed to add coupon.";
    req.session.oldInput = req.body;
    res.redirect("/admin/coupons/add");
  }
};

exports.getEditCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      req.session.errorMessage = "Coupon not found";
      return res.redirect("/admin/coupons");
    }
    res.render("admin/coupons/edit", {
      pageTitle: "Edit Coupon",
      path: "/admin/coupons",
      coupon,
      errorMessage: req.session.errorMessage || null,
    });
    delete req.session.errorMessage;
  } catch (error) {
    console.error("Get Edit Coupon Error:", error);
    res.redirect("/admin/coupons");
  }
};

exports.postEditCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const { discountType, discountValue, minPurchaseAmount, expiresAt, usageLimit } = req.body;
    
    if (Number(discountValue) <= 0 || Number(minPurchaseAmount) < 0) {
      req.session.errorMessage = "Values cannot be negative.";
      return res.redirect(`/admin/coupons/edit/${couponId}`);
    }

    if (discountType === "Percentage" && Number(discountValue) > 100) {
      req.session.errorMessage = "Percentage discount cannot exceed 100.";
      return res.redirect(`/admin/coupons/edit/${couponId}`);
    }

    if (new Date(expiresAt) < new Date()) {
      req.session.errorMessage = "Expiration date cannot be in the past.";
      return res.redirect(`/admin/coupons/edit/${couponId}`);
    }

    await Coupon.findByIdAndUpdate(couponId, {
      discountType,
      discountValue: Number(discountValue),
      minPurchaseAmount: Number(minPurchaseAmount) || 0,
      expiresAt: new Date(expiresAt),
      usageLimit: usageLimit ? Number(usageLimit) : null,
    });

    req.session.successMessage = "Coupon updated successfully!";
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Post Edit Coupon Error:", error);
    req.session.errorMessage = "Failed to update coupon.";
    res.redirect(`/admin/coupons/edit/${req.params.id}`);
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }
    
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    
    res.json({ success: true, isActive: coupon.isActive, message: coupon.isActive ? "Coupon Activated" : "Coupon Deactivated" });
  } catch (error) {
    console.error("Toggle Coupon Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    await Coupon.findByIdAndDelete(couponId);
    res.json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Delete Coupon Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
