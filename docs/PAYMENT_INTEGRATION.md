# Payment Integration

Three payment plugins are bundled: **Manual**, **Stripe**, **PayPal**.

All provider credentials are entered in **Admin → Payments**. Secret fields are write-only: they are
AES-GCM encrypted in D1 and returned to the browser only as `••••••••`.

---

## 1. Manual payment

Settings: offline type (bank transfer / cash on delivery / custom), customer instructions, bank
details.

Flow:
1. Checkout creates an order in `awaiting_manual_payment` with `payment_status = pending`.
2. The confirmation page displays the payment instructions.
3. An administrator reviews the bank transfer and clicks **Confirm payment received** in the order.
4. Core sets `paid`/`paid`, writes a `payment_transactions` row with `plugin_id = manual`,
   `provider_status = manually_confirmed`, records the admin id/time and an audit entry.

Only manual orders can be confirmed by an administrator. Stripe/PayPal orders are marked paid only by
a verified provider event.

---

## 2. Stripe

### Configuration

| Setting | Secret | Notes |
|---|---|---|
| Mode | no | `sandbox` or `live` |
| Publishable key | no | `pk_test_…` / `pk_live_…` |
| Secret key | yes | `sk_test_…` / `sk_live_…` |
| Webhook signing secret | yes | `whsec_…` |

Webhook endpoint: `https://<store>/webhooks/stripe`

Recommended events:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `payment_intent.payment_failed`, `charge.refunded`.

### Flow

1. Checkout validates the cart server-side and persists the order (`pending_payment`).
2. The Worker creates a Checkout Session with:
   - `mode=payment`
   - `client_reference_id` and `metadata[order_id]` = internal order id
   - a single line item whose `unit_amount` equals the server-computed order total
   - `success_url` = order confirmation URL (with `{CHECKOUT_SESSION_ID}`)
   - `Idempotency-Key: checkout-<order id>`
3. The customer pays on Stripe’s hosted page.
4. Stripe sends webhooks. The Worker verifies `Stripe-Signature` over the **raw body**
   (`HMAC-SHA256(secret, "<timestamp>.<body>")`, multiple `v1` values, 5-minute tolerance).
5. Core resolves the internal order, checks amount and currency, inserts the event id idempotently,
   then marks the transaction and order paid.

The success redirect alone never marks an order paid.

---

## 3. PayPal

### Configuration

| Setting | Secret | Notes |
|---|---|---|
| Mode | no | `sandbox` or `live` |
| Client ID | no | REST app client id |
| Client secret | yes | encrypted |
| Webhook ID | no | from the PayPal webhook configuration |

Webhook endpoint: `https://<store>/webhooks/paypal`

### Flow

1. Checkout creates the internal order (`pending_payment`).
2. The Worker obtains an OAuth token (`client_credentials`) and creates an Orders v2 order:
   - `reference_id` / `custom_id` = internal order id / number
   - `amount.value` / `currency_code` from the server-computed total
   - `return_url = https://<store>/api/payments/paypal/return?access=<signed order token>`
   - `cancel_url` = the order confirmation page
   - `PayPal-Request-Id: create-<order id>`
3. The customer approves on PayPal’s hosted page and is redirected back.
4. The return handler verifies the signed order token, confirms the PayPal order id is the one stored
   for that order, calls **capture** server-side (`PayPal-Request-Id: capture-<order id>`), and checks
   the captured amount/currency against the order.
5. Capture success is fed into the same idempotent payment-event pipeline with
   `eventId = capture-<capture id>`.
6. Webhooks are additionally verified via PayPal’s `verify-webhook-signature` API before processing.

Handled events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED/DECLINED`,
`PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`.

---

## 4. Refunds

- The admin “Record refund” action records the refund inside CloudCart.
- For Stripe/PayPal orders it first calls the provider refund API; a provider failure aborts the local
  record. Stripe refunds use the stored `payment_intent`; PayPal resolves the capture id from the
  PayPal order.
- Manual payments record a local refund transaction with the admin id.

Refund webhooks (`charge.refunded`, `PAYMENT.CAPTURE.REFUNDED`) also update the order through the
event pipeline.

---

## 5. Security invariants

- Prices, shipping, discounts and totals are recomputed server-side at checkout.
- Provider amounts/currencies must equal the internal order before it is marked paid.
- Event ids are unique per plugin; duplicates are acknowledged but not re-applied.
- Webhook signatures are checked before parsing.
- Secrets never reach the browser, logs, or API responses.
- Disabling a provider blocks new checkouts but webhooks for historical transactions still work.
- The Worker never stores Cloudflare API tokens.

---

## 6. Verification status

The automated suite covers:
- Stripe signature verification (valid, wrong secret, stale timestamp, missing timestamp);
- hosted session creation and redirect;
- signed webhook → paid; duplicate delivery → `duplicate` with one event and one transaction;
- invalid signature → HTTP 400;
- amount mismatch → order stays unpaid;
- PayPal OAuth/order creation → redirect;
- PayPal return capture → order paid;
- PayPal webhook verification calls the verify API and processes the event.

**No live Sandbox transaction has been performed against Stripe or PayPal in this repository.**
Provider APIs are mocked deterministically in `tests/payments.test.ts`. See `docs/TEST_REPORT.md`.
