import { products } from "@orlast/catalog";
const key = "orlast-bag";
export function getCart() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (p) =>
              products.some((item) => item.id === p.id) &&
              Number.isInteger(p.quantity) &&
              p.quantity > 0 &&
              p.quantity <= 10,
          )
          .filter(
            (p, i, all) => all.findIndex((item) => item.id === p.id) === i,
          )
      : [];
  } catch {
    return [];
  }
}
export function saveCart(cart) {
  localStorage.setItem(key, JSON.stringify(cart));
  window.dispatchEvent(new Event("bagchange"));
}
export function addToCart(id) {
  if (!products.some((p) => p.id === id)) return;
  const cart = getCart();
  const existing = cart.find((p) => p.id === id);
  if (existing) existing.quantity = Math.min(existing.quantity + 1, 10);
  else cart.push({ id, quantity: 1 });
  saveCart(cart);
}
