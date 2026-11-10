import * as auth from "./commands/auth.mjs";
import * as commerce from "./commands/commerce.mjs";
import * as content from "./commands/content.mjs";
import * as meta from "./commands/meta.mjs";
import { usageError } from "./errors.mjs";

/**
 * Single source of truth for command discovery, help, schemas and dispatch.
 * `run` receives the shared CLI context created by main.mjs.
 */
export const COMMANDS = [
  { path: "auth login", summary: "Log in and save an API key.", usage: "cloudcart auth login --url URL --email EMAIL [--password-stdin]", mutates: true, examples: ["cloudcart auth login --url https://store.example.com --email owner@example.com"], run: auth.login },
  { path: "auth setup", summary: "Initialize a new store and save an API key.", usage: "cloudcart auth setup --url URL --setup-token TOKEN --email EMAIL --password-stdin --name NAME", mutates: true, run: auth.setup },
  { path: "auth status", summary: "Show saved profiles and keys.", usage: "cloudcart auth status [--probe]", run: auth.status },
  { path: "auth whoami", summary: "Show the authenticated administrator.", usage: "cloudcart auth whoami", run: auth.whoami },
  { path: "auth logout", summary: "Revoke the current key and remove the local profile.", usage: "cloudcart auth logout [--forget]", mutates: true, run: auth.logout },
  { path: "keys list", summary: "List API keys for the current administrator.", usage: "cloudcart keys list", run: auth.keysList },
  { path: "keys create", summary: "Create an API key through a temporary password session.", usage: "cloudcart keys create --name NAME [--scope SCOPE]...", mutates: true, run: auth.keysCreate },
  { path: "keys revoke", summary: "Revoke an API key through a temporary password session.", usage: "cloudcart keys revoke KEY_ID --yes", mutates: true, run: auth.keysRevoke },

  { path: "products list", summary: "List products.", usage: "cloudcart products list [--status STATUS] [--q TEXT]", run: content.productsList },
  { path: "products get", summary: "Get a product.", usage: "cloudcart products get PRODUCT_ID", run: content.productsGet },
  { path: "products create", summary: "Create a product and import/attach images.", usage: "cloudcart products create --name NAME --price PRICE [--data JSON] [--storage r2|jsdelivr]", mutates: true, examples: ["cloudcart products create --name \"Canvas Tote\" --price 25.00 --status active --image https://example.com/tote.jpg --storage jsdelivr"], run: content.productsCreate },
  { path: "products update", summary: "Update a product (GET + merge or full --data).", usage: "cloudcart products update PRODUCT_ID [--data JSON|--name ...] [--storage r2|jsdelivr]", mutates: true, run: content.productsUpdate },
  { path: "products status", summary: "Set a product status.", usage: "cloudcart products status PRODUCT_ID draft|active|archived", mutates: true, run: content.productsStatus },
  { path: "products delete", summary: "Delete a product.", usage: "cloudcart products delete PRODUCT_ID [--delete-media] --yes", mutates: true, run: content.productsDelete },
  { path: "products images add", summary: "Attach an existing media id to a product.", usage: "cloudcart products images add PRODUCT_ID MEDIA_ID [--alt TEXT]", mutates: true, run: content.productImagesAdd },
  { path: "products images attach", summary: "Import/upload an image and attach it to a product.", usage: "cloudcart products images attach PRODUCT_ID --image-url URL|--file PATH [--storage r2|jsdelivr] [--external]", mutates: true, examples: ["cloudcart products images attach prd_123 --image-url https://example.com/a.jpg --storage jsdelivr"], run: content.productImagesAttach },
  { path: "products images remove", summary: "Remove a product image.", usage: "cloudcart products images remove PRODUCT_ID IMAGE_ID --yes", mutates: true, run: content.productImagesRemove },
  { path: "products images order", summary: "Reorder product images.", usage: "cloudcart products images order PRODUCT_ID IMAGE_ID...", mutates: true, run: content.productImagesOrder },

  { path: "media list", summary: "List media.", usage: "cloudcart media list", run: content.mediaList },
  { path: "media add-url", summary: "Register an external HTTPS URL without storing a copy.", usage: "cloudcart media add-url URL [--alt TEXT]", mutates: true, run: content.mediaAddUrl },
  { path: "media upload", summary: "Upload a local image into configured storage.", usage: "cloudcart media upload PATH [--alt TEXT] [--storage r2|jsdelivr]", mutates: true, run: content.mediaUpload },
  { path: "media import-url", summary: "Download a URL and store a copy in configured storage.", usage: "cloudcart media import-url URL [--alt TEXT] [--storage r2|jsdelivr]", mutates: true, run: content.mediaImportUrl },
  { path: "media storage", summary: "Show media storage provider status.", usage: "cloudcart media storage", run: content.mediaStorage },
  { path: "media delete", summary: "Delete media.", usage: "cloudcart media delete MEDIA_ID --yes", mutates: true, run: content.mediaDelete },

  { path: "categories list", summary: "List categories.", usage: "cloudcart categories list", run: content.categoriesList },
  { path: "categories create", summary: "Create a category.", usage: "cloudcart categories create --name NAME", mutates: true, run: content.categoriesCreate },
  { path: "categories update", summary: "Update a category.", usage: "cloudcart categories update CATEGORY_ID --name NAME", mutates: true, run: content.categoriesUpdate },
  { path: "categories delete", summary: "Delete a category.", usage: "cloudcart categories delete CATEGORY_ID --yes", mutates: true, run: content.categoriesDelete },

  { path: "pages list", summary: "List content pages.", usage: "cloudcart pages list", run: content.pagesList },
  { path: "pages get", summary: "Get a page and its draft/versions.", usage: "cloudcart pages get SLUG", run: content.pagesGet },
  { path: "pages create", summary: "Create a content page.", usage: "cloudcart pages create --title TITLE --slug SLUG", mutates: true, run: content.pagesCreate },
  { path: "pages draft", summary: "Save a page document as draft.", usage: "cloudcart pages draft SLUG --data JSON|@file|-", mutates: true, run: content.pagesDraft },
  { path: "pages publish", summary: "Publish a page draft.", usage: "cloudcart pages publish SLUG", mutates: true, run: content.pagesPublish },
  { path: "pages versions", summary: "List page versions.", usage: "cloudcart pages versions SLUG", run: content.pagesVersions },
  { path: "pages version", summary: "Get one page version.", usage: "cloudcart pages version SLUG VERSION", run: content.pagesVersion },
  { path: "pages restore", summary: "Restore a version into the draft.", usage: "cloudcart pages restore SLUG VERSION", mutates: true, run: content.pagesRestore },
  { path: "pages preview", summary: "Render a draft preview.", usage: "cloudcart pages preview SLUG --data JSON [--out FILE]", mutates: false, run: content.pagesPreview },
  { path: "pages rename", summary: "Rename a page title.", usage: "cloudcart pages rename SLUG --title TITLE", mutates: true, run: content.pagesRename },
  { path: "pages delete", summary: "Delete a content page.", usage: "cloudcart pages delete SLUG --yes", mutates: true, run: content.pagesDelete },

  { path: "blog list", summary: "List content pages used as blog posts.", usage: "cloudcart blog list [--q TEXT] [--status draft|published|all]", run: content.blogList },
  { path: "blog get", summary: "Get a blog page.", usage: "cloudcart blog get SLUG", run: content.blogGet },
  { path: "blog create", summary: "Create a blog page (hero + rich text).", usage: "cloudcart blog create --title TITLE --slug SLUG --text-file FILE [--publish]", mutates: true, examples: ["cloudcart blog create --title \"Launch notes\" --slug launch-notes --text-file post.html --publish"], run: content.blogCreate },
  { path: "blog update", summary: "Update a blog page.", usage: "cloudcart blog update SLUG [--text-file FILE] [--publish]", mutates: true, run: content.blogUpdate },
  { path: "blog publish", summary: "Publish a blog page.", usage: "cloudcart blog publish SLUG", mutates: true, run: content.blogPublish },
  { path: "blog delete", summary: "Delete a blog page.", usage: "cloudcart blog delete SLUG --yes", mutates: true, run: content.blogDelete },

  { path: "orders list", summary: "List orders.", usage: "cloudcart orders list [--status STATUS] [--q TEXT]", run: commerce.ordersList },
  { path: "orders get", summary: "Get an order.", usage: "cloudcart orders get ORDER_ID", run: commerce.ordersGet },
  { path: "orders status", summary: "Set an order status.", usage: "cloudcart orders status ORDER_ID STATUS", mutates: true, run: commerce.ordersStatus },
  { path: "orders confirm-payment", summary: "Confirm a manual payment.", usage: "cloudcart orders confirm-payment ORDER_ID [--note TEXT]", mutates: true, run: commerce.ordersConfirm },
  { path: "orders ship", summary: "Set shipment details.", usage: "cloudcart orders ship ORDER_ID --carrier NAME --tracking-number NUMBER", mutates: true, run: commerce.ordersShip },
  { path: "orders note", summary: "Add an internal order note.", usage: "cloudcart orders note ORDER_ID --note TEXT", mutates: true, run: commerce.ordersNote },
  { path: "orders cancel", summary: "Cancel an order and restock.", usage: "cloudcart orders cancel ORDER_ID --yes", mutates: true, run: commerce.ordersCancel },
  { path: "orders refund", summary: "Refund an order amount.", usage: "cloudcart orders refund ORDER_ID --amount 12.34 --yes", mutates: true, run: commerce.ordersRefund },

  { path: "customers list", summary: "List customers.", usage: "cloudcart customers list [--q TEXT]", run: commerce.customersList },
  { path: "customers get", summary: "Get a customer.", usage: "cloudcart customers get CUSTOMER_ID", run: commerce.customersGet },
  { path: "customers notes", summary: "Update customer notes.", usage: "cloudcart customers notes CUSTOMER_ID --notes TEXT", mutates: true, run: commerce.customersNotes },

  { path: "coupons list", summary: "List coupons.", usage: "cloudcart coupons list", run: commerce.couponsList },
  { path: "coupons get", summary: "Get a coupon with product/category scope.", usage: "cloudcart coupons get COUPON_ID", run: commerce.couponsGet },
  { path: "coupons create", summary: "Create a coupon.", usage: "cloudcart coupons create --data JSON|--code CODE --type percent --value 10", mutates: true, run: commerce.couponsCreate },
  { path: "coupons update", summary: "Update a coupon (full --data).", usage: "cloudcart coupons update COUPON_ID --data JSON", mutates: true, run: commerce.couponsUpdate },
  { path: "coupons delete", summary: "Delete a coupon.", usage: "cloudcart coupons delete COUPON_ID --yes", mutates: true, run: commerce.couponsDelete },

  { path: "shipping list", summary: "List shipping zones and rates.", usage: "cloudcart shipping list", run: commerce.shippingList },
  { path: "shipping zones create", summary: "Create a shipping zone.", usage: "cloudcart shipping zones create --name NAME --countries US,CA", mutates: true, run: commerce.shippingZoneCreate },
  { path: "shipping zones update", summary: "Update a shipping zone.", usage: "cloudcart shipping zones update ZONE_ID --name NAME", mutates: true, run: commerce.shippingZoneUpdate },
  { path: "shipping zones delete", summary: "Delete a shipping zone.", usage: "cloudcart shipping zones delete ZONE_ID --yes", mutates: true, run: commerce.shippingZoneDelete },
  { path: "shipping rates create", summary: "Create a shipping rate.", usage: "cloudcart shipping rates create --zone ZONE_ID --name NAME --price 5.00", mutates: true, run: commerce.shippingRateCreate },
  { path: "shipping rates update", summary: "Update a shipping rate.", usage: "cloudcart shipping rates update RATE_ID --price 6.00", mutates: true, run: commerce.shippingRateUpdate },
  { path: "shipping rates delete", summary: "Delete a shipping rate.", usage: "cloudcart shipping rates delete RATE_ID --yes", mutates: true, run: commerce.shippingRateDelete },

  { path: "tax list", summary: "List tax rates.", usage: "cloudcart tax list", run: commerce.taxList },
  { path: "tax create", summary: "Create a tax rate.", usage: "cloudcart tax create --name NAME --country US --rate-percent 8.25", mutates: true, run: commerce.taxCreate },
  { path: "tax update", summary: "Update a tax rate.", usage: "cloudcart tax update RATE_ID --rate-percent 9", mutates: true, run: commerce.taxUpdate },
  { path: "tax delete", summary: "Delete a tax rate.", usage: "cloudcart tax delete RATE_ID --yes", mutates: true, run: commerce.taxDelete },

  { path: "api", summary: "Call any /api/admin endpoint.", usage: "cloudcart api METHOD /api/admin/PATH [--data JSON]", mutates: true, run: meta.api },
  { path: "capabilities", summary: "Show commands and live capabilities.", usage: "cloudcart capabilities [--json] [--probe]", run: meta.capabilities },
  { path: "schema", summary: "Show command metadata and JSON schemas.", usage: "cloudcart schema [command]", run: meta.schema },
  { path: "doctor", summary: "Diagnose config, URL, key and server.", usage: "cloudcart doctor", run: meta.doctor },
  { path: "version", summary: "Show the CLI version.", usage: "cloudcart version", run: meta.version },
  { path: "help", summary: "Show help.", usage: "cloudcart help", run: meta.help },
];

export function resolveCommand(positionals) {
  const matches = COMMANDS
    .filter((command) => {
      const parts = command.path.split(" ");
      return parts.every((part, index) => positionals[index] === part);
    })
    .sort((left, right) => right.path.split(" ").length - left.path.split(" ").length);
  if (matches.length === 0) {
    throw usageError(`Unknown command: ${positionals.join(" ") || "(none)"}. Run \`cloudcart help\`.`);
  }
  const definition = matches[0];
  return {
    definition,
    args: positionals.slice(definition.path.split(" ").length),
  };
}
