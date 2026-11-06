import type { Database } from "@cloudcart/database";
import type { PageVersionRow } from "@cloudcart/database";
import { HttpError, newId, nowIso, type PageDocument, type PageSection } from "@cloudcart/shared";
import { z } from "zod";

const MAX_PAGE_JSON_BYTES = 256 * 1024;
const MAX_SECTIONS = 100;

const sectionSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.string().min(1).max(60),
  enabled: z.boolean().default(true),
  settings: z.record(z.string(), z.unknown()).default({}),
  blocks: z.array(z.unknown()).max(50).optional(),
});

const pageSchema = z.object({
  version: z.number().int().min(1).max(1000),
  page: z.string().min(1).max(80),
  sections: z.array(sectionSchema).max(MAX_SECTIONS),
});

export function validatePageDocument(input: unknown): PageDocument {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_page", "The page configuration is invalid.", parsed.error.issues);
  }
  const json = JSON.stringify(parsed.data);
  if (json.length > MAX_PAGE_JSON_BYTES) {
    throw new HttpError(413, "page_too_large", "The page configuration is too large.");
  }
  if (/<script/i.test(json)) {
    // Scripts are never allowed in page JSON; Custom HTML is sanitized at render time.
    throw new HttpError(400, "script_not_allowed", "Scripts cannot be embedded in page content.");
  }
  return parsed.data as PageDocument;
}

export function emptyPage(page = "home"): PageDocument {
  return { version: 1, page, sections: [] };
}


const DEFAULT_CONTENT_PAGES = [
  { slug: "about-us", title: "About Us", subtitle: "The people, purpose, and ideas behind our store.", heading: "Our Story", content: "<p>Replace this draft with your brand story, why you started this business, and what customers can expect from your store.</p><h2>What We Believe</h2><p>Describe the principles and product standards that are genuinely important to your business.</p>" },
  { slug: "contact-us", title: "Contact Us", subtitle: "We are here to help. Add verified support details before publishing.", heading: "Customer Support", content: "<p><strong>Email:</strong> [Add your customer support email]</p><p><strong>Phone:</strong> [Add your support phone, if available]</p><p><strong>Business address:</strong> [Add your business address, if applicable]</p><p><strong>Support hours:</strong> [Add your support hours and time zone]</p>" },
  { slug: "faq", title: "Frequently Asked Questions", subtitle: "Helpful information about shopping with us.", heading: "How Can We Help?", content: "<h2>How can I contact customer support?</h2><p>Add your support email and expected response time.</p><h2>When will my order ship?</h2><p>Describe your actual order processing time and shipping arrangements.</p><h2>What is your return policy?</h2><p>Summarize your Returns &amp; Refunds Policy after configuring it.</p>" },
  { slug: "shipping-policy", title: "Shipping Policy", subtitle: "Complete this draft to reflect your actual shipping operations.", heading: "Shipping Information", content: "<h2>Order Processing</h2><p>[Specify your actual processing time.]</p><h2>Shipping Destinations</h2><p>[List the countries and regions you ship to.]</p><h2>Shipping Methods and Costs</h2><p>[Describe available methods, charges, and free-shipping conditions.]</p><h2>Estimated Delivery</h2><p>[Provide realistic delivery estimates by destination.]</p><h2>Tracking</h2><p>[Explain when and how tracking details are provided.]</p><h2>Customs and Duties</h2><p>[Explain whether import duties or taxes may apply and who is responsible.]</p><h2>Delayed or Lost Packages</h2><p>[Explain how customers should contact you about shipment problems.]</p>" },
  { slug: "returns-refunds", title: "Returns & Refunds Policy", subtitle: "Configure your return conditions and refund process before publishing.", heading: "Return and Refund Information", content: "<h2>Return Window</h2><p>[Specify the return period and when it begins.]</p><h2>Return Eligibility</h2><p>[Describe product condition requirements and non-returnable items.]</p><h2>How to Request a Return</h2><p>[Explain how customers request a return.]</p><h2>Return Shipping</h2><p>[Explain who pays return shipping and whether original shipping is refundable.]</p><h2>Refund Processing</h2><p>[Explain review and refund timing.]</p><h2>Damaged or Incorrect Items</h2><p>[Explain how customers report damaged or incorrect items.]</p><h2>Exchanges</h2><p>[Explain whether exchanges are available.]</p>" },
  { slug: "privacy-policy", title: "Privacy Policy", subtitle: "Explain transparently how your business handles customer information.", heading: "Your Privacy", content: "<h2>Information We Collect</h2><p>[Describe information collected during browsing, checkout, and support.]</p><h2>How We Use Information</h2><p>[Describe how information is used.]</p><h2>Cookies and Similar Technologies</h2><p>[Describe the cookies and analytics tools actually used.]</p><h2>Sharing and Service Providers</h2><p>[Describe service providers and when information is shared.]</p><h2>Data Retention and Security</h2><p>[Describe retention practices and security measures without unsupported guarantees.]</p><h2>Your Privacy Rights</h2><p>[Explain applicable customer rights and how to exercise them.]</p><h2>Contact</h2><p>[Add your privacy contact details.]</p>" },
  { slug: "terms-of-service", title: "Terms of Service", subtitle: "Set out the terms that apply when customers use your store.", heading: "Terms and Conditions", content: "<h2>General Conditions</h2><p>[Identify your business and describe website-use conditions.]</p><h2>Products and Pricing</h2><p>[Explain product descriptions, availability, pricing, and pricing errors.]</p><h2>Orders and Acceptance</h2><p>[Explain order acceptance and cancellation.]</p><h2>Payments</h2><p>[Describe payment requirements.]</p><h2>Shipping and Returns</h2><p>[Refer to your shipping and returns policies.]</p><h2>Intellectual Property</h2><p>[Describe ownership and permitted use of store content.]</p><h2>Limitation of Liability</h2><p>[Complete this section after legal review.]</p><h2>Governing Law</h2><p>[Specify applicable law and jurisdiction after legal review.]</p><h2>Contact</h2><p>[Add business contact details.]</p>" },
  { slug: "payment-policy", title: "Payment Policy", subtitle: "Describe payment methods and the payment process configured for your store.", heading: "Payment Information", content: "<h2>Accepted Payment Methods</h2><p>[List only methods currently enabled in your store.]</p><h2>Currency</h2><p>[Specify supported checkout currencies.]</p><h2>Payment Authorization</h2><p>[Explain when payment is authorized or captured.]</p><h2>Failed Payments</h2><p>[Explain what customers should do if a payment fails.]</p><h2>Refunds</h2><p>[Refer to your Returns &amp; Refunds Policy and explain how approved refunds are sent.]</p>" }
];

export async function ensureDefaultContentPages(db: Database): Promise<void> {
  const existingRows = await db.all<{ slug: string }>("SELECT slug FROM pages");
  const existing = new Set(existingRows.map((row) => row.slug));
  const now = nowIso();
  const statements = DEFAULT_CONTENT_PAGES.filter((page) => !existing.has(page.slug)).map((page) => {
    const id = newId("page");
    const document: PageDocument = {
      version: 1,
      page: page.slug,
      sections: [
        { id: page.slug + "-hero", type: "hero", enabled: true, settings: { title: page.title, subtitle: page.subtitle } },
        { id: page.slug + "-content", type: "rich-text", enabled: true, settings: { title: page.heading, text: page.content } },
      ],
    };
    return db.prepare(
      "INSERT INTO pages (id, slug, title, type, draft_json, published_version, created_at, updated_at) VALUES (?, ?, ?, 'content', ?, NULL, ?, ?)",
      [id, page.slug, page.title, JSON.stringify(document), now, now],
    );
  });
  if (statements.length > 0) await db.batch(statements);
}

export async function getPage(db: Database, slug: string) {
  return db.first<{
    id: string;
    slug: string;
    title: string;
    type: "home" | "content";
    draft_json: string;
    published_version: number | null;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM pages WHERE slug = ?", [slug]);
}

export async function listPages(db: Database) {
  return db.all<{ id: string; slug: string; title: string; type: string; published_version: number | null; updated_at: string }>(
    "SELECT id, slug, title, type, published_version, updated_at FROM pages ORDER BY type DESC, updated_at DESC",
  );
}

export async function getDraftDocument(db: Database, slug: string): Promise<{ page: Awaited<ReturnType<typeof getPage>>; document: PageDocument } | null> {
  const page = await getPage(db, slug);
  if (!page) return null;
  let document: PageDocument;
  try {
    document = JSON.parse(page.draft_json) as PageDocument;
  } catch {
    document = emptyPage(slug);
  }
  return { page, document };
}

export async function getPublishedDocument(db: Database, slug: string): Promise<PageDocument | null> {
  const page = await getPage(db, slug);
  if (!page) return null;
  if (page.published_version === null) return null;
  const version = await db.first<PageVersionRow>(
    "SELECT * FROM page_versions WHERE page_id = ? AND version = ?",
    [page.id, page.published_version],
  );
  if (!version) return null;
  try {
    return JSON.parse(version.data_json) as PageDocument;
  } catch {
    return null;
  }
}

export async function saveDraft(db: Database, slug: string, input: unknown): Promise<PageDocument> {
  const page = await getPage(db, slug);
  if (!page) throw new HttpError(404, "page_not_found", "Page not found.");
  const document = validatePageDocument(input);
  await db.run("UPDATE pages SET draft_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(document), nowIso(), page.id]);
  return document;
}

export async function publishPage(db: Database, slug: string, adminId: string): Promise<{ version: number }> {
  const page = await getPage(db, slug);
  if (!page) throw new HttpError(404, "page_not_found", "Page not found.");
  let document: PageDocument;
  try {
    document = validatePageDocument(JSON.parse(page.draft_json));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_page", "The draft page configuration is invalid.");
  }
  const latest = await db.first<{ version: number | null }>(
    "SELECT MAX(version) AS version FROM page_versions WHERE page_id = ?",
    [page.id],
  );
  const version = (latest?.version ?? 0) + 1;
  const now = nowIso();
  await db.batch([
    db.prepare(
      `INSERT INTO page_versions (id, page_id, version, data_json, published_by, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId("pv"), page.id, version, JSON.stringify(document), adminId, now, now],
    ),
    db.prepare("UPDATE pages SET published_version = ?, updated_at = ? WHERE id = ?", [version, now, page.id]),
  ]);
  return { version };
}

export async function listPageVersions(db: Database, slug: string) {
  const page = await getPage(db, slug);
  if (!page) return [];
  return db.all<{ version: number; published_at: string; published_by: string | null }>(
    "SELECT version, published_at, published_by FROM page_versions WHERE page_id = ? ORDER BY version DESC LIMIT 50",
    [page.id],
  );
}

export async function createContentPage(db: Database, slug: string, title: string): Promise<string> {
  if (await db.exists("SELECT 1 FROM pages WHERE slug = ?", [slug])) {
    throw new HttpError(409, "slug_taken", "A page with this slug already exists.");
  }
  const id = newId("page");
  const now = nowIso();
  const document = emptyPage(slug);
  await db.run(
    "INSERT INTO pages (id, slug, title, type, draft_json, published_version, created_at, updated_at) VALUES (?, ?, ?, 'content', ?, NULL, ?, ?)",
    [id, slug, title, JSON.stringify(document), now, now],
  );
  return id;
}

export type { PageSection, PageDocument };
