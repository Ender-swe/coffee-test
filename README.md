# Orlast

An npm/Turborepo monorepo for the Orlast coffee shop, with a storefront,
optional customer accounts, guest checkout, Stripe payments, and PostgreSQL.

## Run locally

Use Node.js 24+, npm 11+, and Docker with Compose.

```sh
npm ci
npm run db:up
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run dev
```

The website is at http://localhost:3000 and Express is at http://localhost:3001.
PostgreSQL listens only on `127.0.0.1:5433`, using a persistent Docker volume.
`npm run db:down` stops the database without deleting its data. The example
password is for local development; use your own credentials in production.

Pages:

- `/`: original coffee shop website
- `/shop.html`: shipped coffee beans and ceramic cup collection
- `/checkout.html`: shopping bag, contact details, and shipping choice
- `/signup.html` and `/login.html`: optional customer accounts
- `/order.html`: payment confirmation, accessed after Stripe checkout

The cart stays in local storage when customers visit login or signup. Contact
and payment-attempt data stay in session storage in the checkout tab. Guests
can complete every payment step without creating an Orlast account.

## Stripe setup

Set these in **`apps/api/.env`**, never in frontend files:

```dotenv
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_signing_secret
WEB_URL=http://localhost:3000
```

The API also loads a root `.env`, with `apps/api/.env` taking precedence.
Both files are optional; the dev launcher only passes existing files to Node's
watch mode. Restart the dev command after creating a new env file.
Restart the API after changing environment settings. With the Stripe CLI installed:

```sh
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Use the `whsec_...` secret printed by the listener for local webhook verification.
Run `npm run stripe:verify` with a test secret key to create, retrieve, and
expire an unpaid guest Checkout Session through the real backend.

The server creates hosted Checkout Sessions. Stripe collects the US shipping
address and payment details; no card data passes through Orlast. The custom
checkout collects contact details and shipping preference before redirecting.

Subscribe your deployed endpoint to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Payment status is updated only from signature-verified webhooks or a server-side
Stripe session retrieval. Visiting a success URL cannot mark an order paid.
Paid orders store the shipping details returned by Stripe. Use your Stripe
Dashboard to inspect payments; warehouse fulfillment, shipping labels, inventory,
refund UI, and transactional email delivery are not implemented.

Checkout retries use a stable idempotency key, database locking, and Stripe's
idempotency API. Order status requires a random token retained in the original
checkout tab. The API never associates a guest order with a newly created account
merely because their email addresses match.

Until keys are configured, shopping and accounts work, and checkout shows a
clear temporary-unavailability message while preserving the bag. Automated
payment tests use a Stripe test double plus the real SDK's webhook signing and
verification helpers; they do not charge cards or prove live Stripe connectivity.

## Products and shipping

Edit `packages/catalog/index.js` for product names, descriptions, prices in cents,
and shipping charges. The initial collection is illustrative: two 250 g whole-bean
coffees and one ceramic mug. The backend validates IDs and quantities and uses
catalog prices, ignoring amounts supplied by the browser.

Current shipping defaults are US-only, USD, $4.95 standard (free at $40), and
$9.95 express. Delivery windows are estimates; confirm them for your fulfillment
operation. Configure Stripe Tax and your registrations, then set
`STRIPE_AUTOMATIC_TAX=true` to calculate tax in Stripe. It is disabled by default
for local setup; the custom checkout displays the pre-tax total and Stripe
presents the final payable amount.

## Accounts and API

Passwords use salted scrypt hashes. Database-backed sessions use hashed random
tokens and HttpOnly, SameSite=Lax cookies (Secure in production). Auth endpoints
are rate-limited. Mutations require JSON and validate browser origins. Expired
sessions are cleaned up when new sessions are issued. Email verification,
password reset, and account management are not implemented yet.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Process health |
| `GET /api/products` | Product and shipping catalog |
| `POST /api/auth/signup` | Create account and session |
| `POST /api/auth/login` | Start a session |
| `POST /api/auth/logout` | Revoke current session |
| `GET /api/auth/me` | Current customer or `null` |
| `POST /api/checkout` | Create/reuse Stripe Checkout Session, guest or member |
| `GET /api/orders/:id` | Order status; requires `X-Order-Token` |
| `POST /api/stripe/webhook` | Signed Stripe events |

## Validation and builds

```sh
npm run check
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

Integration tests require PostgreSQL and create/drop an isolated test schema;
use `TEST_DATABASE_URL` to choose another test database. Browser tests cover
desktop and mobile guest checkout, cart persistence, account forms, payment
errors, and confirmation. They mock the API; integration tests exercise the
real database and Express routes independently.

Turborepo caches app builds in `apps/*/dist`. `npm start` builds as needed and
runs the API plus Vite preview for local verification. Run apps individually
with `npm run dev:web` and `npm run dev:api`.

## Deployment

Serve `apps/web/dist` with a static host, and run `npm run start
--workspace=@orlast/api` after building and migrating the database. Keep the
catalog workspace installed alongside the API. Set `DATABASE_URL`,
`NODE_ENV=production`, `WEB_URL` to your HTTPS storefront URL, and Stripe keys.
Configure the host to forward `/api` to Express on the same origin. The local
Vite proxy uses `API_URL` (default `http://127.0.0.1:3001`). If you change the web
port, update `WEB_URL` too so browser-origin validation accepts requests.

The GitHub Pages workflow publishes only static files. Account and checkout
requests require a host with the API proxy described above; GitHub Pages alone
cannot run Express or proxy these requests. The request limiter is per API
process; configure shared rate limiting before scaling to multiple instances.

References: [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create),
[Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment),
[Docker databases](https://docs.docker.com/guides/databases/), and
[Vite proxy](https://vite.dev/config/server-options#server-proxy).
