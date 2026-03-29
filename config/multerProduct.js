const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");
const Category = require("../models/Category");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folderPath = "Footwear/products/uncategorized";
    
    if (req.body.category) {
      try {
        const category = await Category.findById(req.body.category).populate("parentCategory");
        if (category) {
          const gender = category.gender.toLowerCase();
          const cleanName = (name) =>
            name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

          if (category.parentCategory) {
            const child = cleanName(category.name);
            const parent = cleanName(category.parentCategory.name);
            folderPath = `Footwear/products/${gender}/${parent}/${child}`;
          } else {
            const name = cleanName(category.name);
            folderPath = `Footwear/products/${gender}/${name}`;
          }
        }
      } catch (err) {
        console.error("Error generating Cloudinary folder path:", err);
      }
    }

    const publicId = Date.now() + "-" + file.originalname.replace(/\.[^/.]+$/, "");
    
    return {
      folder: folderPath,
      public_id: publicId,
      allowed_formats: ["jpg", "png", "jpeg", "webp"],
      transformation: [{ width: 1000, height: 1000, crop: "limit" }],
    };
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only images allowed"), false);
  }
};

const uploadProduct = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = uploadProduct;
