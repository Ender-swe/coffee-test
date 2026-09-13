// Creates and expires one test Checkout Session; never submits a payment.
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import Stripe from "stripe";
import { createApp } from "../apps/api/src/app.js";
import { pool } from "../apps/api/src/db.js";

if (!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || "")) {
  throw new Error(
    "Verification requires a Stripe test secret key. No Stripe request was made.",
  );
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = createApp({ stripe });
const server = app.listen(0, "127.0.0.1");
let sessionId;
const key = randomUUID();
try {
  await once(server, "listening");
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/checkout`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        name: "Orlast Integration Test",
        email: "stripe-verification@example.com",
        items: [{ id: "daily-blend", quantity: 1 }],
        shipping: "standard",
        accessToken: randomBytes(32).toString("hex"),
      }),
    },
  );
  assert.equal(
    response.status,
    200,
    "Stripe Checkout Session creation failed. Check the API log and key permissions.",
  );
  const { url } = await response.json();
  assert.equal(new URL(url).hostname, "checkout.stripe.com");
  const {
    rows: [order],
  } = await pool.query("SELECT stripe_session_id FROM orders WHERE id=$1", [
    key,
  ]);
  sessionId = order.stripe_session_id;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  assert.equal(session.livemode, false);
  assert.equal(session.amount_subtotal, 1800);
  assert.equal(session.payment_status, "unpaid");
  console.log(
    "Real Stripe test connection verified: guest Checkout Session created and retrieved with server-calculated pricing. No payment submitted.",
  );
} finally {
  if (sessionId) {
    await stripe.checkout.sessions.expire(sessionId);
    await pool.query("UPDATE orders SET status='expired' WHERE id=$1", [key]);
    console.log("Verification session expired.");
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
