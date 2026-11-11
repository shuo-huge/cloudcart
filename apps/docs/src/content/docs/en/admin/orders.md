---
title: Orders & fulfilment
description: View orders, confirm payment, ship orders and issue refunds.
---

## Order list

**Admin → Orders** shows the order number, customer, amount, payment status, order status and time. You can filter by status, payment status and keyword.

## Order details

Click an order to open its detail page, where you can see:

- Line items and amounts
- Shipping address
- Customer notes and internal notes
- Payment transaction records
- Activity timeline
- Tracking information

## Manual payments

If the customer chooses manual payment (bank transfer, cash on delivery, etc.):

1. Confirm that the funds have actually been received
2. Click **Confirm payment**
3. Add a note (optional)
4. The order becomes `paid`

The system records the confirming admin's ID, time and note, and writes them to the audit log.

## Shipping

Fill in:

- Carrier
- Tracking number
- Tracking URL (optional)

Then set the order status to `shipped`. Customers can see the tracking information on the order page.

The order state machine is enforced by the server; invalid transitions are not allowed.

## Cancelling an order

Cancelling an order automatically returns the reserved inventory. Whether a paid order can be cancelled depends on its current status.

## Refunds

Refunds can be recorded:

- Manual payments: record the refund amount directly
- Stripe / PayPal: call the payment provider's refund API and record the refund on success
- Remote payment plugins: call the plugin's refund endpoint

Refunds do not delete the order or payment transactions. A partial refund marks the order as `partially_refunded`.

## Order privacy

Order access links use signed tokens, so customers can view their orders without signing in. Do not share order links publicly.
