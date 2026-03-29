const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");

// Set storage engine
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "Footwear/profiles", // Keeping original folder structure, but using params
    allowed_formats: ["jpg", "png", "jpeg", "webp"], // Renamed and moved to params
    transformation: [{ width: 500, height: 500, crop: "limit" }],
  },
});

// Init upload
const uploadProfile = multer({
  storage: storage,
  limits: { fileSize: 2000000 }, // 2MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Error: Images Only!"));
    }
  },
});

module.exports = uploadProfile;
