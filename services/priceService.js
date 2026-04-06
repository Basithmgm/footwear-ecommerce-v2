const Category = require("../models/Category");

/**
 * Recursively finds the best offer in the category hierarchy (Direct or Parent).
 */
const getCategoryOffer = (catId, activeCategoriesList) => {
  let currentCat = activeCategoriesList.find(
    (c) => c._id.toString() === catId.toString()
  );
  let bestOffer = { type: "Percentage", value: 0 };

  while (currentCat) {
    const currentVal = currentCat.offerValue || 0;
    const currentType = currentCat.offerType || "Percentage";

    // Simple heuristic to compare different offer types (1% ~ 10 units for a 1000 unit price)
    const bestEquivalent =
      bestOffer.type === "Percentage" ? bestOffer.value * 10 : bestOffer.value;
    const currentEquivalent =
      currentType === "Percentage" ? currentVal * 10 : currentVal;

    if (currentEquivalent > bestEquivalent) {
      bestOffer = { type: currentType, value: currentVal };
    }

    if (currentCat.parentCategory) {
      currentCat = activeCategoriesList.find(
        (c) => c._id.toString() === currentCat.parentCategory.toString()
      );
    } else {
      break;
    }
  }
  return bestOffer;
};

/**
 * Calculates the best available price for a product variant/size.
 * Considers Product Offers, Category Offers, and Parent Category Offers.
 */
const calculateBestPrice = (product, variantColor, size, activeCategoriesList) => {
  const variant = product.variants.find((v) => v.color === variantColor);
  if (!variant) return null;
  const sizeObj = variant.sizes.find((s) => s.size == size);
  if (!sizeObj) return null;

  const baseSalePrice = sizeObj.salePrice;
  const regularPrice = sizeObj.regularPrice;

  // 1. Get Product Offer
  const pOffer = {
    type: product.offerType || "Percentage",
    value: product.offerValue || 0,
  };

  // 2. Get Category Offer (Recursive)
  const categoryId = product.category._id || product.category;
  const cOffer = getCategoryOffer(categoryId, activeCategoriesList);

  const getOfferPrice = (base, offer) => {
    if (offer.type === "Percentage") {
      return base - base * (offer.value / 100);
    } else {
      return Math.max(0, base - offer.value);
    }
  };

  const pPrice = getOfferPrice(baseSalePrice, pOffer);
  const cPrice = getOfferPrice(baseSalePrice, cOffer);

  const finalPrice = Math.min(pPrice, cPrice);
  const hasOffer = finalPrice < baseSalePrice;

  let effectiveOffer = pPrice <= cPrice ? pOffer : cOffer;

  return {
    regularPrice,
    baseSalePrice,
    discountedPrice: Math.round(finalPrice),
    hasOffer,
    offerType: effectiveOffer.type,
    offerValue: effectiveOffer.value,
    offerDiscount:
      effectiveOffer.type === "Percentage"
        ? effectiveOffer.value
        : Math.round(((baseSalePrice - finalPrice) / baseSalePrice) * 100),
    itemSaving: regularPrice - Math.round(finalPrice), // Total saving from RegularPrice per unit
  };
};

module.exports = {
  calculateBestPrice,
  getCategoryOffer,
};
