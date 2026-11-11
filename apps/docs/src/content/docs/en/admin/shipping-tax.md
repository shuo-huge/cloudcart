---
title: Shipping & tax
description: Configure shipping zones, shipping rates and country/region tax rates.
---

## Shipping zones

**Admin → Shipping → Zones**:

- Zone name
- List of country codes (e.g. `US, CA, GB`)
- Whether it is the default zone

If the shipping country does not match any zone, the default zone is used.

## Shipping rates

Each zone can have multiple shipping rates:

- Rate name
- Price
- Minimum order amount
- Maximum order amount
- Free shipping above a threshold
- Whether enabled

At checkout, CloudCart selects the available shipping rates based on the shipping address and order amount.

## Taxes

**Admin → Settings → Taxes**:

- **Tax name**: for example Sales tax or VAT
- **Default tax rate**: used when no rule matches
- **Product prices include tax**: when enabled, tax is extracted from the displayed price rather than added on top

### Tax rate rules

You can add rules that override the default by country/region:

| Field | Description |
|---|---|
| Name | For example California sales tax |
| Country | Two-letter ISO code, e.g. US |
| Region/state | Optional; leave blank for the whole country |
| Tax rate | Percentage, e.g. 8.25 |
| Enabled | Whether the rule applies |

Matching order:

1. Exact country + region match
2. Country-level rule (region blank)
3. Default tax rate

### Tax base

Tax is calculated on:

```text
max(0, item subtotal - discount + shipping)
```

- Ex-tax mode: tax is added on top of the order total
- Tax-inclusive mode: tax is extracted from the total, which stays unchanged

Tax is recorded on the order and automatically included in the payment amount.

## Notes

- The current version does not support tax-exempt customer certificates or per-product tax classes
- Changing tax rates does not affect historical orders
- Refunds do not recalculate historical tax
