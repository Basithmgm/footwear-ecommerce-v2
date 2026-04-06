const getEffectivePrice = (basePrice, product) => {
  const pOption = { type: product.offerType || 'Percentage', value: product.offerValue || 0 };
  const cOptionDirect = product.category ? { type: product.category.offerType || 'Percentage', value: product.category.offerValue || 0 } : null;
  const cOptionParent = product.category && product.category.parentCategory ? { type: product.category.parentCategory.offerType || 'Percentage', value: product.category.parentCategory.offerValue || 0 } : null;

  const getBestPrice = (price, offers) => {
    let bestPrice = price;
    offers.forEach(opt => {
      if (!opt || opt.value <= 0) return;
      const discount = opt.type === 'Percentage' ? (price * (opt.value / 100)) : opt.value;
      if (discount > price * 0.5) return;
      const discounted = price - discount;
      if (discounted < bestPrice) bestPrice = discounted;
    });
    return Math.round(bestPrice);
  };

  return getBestPrice(basePrice, [pOption, cOptionDirect, cOptionParent]);
};

// Case 1: Product offer 35% on 3100
const p1 = { offerType: 'Percentage', offerValue: 35 };
console.log('Case 1: Expect 2015. Result:', getEffectivePrice(3100, p1));

// Case 2: Product offer 60% on 3100 (should be capped at 50%? No, the code says "if (discount > price * 0.5) return" - so it ignores offers > 50%)
const p2 = { offerType: 'Percentage', offerValue: 60 };
console.log('Case 2: Expect 3100 (ignoring >50% discount). Result:', getEffectivePrice(3100, p2));

// Case 3: Category offer 10% on 3100
const p3 = { category: { offerType: 'Percentage', offerValue: 10 } };
console.log('Case 3: Expect 2790. Result:', getEffectivePrice(3100, p3));

// Case 4: Multiple offers: 10% on Category, 20% on Product
const p4 = { offerType: 'Percentage', offerValue: 20, category: { offerType: 'Percentage', offerValue: 10 } };
console.log('Case 4: Expect 2480 (best offer 20%). Result:', getEffectivePrice(3100, p4));
