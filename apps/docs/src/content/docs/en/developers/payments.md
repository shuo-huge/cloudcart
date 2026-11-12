---
title: Payment integration
description: How Manual, Stripe, PayPal and remote payment plugins work.
---

## Payment methods

CloudCart includes:

- **Manual**: bank transfer, cash on delivery, custom instructions
- **Stripe Checkout**
- **PayPal Orders v2**

Remote payment plugins are also supported; they run on the plugin author's service through the same `PaymentPlugin` contract.

## Checkout flow

1. The customer chooses a payment method
2. The server confirms that the method is enabled
3. Load the payment configuration
4. Call `createCheckout`
5. Return redirect or pending
6. After payment completes, webhook or return capture
7. `processPaymentEvent` validates amount/currency/idempotency
8. The order becomes `paid`

## Configuration

**Admin → Payments**:

- Enable/disable payment methods
- Enter secrets
- View webhook URLs

Payment secrets are encrypted with AES-GCM and are never returned to the browser.

## Webhooks

| Provider | URL |
|---|---|
| Stripe | `/webhooks/stripe` |
| PayPal | `/webhooks/paypal` |
| Remote plugin | `/webhooks/<plugin-id>` |

Requirements:

- Verify signatures using the raw request body
- Event ids must be unique
- Amount and currency must match the order
- Return 400 so the provider retries

## Refunds

**Admin → Order details → Refund**.

- Only `paid` or `partially_refunded` orders can be refunded; the amount cannot exceed the remaining
  refundable balance.
- Manual: record a local refund without moving money.
- Stripe/PayPal: call the provider's refund API, then record the local transaction.
- Remote plugin: call the plugin's refund endpoint.
- Partial and cumulative refund callbacks are checked against the remaining balance; duplicate
  callbacks are not applied twice.

Refunds do not delete orders or transaction records.

## Remote payment plugins

Remote plugins implement:

```ts
validateConfig
createCheckout
verifyWebhook
getPaymentStatus
captureOrder?
refund?
```

Actual calls are made over HMAC-signed HTTPS requests. CloudCart always retains the right to validate amounts; remote plugins cannot change order status directly.

## Testing

The payment provider APIs are mocked in automated tests. As of 2026-11-11, Stripe Sandbox has completed real payment and webhook verification using a test card; PayPal Sandbox is still pending, so run through the full flow with a Sandbox account before going live.

## Security recommendations

- Do not calculate amounts on the client
- Do not put payment secrets in the frontend
- Rotate secrets regularly
- Enable webhook signature verification
- Do not log full provider payloads
