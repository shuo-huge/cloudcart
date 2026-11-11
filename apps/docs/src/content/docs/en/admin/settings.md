---
title: Store settings
description: Store information, password, SEO, redirects, audit log and resource usage.
---

**Admin → Settings** centralises store-level configuration.

## Store information

- Store name
- Currency (ISO 4217, e.g. USD, CNY)
- Language/region (e.g. zh-CN, en-US)
- Support email
- Support phone
- Business address
- Logo URL
- Announcement bar text

This information is used in the storefront header and footer, emails and SEO.

## Changing your password

Enter your current password and a new password. The new password must be at least 8 characters and contain letters and numbers.

After changing your password, other admin sessions are invalidated immediately.

## Taxes

Tax configuration lives in the **Taxes** card in Settings:

- Default tax name
- Default tax rate
- Whether prices include tax
- Country/region tax rate rules

See [Shipping & tax](/en/admin/shipping-tax/) for details.

## SEO

**Admin → SEO**:

- Default title
- Default meta description
- 301 redirects

Each product and category can also have its own SEO title and description.

## Audit log

Records key admin actions: sign-ins, product changes, order status changes, plugin enable/disable, settings changes and more.

## Resource usage

The admin shows local estimates:

- API requests
- D1 reads and writes
- R2 operations
- Media storage
- Product/order counts

These are estimates; the Cloudflare Dashboard is the authoritative source.

## Maintenance mode

You can set a maintenance announcement. Maintenance mode does not automatically close checkout, so use it with care.
