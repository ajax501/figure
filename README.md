# FIGURE

Premium clothing storefront with product 001, actual front and back product views, XS–XXL sizing, persistent bag, and Stripe-hosted Checkout on Vercel.

## Deploy

Import `ajax501/figure` as a new Vercel project. Framework preset: Other. The included vercel.json selects `npm run build` and `dist`; API functions deploy from `api/`.

In Vercel Settings > Environment Variables, add:

| Variable | Test setup |
| --- | --- |
| SITE_URL | Exact FIGURE deployment origin, without a trailing slash |
| STRIPE_SECRET_KEY | Your Stripe sandbox key; configure privately in Vercel |
| STRIPE_WEBHOOK_SECRET | Signing secret for this deployment's Stripe webhook |
| CHECKOUT_ENABLED | true |
| LIVE_CHECKOUT_APPROVED | false |
| STRIPE_AUTOMATIC_TAX | true |

No secrets belong in GitHub, frontend JavaScript, or chat. Redeploy after changing environment variables.

Create a Stripe event destination at `https://YOUR-FIGURE-DOMAIN/api/stripe-webhook`. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Use that destination's signing secret above. Stripe must be able to reach the endpoint.

## Confirmed commerce settings

- Products 001 and 002 are top-and-bottom sets at $220 USD each; products 003 and 004 are $200 USD each.
- All six sizes: XS, S, M, L, XL, XXL.
- $10 USD shipping per order, USA only.
- Prices and shipping are exclusive of calculated taxes. Configure Stripe Tax's business origin and applicable registrations before using automatic tax. Only disable automatic tax if appropriate for your actual tax setup.
- Products 001 through 004 are purchasable. Product 003 has front, side, top-only, and graphic-detail views. Remove any future unpriced items or concepts from the bag before checkout.
- Server-side catalog prices override browser-supplied prices. Quantities are limited to 20 per size per order.

## Test before launch

Run `npm ci`, `npm test`, and `npm run build`. For local development, copy .env.example to .env.local, set SITE_URL=http://localhost:3000 and test keys, then run `npm start`. Forward Stripe webhooks with Stripe CLI and use the matching signing secret.

On Vercel, test every size and a multi-size bag. Confirm $220 per set and $10 shipping per order, USA-only address collection, and the final taxes. Use Stripe test cards in sandbox only. Cancelled payments must preserve the bag; confirmed payments subtract only the purchased quantities, once. Verify a successful webhook delivery and `figure_payment_verified=true` in Stripe payment metadata.

Enable payment receipts and merchant payment notifications in Stripe; this site itself does not send emails.

## Go live

Complete Stripe activation, publish your shipping lead times and returns policy, then configure the live Stripe key and a separate live webhook signing secret. Set LIVE_CHECKOUT_APPROVED=true only after sandbox checkout passes. Redeploy. Set CHECKOUT_ENABLED=false to stop new sessions.

## Orders and fulfillment

Stripe is the payment/order ledger. Review paid Checkout sessions for delivery details, product sizes, quantities, and FIGURE order reference. Shipping and fulfillment are manual. Webhook retries safely repeat the same verification marker; track shipments by unique Stripe payment ID to avoid duplicate fulfillment. There is no inventory tracking or stock reservation, shipping-label purchase, or automated tracking email. Refunds are handled in Stripe.

The existing chatgpt.site preview is separate from this Vercel deployment. No DNE store settings or files are modified by this repository.

## Adding the next products

Add each design to lib/catalog.json with its numbered ID, confirmed price in integer USD cents, model name, image path, photo views, description, details, and included items. Place photos in public/assets/ID/. Set price=null until the price is approved. Use concept=true only for illustrative previews. Run npm test and npm run build; sync-catalog.js generates the browser catalog from that same authoritative server catalog. Never edit public/commerce-config.js directly. All products use XS through XXL. Checkout accepts any combination of purchasable products with $10 shipping once per order.
