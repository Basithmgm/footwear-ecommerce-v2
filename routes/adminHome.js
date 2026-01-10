//Admin uploads a file (e.g., hero banner) via form multipart/form-data
const express = require("express");
const router = express.Router();
const upload = require("../config/multer");
const HomeBanner = require("../models/HomeBanner");

// POST /admin/home/banner
router.post("/banner", upload.single("image"), async (req, res) => {
  try {
    // multer-storage-cloudinary puts info in req.file
    const { path, filename } = req.file; // path = secure_url, filename = public_id

    const banner = await HomeBanner.findOneAndUpdate(
      { title: "main-hero" }, // or use _id if multiple
      {
        title: "main-hero",
        image: {
          publicId: filename,
          url: path,
        },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, banner });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

module.exports = router;
