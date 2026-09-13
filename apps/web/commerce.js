import { products, money, quote, shippingOptions } from "@orlast/catalog";
import { getCart, saveCart, addToCart } from "./cart.js";
import "./commerce.css";

const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  cup: '<path d="M5 9h12v7a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Zm12 1h2a3 3 0 0 1 0 6h-2M8 5V2m5 3V2M3 23h17"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  bag: '<path d="M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  flower: '<path d="M12 3v18M4 7.5l16 9m-16 0 16-9"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  truck:
    '<path d="M2 5h12v13H2V5Zm12 5h4l4 5v3h-8"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
};
const icon = (name) =>
  `<svg class="c-icon" viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.flower}</svg>`;
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const page = document.body.dataset.page;
const root = document.querySelector("#commerce");
let user = null;
let shipping = "standard";
const storage = {
  get(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value));
  },
};
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error(
      "We could not connect. Check your connection and try again.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Our shop is temporarily unavailable. Please try again soon.",
    );
  }
  if (!response.ok) {
    const error = new Error(
      data.error || "Something went wrong. Please try again.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
function artwork(product, small = false) {
  return `<div class="product-art ${product.color} ${small ? "mini" : ""}" role="img" aria-label="${esc(product.name)} packaging illustration">${product.id === "ceramic-cup" ? `<div class="ceramic"><span>orlast</span></div>` : `<div class="coffee-pouch"><div class="pouch-seal"></div><span class="pouch-logo">${icon("cup")} orlast</span><div class="pouch-label"><small>${product.label}</small><b>${product.name}</b><span>GOOD COFFEE. BETTER DAYS.</span>${icon("flower")}</div><div class="pouch-bottom"><span>WHOLE BEAN<br>250 G / 8.8 OZ</span><span>Nº ${product.number}</span></div></div>`}</div>`;
}
const brand = `<a class="c-brand" href="./index.html" aria-label="Orlast home">${icon("cup")}orlast<span>®</span></a>`;
function shell() {
  root.innerHTML = `<div class="c-announcement">GOOD COFFEE, DELIVERED. <span>${icon("flower")}</span> FREE STANDARD SHIPPING ON $40+</div><header class="c-header">${brand}<a class="c-shop-link" href="./shop.html">The at-home collection</a><div class="c-header-actions"><a id="account-link" href="./login.html">Log in</a><a class="bag-link" href="./checkout.html" aria-label="Shopping bag">${icon("bag")}<span id="bag-count">0</span></a></div></header><main id="page-content"></main><footer class="c-footer"><span>GOOD COFFEE. BETTER DAYS.</span><span>Thoughtfully packed. Happily delivered.</span><a href="./index.html">A little more Orlast ${icon("arrow")}</a></footer><div class="toast" id="toast" role="status"></div>`;
  updateBag();
}
function updateBag() {
  document.querySelector("#bag-count").textContent = getCart().reduce(
    (sum, p) => sum + p.quantity,
    0,
  );
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}
function shop() {
  document.querySelector("#page-content").innerHTML =
    `<section class="shop-intro"><div class="overline">THE AT-HOME COLLECTION · VOL. 01</div><h1>A little Orlast.<br><em>Wherever you are.</em></h1><p>Your favorite kind of good, from our place to yours.<br>Beautiful beans. Everyday objects. Mornings made better.</p><div class="shop-stamp">${icon("flower")}<span>MAKE YOURSELF<br>AT HOME.</span></div></section><section class="shop-grid" aria-label="Shop products">${products.map((p) => `<article class="shop-product">${artwork(p)}<div class="product-heading"><h2>${p.name}</h2><span>${money(p.price)}</span></div><p>${p.subtitle}</p><p class="product-description">${p.description}</p><button class="outline-button add-button" data-add="${p.id}">Add to your bag ${icon("plus")}</button></article>`).join("")}</section><div class="shop-note">${icon("flower")} A small collection. A whole lot of care. <span>Shipping within the United States.</span></div>`;
  document.querySelectorAll("[data-add]").forEach(
    (button) =>
      (button.onclick = () => {
        try {
          addToCart(button.dataset.add);
          toast("A little good, added to your bag.");
        } catch {
          toast("Enable browser storage to keep your bag.");
        }
      }),
  );
}
function checkout() {
  const canceled = new URLSearchParams(location.search).has("canceled");
  document.querySelector("#page-content").innerHTML =
    `<section class="checkout-title"><a class="back-link" href="./shop.html">${icon("back")} Keep exploring</a><div class="overline">A FEW LITTLE DETAILS. THEN IT’S YOURS.</div><h1>Good things.<br><em>On their way.</em></h1><div class="checkout-steps"><span class="active"><b>01</b> Your bag</span><i></i><span><b>02</b> Secure payment</span><i></i><span><b>03</b> Happy mail</span></div></section><div class="checkout-layout"><section class="checkout-details"><div class="guest-note" id="guest-note">${icon("cup")}<div><strong>Just here for the coffee? Perfect.</strong><p>Checkout as a guest. An account is always optional.</p></div><a href="./login.html?next=checkout">Log in ${icon("arrow")}</a></div>${canceled ? '<p class="notice" role="status">No worries, your bag is still here. You haven’t completed payment.</p>' : ""}<form id="checkout-form"><div class="form-section"><div class="section-heading"><span>01</span><h2>Who’s the lucky one?</h2></div><div class="field"><label for="name">Full name</label><input id="name" name="name" autocomplete="name" placeholder="Alex Morgan" required minlength="2" maxlength="80"></div><div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@somewhere.nice" required maxlength="254"><small>For your order details. No account needed.</small></div></div><div class="form-section"><div class="section-heading"><span>02</span><h2>How soon is your soon?</h2></div><p class="section-description">Delivered within the United States. You’ll add your shipping address securely on the next step.</p><fieldset class="shipping-options"><legend class="sr-only">Shipping method</legend>${shippingOptions.map((s, i) => `<label class="shipping-option"><input type="radio" name="shipping" value="${s.id}" ${i === 0 ? "checked" : ""}><span class="radio-mark"></span><span><strong>${s.name}</strong><small>${s.description}</small></span><b data-shipping-price="${s.id}"></b></label>`).join("")}</fieldset></div><div class="payment-note">${icon("lock")}<div><strong>Your payment, in good hands.</strong><p>Continue to Stripe to add your address and pay securely. We never store your card details.</p></div><span class="stripe-word">stripe</span></div><p class="form-error" id="checkout-error" role="alert"></p><button class="primary-button" id="pay-button" type="submit"><span>Continue to secure payment</span>${icon("arrow")}</button><p class="under-button">No account required. Just something good to look forward to.</p></form><aside class="signup-invite" id="signup-invite">${icon("flower")}<div><strong>Make this the start of a little ritual.</strong><p>Create an account for an easier next visit. Your bag will be right here.</p><a href="./signup.html?next=checkout">Become a regular ${icon("arrow")}</a></div><span class="optional-tag">ALWAYS OPTIONAL</span></aside></section><aside class="order-summary" aria-label="Order summary"><div class="receipt-top"><div><span class="overline">PACKED WITH A LITTLE LOVE</span><h2>Your bag of good.</h2></div>${icon("bag")}</div><div id="bag-items"></div><div id="bag-totals"></div><div class="receipt-bottom">${icon("flower")} A moment for you, in every cup.<div class="receipt-barcode" aria-hidden="true"></div><span>ORLAST · THE EVERYDAY GOOD</span></div></aside></div>`;
  const draft = storage.get("orlast-contact");
  if (draft) {
    document.querySelector("#name").value = draft.name || "";
    document.querySelector("#email").value = draft.email || "";
  }
  document.querySelector("#checkout-form").addEventListener("input", () => {
    try {
      storage.set("orlast-contact", {
        name: document.querySelector("#name").value,
        email: document.querySelector("#email").value,
      });
    } catch {}
  });
  document.querySelectorAll("[name=shipping]").forEach(
    (input) =>
      (input.onchange = () => {
        shipping = input.value;
        renderBag();
      }),
  );
  document.querySelector("#checkout-form").onsubmit = pay;
  renderBag();
}
function renderBag() {
  updateBag();
  const cart = getCart();
  const items = document.querySelector("#bag-items");
  if (!items) return;
  document.querySelector("#pay-button").disabled = !cart.length;
  if (!cart.length) {
    items.innerHTML = `<div class="empty-bag">${icon("cup")}<h3>A little room for good.</h3><p>Your bag is waiting for a new favorite.</p><a class="outline-button" href="./shop.html">Explore the collection ${icon("arrow")}</a></div>`;
    document.querySelector("#bag-totals").innerHTML = "";
    document
      .querySelectorAll("[data-shipping-price]")
      .forEach(
        (el) =>
          (el.textContent = money(
            shippingOptions.find((s) => s.id === el.dataset.shippingPrice)
              .amount,
          )),
      );
    return;
  }
  const order = quote(cart, shipping);
  items.innerHTML = order.lines
    .map(
      (p) =>
        `<article class="bag-item">${artwork(p, true)}<div class="bag-item-info"><h3>${p.name}</h3><p>${p.subtitle}</p><div class="quantity"><button type="button" data-quantity="${p.id}" data-delta="-1" aria-label="Decrease ${p.name} quantity">−</button><span aria-label="Quantity">${p.quantity}</span><button type="button" data-quantity="${p.id}" data-delta="1" aria-label="Increase ${p.name} quantity" ${p.quantity === 10 ? "disabled" : ""}>+</button></div><button class="remove-item" type="button" data-remove="${p.id}">Remove</button></div><b>${money(p.price * p.quantity)}</b></article>`,
    )
    .join("");
  const remaining = Math.max(4000 - order.subtotal, 0);
  document.querySelector("#bag-totals").innerHTML =
    `<div class="free-shipping">${icon(remaining ? "truck" : "check")}<span>${remaining ? `You’re ${money(remaining)} from free standard shipping.` : "A little extra good: free standard shipping unlocked."}</span><div class="shipping-progress"><i style="width:${Math.min((order.subtotal / 4000) * 100, 100)}%"></i></div></div><dl class="totals"><div><dt>Subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Shipping</dt><dd>${order.shipping ? money(order.shipping) : "On us"}</dd></div><div><dt>Tax</dt><dd>Calculated at payment</dd></div><div class="grand-total"><dt>Total <small>before tax</small></dt><dd><small>USD</small> ${money(order.total)}</dd></div></dl>`;
  document
    .querySelectorAll("[data-shipping-price]")
    .forEach(
      (el) =>
        (el.textContent =
          el.dataset.shippingPrice === "standard" && !remaining
            ? "FREE"
            : money(
                shippingOptions.find((s) => s.id === el.dataset.shippingPrice)
                  .amount,
              )),
    );
  items.querySelectorAll("[data-quantity]").forEach(
    (button) =>
      (button.onclick = () => {
        const next = getCart()
          .map((p) =>
            p.id === button.dataset.quantity
              ? { ...p, quantity: p.quantity + Number(button.dataset.delta) }
              : p,
          )
          .filter((p) => p.quantity > 0);
        try {
          saveCart(next);
        } catch {
          toast("Your bag could not be saved.");
        }
      }),
  );
  items.querySelectorAll("[data-remove]").forEach(
    (button) =>
      (button.onclick = () => {
        try {
          saveCart(getCart().filter((p) => p.id !== button.dataset.remove));
        } catch {
          toast("Your bag could not be saved.");
        }
      }),
  );
}
async function pay(event) {
  event.preventDefault();
  const button = document.querySelector("#pay-button");
  const error = document.querySelector("#checkout-error");
  button.disabled = true;
  error.textContent = "";
  button.querySelector("span").textContent = "Getting the good stuff ready…";
  try {
    const body = {
      name: document.querySelector("#name").value.trim(),
      email: document.querySelector("#email").value.trim(),
      items: getCart(),
      shipping,
    };
    const fingerprint = JSON.stringify({ ...body, userId: user?.id });
    let attempt = storage.get("orlast-checkout");
    if (!attempt || attempt.fingerprint !== fingerprint) {
      const accessToken = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      attempt = {
        key: crypto.randomUUID(),
        accessToken,
        fingerprint,
        items: body.items,
      };
      storage.set("orlast-checkout", attempt);
    }
    storage.set(`orlast-order-${attempt.key}`, {
      token: attempt.accessToken,
      items: attempt.items,
    });
    const result = await api("/checkout", {
      method: "POST",
      headers: { "Idempotency-Key": attempt.key },
      body: JSON.stringify({ ...body, accessToken: attempt.accessToken }),
    });
    if (result.status) {
      location.assign(
        `./order.html?order=${encodeURIComponent(result.orderId)}`,
      );
      return;
    }
    const url = new URL(result.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
      throw new Error(
        "The payment link could not be opened. Please try again.",
      );
    location.assign(url.href);
  } catch (err) {
    if (err.status === 409) sessionStorage.removeItem("orlast-checkout");
    error.textContent = err.message;
    button.disabled = !getCart().length;
    button.querySelector("span").textContent = "Continue to secure payment";
  }
}
function auth() {
  const signup = page === "signup";
  const next =
    new URLSearchParams(location.search).get("next") === "checkout"
      ? "checkout"
      : "shop";
  const opposite = signup ? "login" : "signup";
  document.querySelector("#page-content").innerHTML =
    `<div class="auth-layout"><section class="auth-art"><div class="auth-photo"></div><div class="auth-photo-shade"></div><span class="auth-caption">YOUR EVERYDAY, A LITTLE BETTER.</span><div class="auth-round-stamp">${icon("cup")}<span>GOOD TO<br>HAVE YOU HERE.</span></div><div class="auth-editorial"><span class="overline">A LITTLE SPACE, JUST FOR YOU.</span><h2>${signup ? "Good coffee.<br>Better company." : "Your kind<br>of familiar."}</h2><p>${signup ? "Come for the coffee.<br>Stay for the little everyday good." : "Same warm welcome.<br>A whole new good morning."}</p><span class="auth-handwritten">${signup ? "There’s a place for you here." : "Make yourself at home."}</span></div><div class="auth-photo-footer"><span>ORLAST COFFEE</span><span>THOUGHTFULLY SOURCED. HAPPILY POURED.</span></div></section><section class="auth-form-wrap"><a class="back-link" href="./${next}.html">${icon("back")} ${next === "checkout" ? "Back to your bag" : "Back to the good stuff"}</a><div class="auth-form-inner"><span class="overline">${signup ? "BECOME A REGULAR" : "HELLO AGAIN, COFFEE FRIEND"}</span><h1>${signup ? "Your daily dose<br>of <em>belonging.</em>" : "Welcome<br><em>back.</em>"}</h1><p class="auth-intro">${signup ? "A familiar place for your next favorite.<br>Let’s make your everyday a little better." : "Good to see you again. Settle in,<br>your next favorite is waiting."}</p><div id="signed-in-state"></div><form id="auth-form">${signup ? '<div class="field"><label for="name">Your name</label><input id="name" name="name" autocomplete="name" placeholder="What should we call you?" required minlength="2" maxlength="80"></div>' : ""}<div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@somewhere.nice" required maxlength="254"></div><div class="field"><label for="password">Password</label><div class="password-field"><input id="password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "Make it a good one" : "Your little secret"}" ${signup ? 'minlength="12"' : ""} maxlength="128" required><button type="button" id="toggle-password" aria-label="Show password" aria-pressed="false">${icon("eye")}</button></div>${signup ? "<small>At least 12 characters. Spaces and phrases welcome.</small>" : ""}</div><p class="form-error" id="auth-error" role="alert"></p><button class="primary-button" id="auth-submit"><span>${signup ? "Make yourself at home" : "Let’s get you settled"}</span>${icon("arrow")}</button><p class="auth-switch">${signup ? "Already one of the regulars?" : "New around here?"} <a href="./${opposite}.html?next=${next}">${signup ? "Log in" : "Find your place"}</a></p></form><div class="auth-guest"><span>${icon("flower")}</span><p>Just passing through? You’re welcome, too.<br><a href="./checkout.html">Continue as a guest ${icon("arrow")}</a></p></div><div class="auth-fine-print">${icon("lock")} Your details stay yours. Your coffee stays good.</div></div></section></div>`;
  document.querySelector("#toggle-password").onclick = (event) => {
    const input = document.querySelector("#password");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    event.currentTarget.setAttribute("aria-pressed", String(show));
    event.currentTarget.setAttribute(
      "aria-label",
      show ? "Hide password" : "Show password",
    );
  };
  document.querySelector("#auth-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = document.querySelector("#auth-submit");
    const error = document.querySelector("#auth-error");
    button.disabled = true;
    error.textContent = "";
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      await api(`/auth/${signup ? "signup" : "login"}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      location.assign(`./${next}.html`);
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
    }
  };
}
async function orderPage() {
  const main = document.querySelector("#page-content");
  main.innerHTML = `<section class="confirmation"><div class="confirmation-mark">${icon("cup")}</div><span class="overline">A LITTLE GOOD IS COMING</span><h1>One little<br><em>moment…</em></h1><p id="order-status" role="status">We’re checking your payment securely.</p><div id="order-details"></div><a class="outline-button" href="./shop.html">Back to the collection ${icon("arrow")}</a></section>`;
  const id = new URLSearchParams(location.search).get("order");
  const saved = storage.get(`orlast-order-${id}`);
  try {
    if (!saved?.token)
      throw new Error(
        "We can’t access this order from this tab. Please return to the browser tab you used to check out.",
      );
    for (let attempt = 0; attempt < 8; attempt++) {
      const { order } = await api(`/orders/${encodeURIComponent(id)}`, {
        headers: { "X-Order-Token": saved.token },
      });
      if (order.status === "paid") {
        main.querySelector("h1").innerHTML =
          "Good things.<br><em>Coming your way.</em>";
        document.querySelector("#order-status").textContent =
          "Payment received. Thanks for making Orlast part of your everyday.";
        document.querySelector("#order-details").innerHTML =
          `<div class="confirmation-receipt"><span>ORDER ${esc(order.id.slice(0, 8).toUpperCase())}</span>${order.items.map((p) => `<div><span>${esc(p.name)} × ${p.quantity}</span><b>${money(p.price * p.quantity)}</b></div>`).join("")}<div><strong>Total paid</strong><strong>${money(order.total)}</strong></div></div>${!user ? `<div class="confirmation-invite"><h2>Same time, next cup?</h2><p>Make your next visit a little easier. Creating an account is always your call.</p><a href="./signup.html">Become a regular ${icon("arrow")}</a></div>` : ""}`;
        if (!saved.cleared) {
          const cart = getCart()
            .map((p) => ({
              ...p,
              quantity:
                p.quantity -
                (saved.items.find((item) => item.id === p.id)?.quantity || 0),
            }))
            .filter((p) => p.quantity > 0);
          saveCart(cart);
          storage.set(`orlast-order-${id}`, { ...saved, cleared: true });
          sessionStorage.removeItem("orlast-checkout");
        }
        return;
      }
      if (["failed", "expired"].includes(order.status)) {
        sessionStorage.removeItem("orlast-checkout");
        throw new Error(
          "This payment wasn’t completed. Your bag is saved. Return to checkout to try again.",
        );
      }
      if (attempt < 7)
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    document.querySelector("#order-status").textContent =
      "Your payment is still being confirmed. You can refresh this page in a moment; please don’t pay again.";
  } catch (error) {
    main.querySelector("h1").innerHTML = "Let’s take<br><em>a moment.</em>";
    document.querySelector("#order-status").textContent = error.message;
  }
}
shell();
window.addEventListener("bagchange", () =>
  page === "checkout" ? renderBag() : updateBag(),
);
window.addEventListener("storage", () =>
  page === "checkout" ? renderBag() : updateBag(),
);
if (page === "shop") shop();
else if (page === "checkout") checkout();
else if (page === "signup" || page === "login") auth();
try {
  ({ user } = await api("/auth/me"));
  if (user) {
    const link = document.querySelector("#account-link");
    link.textContent = "Log out";
    link.href = "#";
    link.onclick = async (event) => {
      event.preventDefault();
      try {
        await api("/auth/logout", { method: "POST", body: "{}" });
        location.reload();
      } catch (error) {
        toast(error.message);
      }
    };
    if (page === "checkout") {
      document.querySelector("#name").value ||= user.name;
      document.querySelector("#email").value ||= user.email;
      document.querySelector("#guest-note").innerHTML =
        `${icon("cup")}<div><strong>Good to see you, ${esc(user.name.split(" ")[0])}.</strong><p>You’re logged in. Let’s get something good on its way.</p></div>`;
      document.querySelector("#signup-invite").hidden = true;
    }
    if (page === "login" || page === "signup") {
      document.querySelector("#auth-form").hidden = true;
      document.querySelector("#signed-in-state").innerHTML =
        `<p class="notice">You’re already logged in as ${esc(user.name)}.</p><a class="primary-button" href="./checkout.html">Back to your bag ${icon("arrow")}</a>`;
    }
  }
} catch {
  /* Guest shopping remains available when account lookup is unavailable. */
}
if (page === "order") await orderPage();
