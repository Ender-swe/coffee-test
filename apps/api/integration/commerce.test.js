import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import Stripe from "stripe";
import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";

const schema = `test_${randomBytes(8).toString("hex")}`;
const connectionString =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgres://orlast:orlast_local_only@127.0.0.1:5433/orlast";
const admin = new pg.Pool({ connectionString });
const db = new pg.Pool({
  connectionString,
  options: `-c search_path=${schema}`,
});
const sdk = new Stripe("sk_test_placeholder");
const sessions = new Map();
let creates = 0;
let server;
let base;
let cookie;
let userId;
const email = `test-${randomUUID()}@example.com`;
const secret = "whsec_integration_test";
const stripe = {
  webhooks: sdk.webhooks,
  checkout: {
    sessions: {
      async create(params) {
        creates++;
        const session = {
          id: `cs_test_${randomUUID()}`,
          url: "https://checkout.stripe.com/c/pay/test",
          status: "open",
          payment_status: "unpaid",
          currency: "usd",
          metadata: params.metadata,
          amount_total:
            params.line_items.reduce(
              (sum, line) => sum + line.price_data.unit_amount * line.quantity,
              0,
            ) +
            params.shipping_options[0].shipping_rate_data.fixed_amount.amount,
          shipping_details: {
            name: "Guest Customer",
            address: {
              country: "US",
              city: "Portland",
              postal_code: "97201",
              line1: "123 Test St",
            },
          },
          params,
        };
        sessions.set(session.id, session);
        return session;
      },
      async retrieve(id) {
        return sessions.get(id);
      },
    },
  },
};
const json = (body, headers = {}) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "http://localhost:3000",
    ...headers,
  },
  body: JSON.stringify(body),
});
function checkoutBody() {
  return {
    name: "Guest Customer",
    email: "guest@example.com",
    items: [{ id: "daily-blend", quantity: 1, price: 1 }],
    shipping: "standard",
    accessToken: randomBytes(32).toString("hex"),
  };
}
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await db.query(
    await readFile(
      new URL("../migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  server = createApp({ db, stripe, webhookSecret: secret }).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await pool.end();
});
test("signup hashes passwords, issues HttpOnly session, and persists identity", async () => {
  const res = await fetch(
    `${base}/api/auth/signup`,
    json({ name: "Alex Test", email, password: "a good long test password" }),
  );
  assert.equal(res.status, 201);
  cookie = res.headers.get("set-cookie").split(";")[0];
  assert.match(res.headers.get("set-cookie"), /HttpOnly/);
  assert.match(res.headers.get("set-cookie"), /SameSite=Lax/);
  userId = (await res.json()).user.id;
  const {
    rows: [saved],
  } = await db.query("SELECT * FROM users WHERE id=$1", [userId]);
  assert.notEqual(saved.password_hash, "a good long test password");
  const me = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal((await me.json()).user.email, email);
});
test("login rejects wrong passwords; logout revokes the session", async () => {
  assert.equal(
    (
      await fetch(
        `${base}/api/auth/login`,
        json({ email, password: "incorrect" }),
      )
    ).status,
    401,
  );
  const login = await fetch(
    `${base}/api/auth/login`,
    json({ email, password: "a good long test password" }),
  );
  assert.equal(login.status, 200);
  const token = login.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await fetch(`${base}/api/auth/logout`, json({}, { Cookie: token })))
      .status,
    200,
  );
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: token } });
  assert.equal((await me.json()).user, null);
});
test("invalid signup and cross-origin mutations are rejected", async () => {
  assert.equal(
    (
      await fetch(
        `${base}/api/auth/signup`,
        json({ name: "X", email: "wrong", password: "short" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(
        `${base}/api/auth/login`,
        json(
          { email, password: "anything" },
          { Origin: "https://other.example" },
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      })
    ).status,
    415,
  );
});
test("guest checkout uses server prices, ships to the US, and retries without duplicate sessions", async () => {
  const body = checkoutBody();
  const key = randomUUID();
  const before = creates;
  const [first, retry] = await Promise.all(
    [1, 2].map(() =>
      fetch(`${base}/api/checkout`, json(body, { "Idempotency-Key": key })),
    ),
  );
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(creates, before + 1);
  const {
    rows: [saved],
  } = await db.query("SELECT * FROM orders WHERE id=$1", [key]);
  assert.equal(saved.user_id, null);
  assert.equal(saved.subtotal, 1800);
  assert.equal(saved.total, 2295);
  assert.equal(saved.status, "pending");
  const session = sessions.get(saved.stripe_session_id);
  assert.deepEqual(
    session.params.shipping_address_collection.allowed_countries,
    ["US"],
  );
  assert.equal(session.params.customer_email, body.email);
  assert.equal(session.params.customer, undefined);
  assert.equal((await fetch(`${base}/api/orders/${key}`)).status, 404);
  const authorized = await fetch(`${base}/api/orders/${key}`, {
    headers: { "X-Order-Token": body.accessToken },
  });
  assert.equal((await authorized.json()).order.status, "pending");
  const changed = await fetch(
    `${base}/api/checkout`,
    json({ ...body, shipping: "express" }, { "Idempotency-Key": key }),
  );
  assert.equal(changed.status, 409);
});
test("member orders link to session, free shipping is server-calculated", async () => {
  const key = randomUUID();
  const body = {
    ...checkoutBody(),
    items: [
      { id: "daily-blend", quantity: 1 },
      { id: "sunday-origin", quantity: 1 },
    ],
  };
  const res = await fetch(
    `${base}/api/checkout`,
    json(body, { "Idempotency-Key": key, Cookie: cookie }),
  );
  assert.equal(res.status, 200);
  const {
    rows: [saved],
  } = await db.query("SELECT * FROM orders WHERE id=$1", [key]);
  assert.equal(saved.user_id, userId);
  assert.equal(saved.shipping, 0);
  assert.equal(saved.total, 4000);
});
test("invalid quantities, unknown products, duplicate products and shipping are rejected", async () => {
  for (const change of [
    { items: [] },
    { items: [{ id: "daily-blend", quantity: -1 }] },
    { items: [{ id: "missing", quantity: 1 }] },
    {
      items: [
        { id: "daily-blend", quantity: 1 },
        { id: "daily-blend", quantity: 1 },
      ],
    },
    { shipping: "magic" },
  ]) {
    assert.equal(
      (
        await fetch(
          `${base}/api/checkout`,
          json(
            { ...checkoutBody(), ...change },
            { "Idempotency-Key": randomUUID() },
          ),
        )
      ).status,
      400,
    );
  }
});
test("signed payment webhook persists paid status and address, duplicates stay idempotent", async () => {
  const key = randomUUID();
  const body = checkoutBody();
  await fetch(`${base}/api/checkout`, json(body, { "Idempotency-Key": key }));
  const {
    rows: [saved],
  } = await db.query("SELECT * FROM orders WHERE id=$1", [key]);
  const session = sessions.get(saved.stripe_session_id);
  session.payment_status = "paid";
  session.status = "complete";
  const payload = JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    data: { object: session },
  });
  const signature = sdk.webhooks.generateTestHeaderString({ payload, secret });
  const invalid = await fetch(`${base}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "bad" },
    body: payload,
  });
  assert.equal(invalid.status, 400);
  for (let n = 0; n < 2; n++)
    assert.equal(
      (
        await fetch(`${base}/api/stripe/webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "stripe-signature": signature,
          },
          body: payload,
        })
      ).status,
      200,
    );
  const {
    rows: [paid],
  } = await db.query("SELECT * FROM orders WHERE id=$1", [key]);
  assert.equal(paid.status, "paid");
  assert.ok(paid.paid_at);
  assert.equal(paid.shipping_address.address.country, "US");
  const status = await fetch(`${base}/api/orders/${key}`, {
    headers: { "X-Order-Token": body.accessToken },
  });
  assert.equal((await status.json()).order.status, "paid");
});
test("return-page reconciliation confirms actual payment without trusting URL parameters", async () => {
  const key = randomUUID();
  const body = checkoutBody();
  await fetch(`${base}/api/checkout`, json(body, { "Idempotency-Key": key }));
  const {
    rows: [saved],
  } = await db.query("SELECT * FROM orders WHERE id=$1", [key]);
  const session = sessions.get(saved.stripe_session_id);
  let response = await fetch(`${base}/api/orders/${key}?paid=true`, {
    headers: { "X-Order-Token": body.accessToken },
  });
  assert.equal((await response.json()).order.status, "pending");
  session.payment_status = "paid";
  response = await fetch(`${base}/api/orders/${key}`, {
    headers: { "X-Order-Token": body.accessToken },
  });
  assert.equal((await response.json()).order.status, "paid");
});
test("expired sessions can be replaced and paid retries return the existing order", async () => {
  for (const state of ["expired", "paid"]) {
    const key = randomUUID();
    const body = checkoutBody();
    await fetch(`${base}/api/checkout`, json(body, { "Idempotency-Key": key }));
    const {
      rows: [saved],
    } = await db.query("SELECT * FROM orders WHERE id=$1", [key]);
    const session = sessions.get(saved.stripe_session_id);
    if (state === "expired") session.status = "expired";
    else {
      session.status = "complete";
      session.payment_status = "paid";
    }
    const before = creates;
    const retry = await fetch(
      `${base}/api/checkout`,
      json(body, { "Idempotency-Key": key }),
    );
    assert.equal(retry.status, state === "expired" ? 409 : 200);
    if (state === "paid") assert.equal((await retry.json()).orderId, key);
    assert.equal(creates, before);
  }
});
