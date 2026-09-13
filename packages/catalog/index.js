export const products = [
  {
    id: "daily-blend",
    name: "The daily ritual",
    subtitle: "House blend · Whole bean · 250 g",
    description:
      "Chocolate, caramel, a little everyday magic. Your very good morning starts here.",
    price: 1800,
    color: "rust",
    label: "HOUSE BLEND",
    number: "01",
    notes: "Chocolate / Caramel / Comfort",
  },
  {
    id: "sunday-origin",
    name: "Slow Sunday",
    subtitle: "Single origin · Whole bean · 250 g",
    description:
      "A bright, beautifully unhurried cup. Floral notes meet a soft citrus finish.",
    price: 2200,
    color: "sage",
    label: "SINGLE ORIGIN",
    number: "02",
    notes: "Citrus / Florals / A fresh start",
  },
  {
    id: "ceramic-cup",
    name: "Your favorite cup",
    subtitle: "Ceramic mug · Oat glaze · 300 ml",
    description:
      "A comforting curve, a generous handle, and room for your daily moment.",
    price: 2400,
    color: "oat",
    label: "THE EVERYDAY CUP",
    number: "03",
    notes: "Made for slow mornings",
  },
];
export const shippingOptions = [
  {
    id: "standard",
    name: "The easygoing way",
    description: "Standard · Estimated 3–5 business days",
    amount: 495,
    freeAbove: 4000,
  },
  {
    id: "express",
    name: "A little sooner",
    description: "Express · Estimated 1–2 business days",
    amount: 995,
  },
];
export const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function quote(items, shipping = "standard") {
  if (!Array.isArray(items) || !items.length || items.length > products.length)
    throw new Error("Add something lovely to your bag first.");
  const seen = new Set();
  const lines = items.map((item) => {
    const product = products.find((p) => p.id === item?.id);
    if (
      !product ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10 ||
      seen.has(item.id)
    )
      throw new Error("Please check the items in your bag.");
    seen.add(item.id);
    return { ...product, quantity: item.quantity };
  });
  const option = shippingOptions.find((s) => s.id === shipping);
  if (!option) throw new Error("Choose a shipping option.");
  const subtotal = lines.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const shippingAmount =
    option.freeAbove && subtotal >= option.freeAbove ? 0 : option.amount;
  return {
    lines,
    subtotal,
    shipping: shippingAmount,
    total: subtotal + shippingAmount,
    option,
  };
}
