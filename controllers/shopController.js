const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");

const getShop = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const { search, sort, category, brand, minPrice, maxPrice, color, gender } =
      req.query;

    // Detect if we are on a gender-specific route or have a gender query
    const path = req.path; // e.g., '/men' or '/women'
    let genderFilter = gender || null;
    if (!genderFilter) {
      if (path === "/men") genderFilter = "Men";
      if (path === "/women") genderFilter = "Women";
      if (path === "/kids") genderFilter = "Kids";
    }

    // 1. Get Active Categories
    let activeCategoriesList = await Category.findActiveCategories();

    if (genderFilter) {
      activeCategoriesList = activeCategoriesList.filter((c) => 
        c.gender === genderFilter || c.gender === "Unisex"
      );
    }

    const activeCategoryIds = activeCategoriesList.map((c) => c._id);

    // Filter categories for the sidebar based on product presence (Strict Global Filter)
    const categoriesInUse = await Product.distinct("category", {
      category: { $in: activeCategoryIds },
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] },
    });
    
    let sidebarCategories = activeCategoriesList.filter((c) =>
      categoriesInUse.some((inUseId) => inUseId.toString() === c._id.toString()),
    );

    // Context-specific refinements
    if (genderFilter) {
      // Also hide the top-level gender entry for cleaner look if on a gender page
      sidebarCategories = sidebarCategories.filter(
        (c) => !(c.level === 0 && c.gender === genderFilter),
      );
    }

    // 2. Base Aggregation Pipeline
    let pipeline = [
      {
        $match: {
          isDeleted: false,
          isBlocked: false,
          status: { $in: ["Available", "Out of Stock"] },
          category: { $in: activeCategoryIds },
        },
      },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.sizes": {
            $elemMatch: { status: "Active", isBlocked: false },
          },
        },
      },
    ];

    // ... (rest of search/filter pipeline)

    // 3. Search (Update pipeline)
    if (search) {
      // Escape regex special characters to prevent errors
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(safeSearch, "i");

      const matchedCats = activeCategoriesList.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      );
      const matchedCatIds = matchedCats.map((c) => c._id);

      pipeline.push({
        $match: {
          $or: [
            { productName: searchRegex },
            { description: searchRegex },
            { brand: searchRegex },
            { model: searchRegex },
            { category: { $in: matchedCatIds } },
            { "variants.color": searchRegex },
          ],
        },
      });
    }

    // 4. Filters (Update pipeline)
    let selectedCategoryName = null;
    if (category) {
      const catId = new mongoose.Types.ObjectId(category);
      pipeline.push({ $match: { category: catId } });
      const foundCategory = activeCategoriesList.find(
        (c) => c._id.toString() === category,
      );
      if (foundCategory) {
        selectedCategoryName = foundCategory.name;
      }
    }

    if (brand) {
      const brandList = Array.isArray(brand) ? brand : [brand];
      pipeline.push({ $match: { brand: { $in: brandList } } });
    }

    if (color) {
      const colorList = Array.isArray(color) ? color : [color];
      pipeline.push({
        $match: {
          "variants.color": {
            $in: colorList.map((c) => new RegExp(c, "i")),
          },
        },
      });
    }

    if (minPrice || maxPrice) {
      const priceQuery = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);
      pipeline.push({ $match: { salePrice: priceQuery } });
    }

    // 5. Total Count for Pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / limit);

    // 6. Sort
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
    pipeline.push({ $sort: sortOption });

    // 7. Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // 8. Final Fetch with Category Join
    pipeline.push({
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryDoc",
      },
    });
    pipeline.push({ $unwind: "$categoryDoc" });

    const variantItems = await Product.aggregate(pipeline);

    // 9. Process sidebar options (Distinct)
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

    // 10. OFFER MATH & FORMATTING
    const getCategoryOffer = (catId) => {
      let currentCat = activeCategoriesList.find(
        (c) => c._id.toString() === catId.toString(),
      );
      let bestOffer = { type: "Percentage", value: 0 };
      
      while (currentCat) {
        // Compare based on hypothetical discount on a standard 1000 unit price to find "Better"
        const currentVal = currentCat.offerValue || 0;
        const currentType = currentCat.offerType || "Percentage";
        
        const bestEquivalent = bestOffer.type === "Percentage" ? bestOffer.value * 10 : bestOffer.value;
        const currentEquivalent = currentType === "Percentage" ? currentVal * 10 : currentVal;

        if (currentEquivalent > bestEquivalent) {
          bestOffer = { type: currentType, value: currentVal };
        }

        if (currentCat.parentCategory) {
          currentCat = activeCategoriesList.find(
            (c) => c._id.toString() === currentCat.parentCategory.toString(),
          );
        } else {
          break;
        }
      }
      return bestOffer;
    };

    const parsedProducts = variantItems.map((vItem) => {
      const pOffer = { type: vItem.offerType || "Percentage", value: vItem.offerValue || 0 };
      const cOffer = vItem.categoryDoc ? getCategoryOffer(vItem.categoryDoc._id) : { type: "Percentage", value: 0 };
      
      // Calculate hypothetical prices to find the best one
      const getPrice = (price, offer) => {
        if (offer.type === "Percentage") {
          return price - (price * (offer.value / 100));
        } else {
          return Math.max(0, price - offer.value);
        }
      };

      const pPrice = getPrice(vItem.salePrice, pOffer);
      const cPrice = getPrice(vItem.salePrice, cOffer);

      const pObj = {
        ...vItem,
        category: vItem.categoryDoc,
      };

      if (pPrice < vItem.salePrice || cPrice < vItem.salePrice) {
        pObj.hasOffer = true;
        pObj.discountedPrice = Math.round(Math.min(pPrice, cPrice));
        
        // For UI display, determine effective percentage or flat amount
        if (pPrice <= cPrice) {
          pObj.offerType = pOffer.type;
          pObj.offerValue = pOffer.value;
          pObj.offerDiscount = pOffer.type === "Percentage" ? pOffer.value : Math.round(((vItem.salePrice - pPrice) / vItem.salePrice) * 100);
        } else {
          pObj.offerType = cOffer.type;
          pObj.offerValue = cOffer.value;
          pObj.offerDiscount = cOffer.type === "Percentage" ? cOffer.value : Math.round(((vItem.salePrice - cPrice) / vItem.salePrice) * 100);
        }
      } else {
        pObj.hasOffer = false;
        pObj.discountedPrice = vItem.salePrice;
      }
      return pObj;
    });

    const isAjax = req.query.ajax === "true" && req.xhr;
    const viewPath = isAjax ? "partials/_shop_content_wrapper" : "user/shop";

    res.render(viewPath, {
      pageTitle: selectedCategoryName || genderFilter || "Shop",
      products: parsedProducts,
      currentPage: page,
      totalPages,
      totalProducts,
      activeMenu: genderFilter
        ? genderFilter === "Men"
          ? "men"
          : "women"
        : "shop",
      search: search || "",
      selectedSort: sort || "newest",
      selectedCategory: category || "",
      selectedBrand: Array.isArray(brand) ? brand : brand ? [brand] : [],
      selectedColor: Array.isArray(color) ? color : color ? [color] : [],
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      categories: sidebarCategories,
      brands,
      colors: colors.filter((c) => c),
      currentQuery: req.query,
      genderFilter,
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

    // ==== OFFER MATH CALCULATION (Main Product) ====
    let pObj = product.toObject();
    
    // Helper to calculate best offer from a set of options
    const getBestPrice = (basePrice, offers) => {
      let bestPrice = basePrice;
      let effectiveOffer = { type: 'Percentage', value: 0 };

      offers.forEach(opt => {
        if (!opt) return;
        const currentPrice = opt.type === 'Percentage' 
          ? basePrice - (basePrice * (opt.value / 100))
          : Math.max(0, basePrice - opt.value);
        
        if (currentPrice < bestPrice) {
          bestPrice = currentPrice;
          effectiveOffer = opt;
        }
      });
      return { bestPrice, effectiveOffer };
    };

    const pOption = { type: pObj.offerType || 'Percentage', value: pObj.offerValue || 0 };
    const cOptionDirect = pObj.category ? { type: pObj.category.offerType || 'Percentage', value: pObj.category.offerValue || 0 } : null;
    const cOptionParent = pObj.category && pObj.category.parentCategory ? { type: pObj.category.parentCategory.offerType || 'Percentage', value: pObj.category.parentCategory.offerValue || 0 } : null;

    const { bestPrice, effectiveOffer } = getBestPrice(pObj.salePrice, [pOption, cOptionDirect, cOptionParent]);

    if (bestPrice < pObj.salePrice) {
      pObj.hasOffer = true;
      pObj.offerType = effectiveOffer.type;
      pObj.offerValue = effectiveOffer.value;
      pObj.offerDiscount = effectiveOffer.type === 'Percentage' ? effectiveOffer.value : Math.round(((pObj.salePrice - bestPrice) / pObj.salePrice) * 100);
      pObj.discountedPrice = Math.round(bestPrice);

      pObj.variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          const sPrice = effectiveOffer.type === 'Percentage'
            ? size.salePrice - (size.salePrice * (effectiveOffer.value / 100))
            : Math.max(0, size.salePrice - effectiveOffer.value);
          size.discountedPrice = Math.round(sPrice);
        });
      });
    } else {
      pObj.hasOffer = false;
      pObj.discountedPrice = pObj.salePrice;
      pObj.variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          size.discountedPrice = size.salePrice;
        });
      });
    }

    // Replace JSON to be used by frontend script
    const productDataJson = JSON.stringify(pObj || {}).replace(/</g, "\\u003c");
    // ================================

    // ==== OFFER MATH CALCULATION (Related Products) ====
    const parsedRelated = relatedProducts.map((rp) => {
      let rObj = rp.toObject();
      const rpOption = { type: rObj.offerType || 'Percentage', value: rObj.offerValue || 0 };
      // Reuse the same category options as they share the same category
      const { bestPrice: rpBestPrice, effectiveOffer: rpEff } = getBestPrice(rObj.salePrice, [rpOption, cOptionDirect, cOptionParent]);

      if (rpBestPrice < rObj.salePrice) {
        rObj.hasOffer = true;
        rObj.offerDiscount = rpEff.type === 'Percentage' ? rpEff.value : Math.round(((rObj.salePrice - rpBestPrice) / rObj.salePrice) * 100);
        rObj.discountedPrice = Math.round(rpBestPrice);
      } else {
        rObj.hasOffer = false;
        rObj.discountedPrice = rObj.salePrice;
      }
      return rObj;
    });
    // ================================

    const isGlobalSoldOut =
      pObj.status === "Out of Stock" || pObj.totalStock <= 0;

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
      pageTitle: pObj.productName,
      product: pObj,
      productDataJson,
      relatedProducts: parsedRelated,
      activeMenu: "shop",
      user: req.user,
      isGlobalSoldOut,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.status(500).redirect("/shop");
  }
};

const getOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const { search, sort, category, brand, minPrice, maxPrice, color, gender } =
      req.query;

    let genderFilter = gender || null;
    // Also check if we can infer from path if this was a redirect, 
    // though /offers is usually a direct route.

    // 1. Get Categories
    let activeCategoriesList = await Category.findActiveCategories();

    if (genderFilter) {
      activeCategoriesList = activeCategoriesList.filter(
        (c) => c.gender === genderFilter || c.gender === "Unisex",
      );
    }

    const activeCategoryIds = activeCategoriesList.map((c) => c._id);

    // Filter categories for the sidebar based on product presence (Strict Global Filter)
    const categoriesInUse = await Product.distinct("category", {
      category: { $in: activeCategoryIds },
      isDeleted: false,
      isBlocked: false,
      status: { $in: ["Available", "Out of Stock"] },
    });
    
    let sidebarCategories = activeCategoriesList.filter((c) =>
      categoriesInUse.some((inUseId) => inUseId.toString() === c._id.toString()),
    );

    // Context-specific refinements
    if (genderFilter) {
      // Also hide the top-level gender entry for cleaner look if on a gender page
      sidebarCategories = sidebarCategories.filter(
        (c) => !(c.level === 0 && c.gender === genderFilter),
      );
    }

    // Find categories that have offers, AND their children
    const categoriesWithOffers = activeCategoriesList
      .filter((cat) => cat.offerPercentage > 0)
      .map((cat) => cat._id.toString());

    let expandedOfferCatIds = new Set(categoriesWithOffers);
    activeCategoriesList.forEach((cat) => {
      if (
        cat.parentCategory &&
        categoriesWithOffers.includes(cat.parentCategory.toString())
      ) {
        expandedOfferCatIds.add(cat._id.toString());
      }
    });

    const categoryOfferObjectIds = Array.from(expandedOfferCatIds).map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    // 2. Base Pipeline for Offers
    let pipeline = [
      {
        $match: {
          isDeleted: false,
          isBlocked: false,
          status: { $in: ["Available", "Out of Stock"] },
          category: { $in: activeCategoryIds },
          $or: [
            { offerPercentage: { $gt: 0 } },
            { category: { $in: categoryOfferObjectIds } },
            { $expr: { $lt: ["$salePrice", "$regularPrice"] } },
          ],
        },
      },
      { $unwind: "$variants" },
      {
        $match: {
          "variants.sizes": {
            $elemMatch: { status: "Active", isBlocked: false },
          },
        },
      },
    ];

    // 3. Search
    if (search) {
      // Escape regex special characters to prevent errors
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(safeSearch, "i");

      const matchedCats = activeCategoriesList.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      );
      const matchedCatIds = matchedCats.map((c) => c._id);

      pipeline.push({
        $match: {
          $or: [
            { productName: searchRegex },
            { description: searchRegex },
            { brand: searchRegex },
            { model: searchRegex },
            { category: { $in: matchedCatIds } },
            { "variants.color": searchRegex },
          ],
        },
      });
    }

    // 4. Filters
    if (category) {
      pipeline.push({ $match: { category: new mongoose.Types.ObjectId(category) } });
    }

    if (brand) {
      const brandList = Array.isArray(brand) ? brand : [brand];
      pipeline.push({ $match: { brand: { $in: brandList } } });
    }

    if (color) {
      const colorList = Array.isArray(color) ? color : [color];
      pipeline.push({
        $match: {
          "variants.color": {
            $in: colorList.map((c) => new RegExp(c, "i")),
          },
        },
      });
    }

    if (minPrice || maxPrice) {
      const priceQuery = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);
      pipeline.push({ $match: { salePrice: priceQuery } });
    }

    // 5. Total Count
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / limit);

    // 6. Sort
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
    pipeline.push({ $sort: sortOption });

    // 7. Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // 8. Final Fetch with Category Join
    pipeline.push({
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryDoc",
      },
    });
    pipeline.push({ $unwind: "$categoryDoc" });

    const variantItems = await Product.aggregate(pipeline);

    // Helper for Sidebar Options (Use the base offer query)
    const baseOfferFilter = {
      isDeleted: false,
      isBlocked: false,
      category: { $in: activeCategoryIds },
      $or: [
        { offerValue: { $gt: 0 } },
        { category: { $in: categoryOfferObjectIds } },
        { $expr: { $lt: ["$salePrice", "$regularPrice"] } },
      ],
    };
    const brands = await Product.distinct("brand", baseOfferFilter);
    const colors = await Product.distinct("variants.color", baseOfferFilter);

    // 9. Process Result with Offer Math
    const getCategoryOffer = (catId) => {
      let currentCat = activeCategoriesList.find(
        (c) => c._id.toString() === catId.toString(),
      );
      let bestOffer = { type: "Percentage", value: 0 };
      
      while (currentCat) {
        const currentVal = currentCat.offerValue || 0;
        const currentType = currentCat.offerType || "Percentage";
        
        const bestEquivalent = bestOffer.type === "Percentage" ? bestOffer.value * 10 : bestOffer.value;
        const currentEquivalent = currentType === "Percentage" ? currentVal * 10 : currentVal;

        if (currentEquivalent > bestEquivalent) {
          bestOffer = { type: currentType, value: currentVal };
        }

        if (currentCat.parentCategory) {
          currentCat = activeCategoriesList.find(
            (c) => c._id.toString() === currentCat.parentCategory.toString(),
          );
        } else {
          break;
        }
      }
      return bestOffer;
    };

    const parsedProducts = variantItems.map((vItem) => {
      const pOffer = { type: vItem.offerType || "Percentage", value: vItem.offerValue || 0 };
      const cOffer = vItem.categoryDoc ? getCategoryOffer(vItem.categoryDoc._id) : { type: "Percentage", value: 0 };
      
      const getPrice = (price, offer) => {
        if (offer.type === "Percentage") {
          return price - (price * (offer.value / 100));
        } else {
          return Math.max(0, price - offer.value);
        }
      };

      const pPrice = getPrice(vItem.salePrice, pOffer);
      const cPrice = getPrice(vItem.salePrice, cOffer);

      const pObj = {
        ...vItem,
        category: vItem.categoryDoc,
      };

      if (pPrice < vItem.salePrice || cPrice < vItem.salePrice) {
        pObj.hasOffer = true;
        pObj.discountedPrice = Math.round(Math.min(pPrice, cPrice));
        
        if (pPrice <= cPrice) {
          pObj.offerType = pOffer.type;
          pObj.offerValue = pOffer.value;
          pObj.offerDiscount = pOffer.type === "Percentage" ? pOffer.value : Math.round(((vItem.salePrice - pPrice) / vItem.salePrice) * 100);
        } else {
          pObj.offerType = cOffer.type;
          pObj.offerValue = cOffer.value;
          pObj.offerDiscount = cOffer.type === "Percentage" ? cOffer.value : Math.round(((vItem.salePrice - cPrice) / vItem.salePrice) * 100);
        }
      } else {
        pObj.hasOffer = false;
        pObj.discountedPrice = vItem.salePrice;
      }
      return pObj;
    });

    const isAjax = req.query.ajax === "true" && req.xhr;
    const viewPath = isAjax ? "partials/_shop_content_wrapper" : "user/offers";

    res.render(viewPath, {
      pageTitle: "Offers & Deals",
      products: parsedProducts,
      currentPage: page,
      totalPages,
      totalProducts,
      activeMenu: "offers",
      search: search || "",
      selectedSort: sort || "newest",
      selectedCategory: category || "",
      selectedBrand: Array.isArray(brand) ? brand : brand ? [brand] : [],
      selectedColor: Array.isArray(color) ? color : color ? [color] : [],
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      categories: sidebarCategories,
      brands,
      colors: colors.filter((c) => c),
      currentQuery: req.query,
      genderFilter,
    });
  } catch (error) {
    console.error("Error loading offers page:", error);
    res.status(500).render("user/offers", {
      pageTitle: "Offers & Deals",
      products: [],
      currentPage: 1,
      totalPages: 1,
      totalProducts: 0,
      activeMenu: "offers",
      error: "Failed to load offers",
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

const getAbout = (req, res) => {
  res.render("user/about", {
    pageTitle: "About Us",
    activeMenu: "about",
    user: req.user,
  });
};

const getContact = (req, res) => {
  res.render("user/contact", {
    pageTitle: "Contact Us",
    activeMenu: "contact",
    user: req.user,
  });
};

module.exports = {
  getShop,
  getProductDetails,
  getOffers,
  getAbout,
  getContact,
};
