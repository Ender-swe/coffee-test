import express from "express";
import Stripe from "stripe";
import { rateLimit } from "express-rate-limit";
import { products, shippingOptions } from "@orlast/catalog";
import { pool } from "./db.js";
import { registerAuth } from "./auth.js";
import { registerCheckout, syncPayment } from "./checkout.js";

export function createApp({
  db = pool,
  stripe = /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || "")
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null,
  webUrl = process.env.WEB_URL || "http://localhost:3000",
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  production = process.env.NODE_ENV === "production",
  automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true",
} = {}) {
  const app = express();
  webUrl = webUrl.replace(/\/$/, "");
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      if (!stripe || !webhookSecret)
        return res.status(503).json({ error: "Webhook not configured" });
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          req.get("stripe-signature"),
          webhookSecret,
        );
      } catch {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }
      if (
        [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "checkout.session.expired",
        ].includes(event.type)
      )
        await syncPayment(db, event.data.object);
      if (event.type === "checkout.session.async_payment_failed") {
        await db.query(
          "UPDATE orders SET status='failed' WHERE stripe_session_id=$1 AND status='pending'",
          [event.data.object.id],
        );
      }
      res.json({ received: true });
    },
  );
  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      if (req.get("origin") && req.get("origin") !== new URL(webUrl).origin)
        return res
          .status(403)
          .json({ error: "Request origin is not allowed." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "Send JSON requests." });
    }
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "A few too many attempts. Please try again in 15 minutes.",
    },
  });
  const checkoutLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Please wait a moment before trying again." },
  });
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", service: "orlast-api" }),
  );
  app.get("/api/products", (_req, res) =>
    res.json({ products, shippingOptions }),
  );
  registerAuth(app, { db, production, limiter });
  registerCheckout(app, {
    db,
    stripe,
    webUrl,
    automaticTax,
    limiter: checkoutLimiter,
  });
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error, _req, res, _next) => {
    const status =
      error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500)
      console.error("Request failed:", error.code || error.type || error.name);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "We could not complete that just now. Please try again."
            : "Invalid request",
      });
  });
  return app;
}
export const app = createApp();
