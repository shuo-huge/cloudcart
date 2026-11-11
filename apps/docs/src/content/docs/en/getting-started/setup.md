---
title: Admin setup
description: Create the administrator and complete the store's basic configuration.
---

After a successful deployment, open the one-time link in the build log:

```text
https://<store>.workers.dev/setup?token=...
```

## Create the administrator

The setup page only asks for:

- Administrator name
- Login email
- Password (at least 8 characters, containing letters and numbers)

The store name and currency use the deployment defaults; you can change them later in the admin.

Once the administrator is created, the Setup link **expires immediately**. The system has no default administrator password.

## Recommended initial configuration

Complete the following in order and your store is ready to start selling:

1. **Settings → Store information**: store name, email, phone, address
2. **Settings → Tax**: default tax rate, tax-inclusive or tax-exclusive pricing, per-country/region overrides
3. **Shipping**: shipping zones, rates, free-shipping thresholds
4. **Products**: create products, upload or enter images, set stock
5. **Themes**: choose a theme and configure colours and fonts
6. **Payments**: enable manual payment, Stripe or PayPal, and enter the keys
7. **Email notifications** (optional): enable the plugin and configure the sending channel
8. **Pages**: complete and publish drafts such as About, Contact, FAQ and the privacy policy

## Security recommendations

- Use a strong password that you do not reuse on other sites
- Do not send the Setup link to anyone
- Payment keys are stored only in encrypted D1 settings and are never returned to the browser
- After you change your password, other admin sessions are invalidated immediately
