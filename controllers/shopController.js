const Product = require("../models/Product");
const Category = require("../models/Category");

const getShop = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const { search, sort, category, brand, minPrice, maxPrice, color } =
      req.query;

    // Detect if we are on a gender-specific route
    const path = req.path; // e.g., '/men' or '/women'
    let genderFilter = null;
    if (path === "/men") genderFilter = "Men";
    if (path === "/women") genderFilter = "Women";
    if (path === "/kids") genderFilter = "Kids"; // Future proofing

    // 1. Get Active Categories
    // If gender filter exist, we might want to ONLY prompt specific categories or let the generic fetch handle it and we filter later.
    // The fetchNavbarData middleware already fetched all active categories. We can re-use logic or fetch again if complex.
    // For shop page 'categories' list, we should filter by the current gender page context.

    let activeCategories = await Category.findActiveCategories();

    if (genderFilter) {
      activeCategories = activeCategories.filter(
        (c) => c.gender === genderFilter,
      );
    }

    // Filter out categories that have no valid products
    const validProductQuery = {
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] },
      variants: {
        $elemMatch: {
          sizes: { $elemMatch: { status: "Active", isBlocked: false } },
        },
      },
    };
    const categoriesWithProducts = await Product.distinct(
      "category",
      validProductQuery,
    );
    const categoriesWithProductsStrings = categoriesWithProducts.map((id) =>
      id.toString(),
    );

    const filteredCategories = activeCategories.filter((cat) =>
      categoriesWithProductsStrings.includes(cat._id.toString()),
    );

    const activeCategoryIds = filteredCategories.map((c) => c._id);

    // 2. Base Query
    const query = {
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] },
      category: { $in: activeCategoryIds }, // STRICT FILTERING
      variants: {
        $elemMatch: {
          sizes: { $elemMatch: { status: "Active", isBlocked: false } },
        },
      },
    };

    // Apply Gender Filter to Product Query indirectly via Categories (already done by strict filtering activeCategoryIds)
    // But if a product belongs to a category that is "Unisex", it should show up in both Men and Women?
    // OR we strictly strictly filter by the category's gender.
    // Our activeCategories list is already filtered by gender if genderFilter is set.
    // So `activeCategoryIds` only contains IDs of categories belonging to that gender.
    // This effectively filters products by gender.

    // 3. Search
    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { model: { $regex: search, $options: "i" } },
      ];
    }

    // 4. Filters
    if (category) {
      if (activeCategoryIds.some((id) => id.toString() === category)) {
        query.category = category;
        // Search the active categories to find the name of the one clicked
        const foundCategory = activeCategories.find(
          (c) => c._id.toString() === category,
        );
        if (foundCategory) {
          selectedCategoryName = foundCategory.name;
        }
      } else {
        query.category = category;
      }
    }

    if (brand) {
      const brandList = Array.isArray(brand) ? brand : [brand];
      query.brand = { $in: brandList };
    }

    if (color) {
      const colorList = Array.isArray(color) ? color : [color];
      query["variants.color"] = {
        $in: colorList.map((c) => new RegExp(c, "i")),
      };
    }

    if (minPrice || maxPrice) {
      query.salePrice = {};
      if (minPrice) query.salePrice.$gte = Number(minPrice);
      if (maxPrice) query.salePrice.$lte = Number(maxPrice);
    }

    // 5. Sort
    let sortOption = { createdAt: -1 };
    switch (sort) {
      case "priceLowHigh":
        sortOption = { salePrice: 1 };
        break;
      case "priceHighLow":
        sortOption = { salePrice: -1 };
        break;
      case "az":
        sortOption = { productName: 1 };
        break;
      case "za":
        sortOption = { productName: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
    }

    // 6. Fetch Products
    const products = await Product.find(query)
      .populate("category")
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const brands = await Product.distinct("brand", {
      category: { $in: activeCategoryIds },
      isDeleted: false,
      isBlocked: false,
    });
    const colors = await Product.distinct("variants.color", {
      category: { $in: activeCategoryIds },
      isDeleted: false,
      isBlocked: false,
    });

    res.render("user/shop", {
      pageTitle: selectedCategoryName || genderFilter || "Shop",
      products,
      currentPage: page,
      totalPages,
      totalProducts,
      activeMenu: genderFilter
        ? genderFilter === "Men"
          ? "men"
          : "women"
        : "shop", // Highlight "Men" or "Women" in navbar

      search: search || "",
      selectedSort: sort || "newest",
      selectedCategory: category || "",
      selectedBrand: Array.isArray(brand) ? brand : brand ? [brand] : [],
      selectedColor: Array.isArray(color) ? color : color ? [color] : [],
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",

      categories: filteredCategories, // Pass the filtered list
      brands,
      colors: colors.filter((c) => c),

      currentQuery: req.query,
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.status(500).render("user/shop", {
      pageTitle: "Shop",
      products: [],
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      activeMenu: "shop",
      error: "Failed to load products",
      search: "",
      selectedSort: "",
      selectedCategory: "",
      selectedBrand: [],
      selectedColor: [],
      minPrice: "",
      maxPrice: "",
      categories: [],
      brands: [],
      colors: [],
      currentQuery: {},
    });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    // Basic ID format validation
    if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(404).render("user/shop", {
        pageTitle: "Shop",
        products: [],
        currentPage: 1,
        totalPages: 1,
        totalProducts: 0,
        activeMenu: "shop",
        search: "",
        selectedSort: "",
        selectedCategory: "",
        selectedBrand: [],
        selectedColor: [],
        minPrice: "",
        maxPrice: "",
        categories: [],
        brands: [],
        colors: [],
        currentQuery: {},
        error: "Product not found.",
      });
    }

    // Fetch Product (ensure not soft-deleted or blocked)
    const product = await Product.findOne({
      _id: productId,
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] }, // Allow Out of Stock for badge, but block others
    }).populate({
      path: "category",
      populate: { path: "parentCategory" },
    });

    if (!product) {
      console.log("Product not found or blocked:", productId);
      return res.redirect("/shop");
    }

    // Fetch Related Products (Same category, excluding current product, only valid ones)
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isBlocked: false,
      variants: {
        $elemMatch: {
          sizes: { $elemMatch: { status: "Active", isBlocked: false } },
        },
      },
    })
      .limit(4)
      .populate("category");

    const productDataJson = JSON.stringify(product || {}).replace(
      /</g,
      "\\u003c",
    );

    const isGlobalSoldOut =
      product.status === "Out of Stock" || product.totalStock <= 0;

    // DEBUG: Check user wishlist state
    if (req.user) {
      console.log(
        `DEBUG: ProductDetail - UserID: ${req.user._id}, Wishlist Count: ${req.user.wishlist ? req.user.wishlist.length : "undefined"}`,
      );
      if (req.user.wishlist) {
        const inWishlist = req.user.wishlist.some(
          (id) => id.toString() === productId,
        );
        console.log(`DEBUG: Product ${productId} in wishlist? ${inWishlist}`);
      }
    }

    res.render("user/product-detail", {
      pageTitle: product.productName,
      product,
      productDataJson,
      relatedProducts,
      activeMenu: "shop",
      user: req.user,
      isGlobalSoldOut,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.status(500).redirect("/shop");
  }
};

module.exports = {
  getShop,
  getProductDetails,
};
