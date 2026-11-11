---
title: Themes & page editor
description: Switch themes, edit the home page and content pages, and manage published versions.
---

## Themes

**Admin → Themes** lists eight built-in themes:

Default, Fashion, Beauty, Electronics, Jewelry, Home, Sports, Single Product.

Each theme has a different layout, typography and product card structure. Switching themes does not affect products, orders or page content.

Theme previews come from a 4×2 WebP sprite sheet; click a preview to view it full screen.

## Page editor

**Admin → Page Builder → select a page → Edit**.

The editor has three columns:

- **Left**: add blocks and page structure (drag to reorder)
- **Middle**: live desktop/tablet/mobile preview
- **Right**: content and style settings for the selected block

Supported blocks include Hero, image banner, product grid, featured categories, image with text, rich text, video, testimonials, FAQ, trust badges, logo list, spacer, divider, subscription, custom HTML and more.

## Autosave

The draft is saved automatically about 1.2 seconds after you edit. The top bar shows:

- All changes saved
- Saving…
- Unsaved changes
- Save failed

You can also click **Save** to save manually.

## Preview

Preview uses the **unpublished draft** and does not affect the live page. You can switch between:

- Desktop
- Tablet
- Mobile

## Publishing

Clicking **Publish** publishes the current draft as a new immutable version.

- The live page only reads the published version
- Later draft changes do not affect the live page
- The version number increments after publishing

## Version rollback

Click **Versions** to view published versions. Select an older version and click **Restore**:

1. The old snapshot is written into the current draft
2. The live page stays unchanged
3. After checking the preview, click **Publish**
4. Publishing creates a new version

Old version snapshots are never modified or deleted.

## Content pages

Page Builder also includes drafts for standard pages:

About, Contact, FAQ, Shipping Policy, Returns & Refunds, Privacy Policy, Terms of Service, Payment Policy.

Replace them with real merchant information before publishing; do not use the sample legal text as is.

## Custom HTML

Custom HTML blocks are sanitised against an allowlist; scripts, iframes, event handlers and `javascript:` URLs are not allowed.
