---
title: Products & categories
description: Create products, variants, categories and inventory.
---

## Create a product

Go to **Admin → Products → New product** and fill in:

- Product name and URL slug
- Description (basic HTML is supported and sanitised on render)
- Price, compare-at price
- SKU, inventory
- Whether to manage inventory
- Status: Draft / Active / Archived
- Categories and tags
- SEO title and description

After saving, the product appears in the admin list and on the storefront product page.

## Product images

CloudCart uses **external HTTPS image URLs** by default; R2 is not required.

In the **Media** section of the product editor:

1. Enter a public HTTPS image URL and click **Add URL**
2. You can add multiple images
3. Drag images to reorder them
4. The first image automatically becomes the product cover

If you enable R2 later, you can also use file uploads. The default deployment does not create R2.

## Variants

After selecting the `variable` product type, you can add multiple variants, such as colour and size. Each variant can have its own:

- Title
- SKU
- Price
- Inventory
- Enabled status

Checkout uses the price and inventory of the specific variant.

## Categories

**Admin → Categories**:

- Create categories and set their name and slug
- Set the sort position
- You can set a parent category
- Products can belong to multiple categories

Categories appear in storefront navigation and on category pages.

## Inventory

If inventory management is enabled, CloudCart reserves inventory at checkout using a conditional update on the server to prevent overselling; the inventory is restored if order creation fails.

## Bulk management

The product list supports pagination, search and status filters. Deleting a product does not delete historical order snapshots.
