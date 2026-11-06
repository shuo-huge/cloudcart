import type { PageSection } from "@cloudcart/shared";

export type FieldType = "text" | "textarea" | "url" | "number" | "select" | "color" | "checkbox" | "repeater" | "html";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  placeholder?: string;
  itemFields?: Array<{ key: string; label: string; type: "text" | "textarea" | "number" }>;
}

export interface BlockDef {
  type: string;
  label: string;
  group: "Structure" | "Commerce" | "Content" | "Utility";
  description: string;
  defaults: Record<string, unknown>;
  fields: FieldDef[];
}

const styleFields: FieldDef[] = [
  { key: "background", label: "Background", type: "color" },
  { key: "textColor", label: "Text colour", type: "color" },
  { key: "paddingTop", label: "Padding top (px)", type: "number", min: 0, max: 200 },
  { key: "paddingBottom", label: "Padding bottom (px)", type: "number", min: 0, max: 200 },
  {
    key: "align",
    label: "Alignment",
    type: "select",
    options: [
      { label: "Theme default", value: "" },
      { label: "Left", value: "left" },
      { label: "Center", value: "center" },
      { label: "Right", value: "right" },
    ],
  },
  { key: "maxWidth", label: "Max width (px)", type: "number", min: 320, max: 1600, hint: "Leave blank for the theme default." },
  {
    key: "font",
    label: "Font",
    type: "select",
    options: [
      { label: "Theme default", value: "" },
      { label: "Sans", value: "sans" },
      { label: "Serif", value: "serif" },
      { label: "Mono", value: "mono" },
      { label: "Display", value: "display" },
    ],
  },
];

export const BLOCK_DEFS: BlockDef[] = [
  {
    type: "hero",
    label: "Hero",
    group: "Structure",
    description: "Full-width opening banner with a headline and call to action.",
    defaults: { title: "New season", subtitle: "Discover the latest collection.", buttonText: "Shop now", buttonUrl: "/products" },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "subtitle", label: "Subheading", type: "text" },
      { key: "image", label: "Image URL", type: "url", placeholder: "/media/..." },
      { key: "imageAlt", label: "Image alt text", type: "text" },
      { key: "buttonText", label: "Button label", type: "text" },
      { key: "buttonUrl", label: "Button link", type: "url" },
    ],
  },
  {
    type: "announcement-bar",
    label: "Announcement bar",
    group: "Utility",
    description: "A thin promotional strip above the header.",
    defaults: { text: "Free shipping on orders over $75" },
    fields: [{ key: "text", label: "Message", type: "text" }],
  },
  {
    type: "image-banner",
    label: "Image banner",
    group: "Structure",
    description: "Side-by-side image and copy.",
    defaults: { title: "Crafted for everyday", text: "Considered materials and a quiet palette.", buttonText: "Explore" , buttonUrl: "/products" },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "text", label: "Text", type: "textarea" },
      { key: "image", label: "Image URL", type: "url" },
      { key: "imageAlt", label: "Image alt text", type: "text" },
      { key: "buttonText", label: "Button label", type: "text" },
      { key: "buttonUrl", label: "Button link", type: "url" },
    ],
  },
  {
    type: "product-grid",
    label: "Product grid",
    group: "Commerce",
    description: "A grid of products from the catalog.",
    defaults: { title: "Featured products", source: "featured", limit: 8 },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "subtitle", label: "Subheading", type: "text" },
      {
        key: "source",
        label: "Products",
        type: "select",
        options: [
          { label: "Featured", value: "featured" },
          { label: "Newest", value: "new" },
          { label: "All", value: "all" },
        ],
      },
      { key: "limit", label: "Maximum products", type: "number", min: 1, max: 24 },
    ],
  },
  {
    type: "featured-collection",
    label: "Featured collection",
    group: "Commerce",
    description: "A curated product row with the same grid renderer.",
    defaults: { title: "Best sellers", source: "all", limit: 4 },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      {
        key: "source",
        label: "Products",
        type: "select",
        options: [
          { label: "Featured", value: "featured" },
          { label: "Newest", value: "new" },
          { label: "All", value: "all" },
        ],
      },
      { key: "limit", label: "Maximum products", type: "number", min: 1, max: 24 },
    ],
  },
  {
    type: "category-grid",
    label: "Category grid",
    group: "Commerce",
    description: "Links to product categories.",
    defaults: { title: "Shop by category", limit: 4 },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "limit", label: "Maximum categories", type: "number", min: 1, max: 12 },
    ],
  },
  {
    type: "image-with-text",
    label: "Image with text",
    group: "Content",
    description: "A story block with an image and rich text.",
    defaults: { title: "Our story", text: "We make small-batch goods with care.", imagePosition: "left" },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "text", label: "Text (basic HTML allowed)", type: "html" },
      { key: "image", label: "Image URL", type: "url" },
      { key: "imageAlt", label: "Image alt text", type: "text" },
      {
        key: "imagePosition",
        label: "Image position",
        type: "select",
        options: [
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ],
      },
      { key: "buttonText", label: "Button label", type: "text" },
      { key: "buttonUrl", label: "Button link", type: "url" },
    ],
  },
  {
    type: "rich-text",
    label: "Rich text",
    group: "Content",
    description: "A centred rich-text column.",
    defaults: { title: "About us", text: "<p>Write something meaningful here.</p>" },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "text", label: "Text (basic HTML allowed)", type: "html" },
    ],
  },
  {
    type: "video-embed",
    label: "Video embed",
    group: "Content",
    description: "Native YouTube or Vimeo embed.",
    defaults: { title: "Behind the scenes" },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "url", label: "YouTube or Vimeo URL", type: "url" },
    ],
  },
  {
    type: "testimonials",
    label: "Testimonials",
    group: "Content",
    description: "Customer quotes with star ratings.",
    defaults: {
      title: "Loved by customers",
      items: [{ quote: "Beautiful quality.", name: "Alex R.", rating: 5 }],
    },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Testimonials",
        type: "repeater",
        itemFields: [
          { key: "quote", label: "Quote", type: "textarea" },
          { key: "name", label: "Name", type: "text" },
          { key: "rating", label: "Rating (1–5)", type: "number" },
        ],
      },
    ],
  },
  {
    type: "faq",
    label: "FAQ",
    group: "Content",
    description: "Expandable questions and answers.",
    defaults: { title: "Questions", items: [{ question: "How long is shipping?", answer: "Most orders ship within two business days." }] },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Questions",
        type: "repeater",
        itemFields: [
          { key: "question", label: "Question", type: "text" },
          { key: "answer", label: "Answer", type: "textarea" },
        ],
      },
    ],
  },
  {
    type: "trust-badges",
    label: "Trust badges",
    group: "Content",
    description: "Short reassurance points.",
    defaults: {
      items: [
        { title: "Free returns", text: "30-day returns on everything." },
        { title: "Secure checkout", text: "Encrypted payment processing." },
      ],
    },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Badges",
        type: "repeater",
        itemFields: [
          { key: "title", label: "Title", type: "text" },
          { key: "text", label: "Text", type: "text" },
        ],
      },
    ],
  },
  {
    type: "logo-list",
    label: "Logo list",
    group: "Content",
    description: "Press or partner logos.",
    defaults: { items: [] },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Logos",
        type: "repeater",
        itemFields: [
          { key: "image", label: "Image URL", type: "text" },
          { key: "name", label: "Alt text", type: "text" },
        ],
      },
    ],
  },
  {
    type: "newsletter",
    label: "Newsletter",
    group: "Content",
    description: "Collect subscribers into D1.",
    defaults: { title: "Stay in the loop", text: "New arrivals and offers — no spam." },
    fields: [
      { key: "title", label: "Heading", type: "text" },
      { key: "text", label: "Text", type: "textarea" },
    ],
  },
  {
    type: "custom-html",
    label: "Custom HTML",
    group: "Utility",
    description: "Sanitised HTML. Scripts are always removed.",
    defaults: { html: "<p>Custom content</p>" },
    fields: [{ key: "html", label: "HTML", type: "html", hint: "Sanitised on the server; scripts, iframes and event handlers are removed." }],
  },
  {
    type: "spacer",
    label: "Spacer",
    group: "Utility",
    description: "Vertical breathing room.",
    defaults: { height: 48 },
    fields: [{ key: "height", label: "Height (px)", type: "number", min: 0, max: 240 }],
  },
  {
    type: "divider",
    label: "Divider",
    group: "Utility",
    description: "A hairline rule.",
    defaults: {},
    fields: [],
  },
];

export function blockDef(type: string): BlockDef | undefined {
  return BLOCK_DEFS.find((block) => block.type === type);
}

export function newSection(type: string): PageSection {
  const def = blockDef(type);
  return {
    id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
    type,
    enabled: true,
    settings: { ...(def?.defaults ?? {}) },
  };
}

export function allFields(def: BlockDef): FieldDef[] {
  return [...def.fields, ...styleFields];
}
