const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");
const Category = require("../models/Category");

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        try {
            let folderPath = "Footwear/products";

            if (req.body.category) {
                const category = await Category.findById(req.body.category).populate('parentCategory');

                if (category) {
                    const gender = category.gender.toLowerCase();
                    const cleanName = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

                    if (category.parentCategory) {
                        // It's a subcategory (or child if we had 3 levels, but assuming 2 levels max for now + gender).
                        // Check if parent has a parent (Grandparent) to strictly follow "gender/parent-category/child-category"
                        // Based on schema `level` 0=Main, 1=Sub, 2=Child.
                        // If category is Level 2 (Child)
                        if (category.parentCategory.parentCategory) {
                            // Need to fetch grandparent? Schema populate is only one level deep here.
                            // But typical path: Gender -> Parent -> Child
                            // If `category` is Child, `category.parentCategory` is Sub. `category.parentCategory.parentCategory` is Main?
                            // Actually, let's look at schema logic.
                            // 0: Main (Gender-based) ? No, schema says `level: 0`.
                            // Wait, schema says `gender` is a field. So `level 0` is "Men -> Shoes". `level 1` is "Men -> Shoes -> Sneakers"?
                            // Let's stick to the prompt: "footwear/product/gender/parent-category/child-category"

                            // If `category` is the one selected in form.
                            const child = cleanName(category.name);
                            const parent = cleanName(category.parentCategory.name);

                            // If there is a grandparent, let's try to find it, but `populate('parentCategory')` only gives us Parent.
                            // If the structure is strictly Gender -> Parent -> Child, then the selected category is Child.

                            folderPath = `Footwear/products/${gender}/${parent}/${child}`;
                        } else {
                            // Only Parent -> Child (where Parent has no parent)
                            const child = cleanName(category.name);
                            const parent = cleanName(category.parentCategory.name);
                            folderPath = `Footwear/products/${gender}/${parent}/${child}`;
                        }
                    } else {
                        // Top level category selected
                        const name = cleanName(category.name);
                        folderPath = `Footwear/products/${gender}/${name}`;
                    }
                }
            }

            return {
                folder: folderPath,
                allowed_formats: ["jpg", "png", "jpeg", "webp"],
                transformation: [{ width: 1000, height: 1000, crop: "limit" }],
                public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`
            };
        } catch (error) {
            console.error("Error generating Cloudinary folder path:", error);
            // Fallback
            return {
                folder: "Footwear/products/uncategorized",
                allowed_formats: ["jpg", "png", "jpeg", "webp"],
            };
        }
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
