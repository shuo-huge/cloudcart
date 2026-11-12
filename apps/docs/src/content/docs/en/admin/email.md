---
title: Email notifications
description: Configure Resend or Cloudflare Email Workers to send order emails.
---

CloudCart includes a built-in **Email Notifications** plugin, disabled by default.

## Supported events

- Order placed
- Payment confirmed
- Order shipped
- Order cancelled
- Refund issued

Emails include the order number, items, amount, tax, shipping address, tracking information and private order link. If a store email is configured and the "CC the store" option is enabled, a copy is also sent to the store.

## Enabling the plugin

**Admin → Plugins → Email Notifications → Enable**.

Then go to **Admin → Emails** to configure it.

## Sending channels

### Resend

1. Sign up for Resend and create an API key
2. Select `Resend` in the Email settings
3. Enter the sender address and API key
4. Save

### Cloudflare Email Workers

You need:

- Your own domain with Email Routing enabled
- A `send_email` binding added to `wrangler.jsonc`

```jsonc
"send_email": [{ "name": "EMAIL" }]
```

Then select `Cloudflare Email Workers` in the Email settings.

## Test delivery

After saving and enabling the plugin, enter a recipient under **Emails → Test delivery** and click **Send test email**. CloudCart sends a real message through the configured Resend or Cloudflare transport.

## Outbox

The lower part of **Admin → Emails** shows the outbox:

- Queued: waiting in the queue
- Sending: being sent
- Sent: sent
- Failed: failed

Failures record the error and are retried with backoff after 1, 5, 15, 60 and 360 minutes. The Worker cron runs every 5 minutes and processes due retries automatically; the next order event or **Process queue / Retry failed** can also trigger them.

## Security

- The Resend API key is stored encrypted with AES-GCM
- Admin logs never return the email body
- Email delivery failures do not affect checkout or payment
- If the configuration is wrong, orders still work; emails are simply not sent

## Note

The current version has no delivery test against a real email provider; we recommend verifying once with a test mailbox before going live.
