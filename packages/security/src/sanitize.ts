import { escapeAttr, escapeHtml } from "@cloudcart/shared";

const RICH_TEXT_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "a", "img", "hr",
  "span", "div", "table", "thead", "tbody", "tr", "th", "td", "code", "pre",
]);

const CUSTOM_HTML_TAGS = new Set([
  ...RICH_TEXT_TAGS,
  "section", "article", "figure", "figcaption", "picture", "source", "video",
  "small", "label", "dl", "dt", "dd",
]);

const VOID_TAGS = new Set(["br", "img", "hr", "source", "input"]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "width", "height", "class", "id", "loading",
  "decoding", "colspan", "rowspan", "rel", "target", "type", "controls", "poster",
]);

const DANGEROUS_CONTENT = /<(script|style|iframe|object|embed|template|noscript|svg|math|form|textarea|select|button|link|meta|base)\b[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_SELF_CLOSING = /<(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi;

/**
 * Strict allowlist HTML sanitizer.
 *
 * - Drops dangerous elements together with their content (script/style/...).
 * - Rebuilds allowed tags and attributes from scratch.
 * - Only allows http(s), mailto, tel and same-site URLs.
 * - Never allows event handler attributes, style attributes or data: URLs.
 */
export function sanitizeHtml(input: string, options: { allowImages?: boolean; allowVideo?: boolean } = {}): string {
  if (!input) return "";
  const allowed = options.allowVideo ? CUSTOM_HTML_TAGS : RICH_TEXT_TAGS;
  let working = String(input)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(DANGEROUS_CONTENT, "")
    .replace(DANGEROUS_SELF_CLOSING, "");

  let out = "";
  let index = 0;
  while (index < working.length) {
    const open = working.indexOf("<", index);
    if (open === -1) {
      out += escapeHtml(working.slice(index));
      break;
    }
    out += escapeHtml(working.slice(index, open));
    const close = working.indexOf(">", open);
    if (close === -1) {
      out += escapeHtml(working.slice(open));
      break;
    }
    const rawTag = working.slice(open + 1, close);
    const parsed = parseTag(rawTag);
    if (!parsed || !allowed.has(parsed.name)) {
      // Unknown tag: drop the tag, keep following text.
      index = close + 1;
      continue;
    }
    if (parsed.closing) {
      if (!VOID_TAGS.has(parsed.name)) out += `</${parsed.name}>`;
    } else {
      out += renderTag(parsed, options);
    }
    index = close + 1;
  }
  return out;
}

/** Escape everything except a tiny set of inline formatting tags. */
export function sanitizePlainText(value: string): string {
  return escapeHtml(value);
}

function parseTag(raw: string): { name: string; closing: boolean; attrs: Array<[string, string]> } | null {
  let text = raw.trim();
  const closing = text.startsWith("/");
  if (closing) text = text.slice(1).trim();
  const match = /^([a-zA-Z][a-zA-Z0-9-]*)\b([\s\S]*)$/.exec(text);
  if (!match) return null;
  const name = match[1]!.toLowerCase();
  const attrs: Array<[string, string]> = [];
  const attrText = match[2] ?? "";
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let attr: RegExpExecArray | null;
  while ((attr = attrRe.exec(attrText)) !== null) {
    const key = attr[1]!.toLowerCase();
    const value = attr[2] ?? attr[3] ?? attr[4] ?? "";
    attrs.push([key, decodeEntities(value)]);
  }
  return { name, closing, attrs };
}

function renderTag(
  tag: { name: string; attrs: Array<[string, string]> },
  options: { allowImages?: boolean; allowVideo?: boolean },
): string {
  const parts: string[] = [tag.name];
  let relAdded = false;
  for (const [rawKey, rawValue] of tag.attrs) {
    const key = rawKey.toLowerCase();
    if (!ALLOWED_ATTRS.has(key)) continue;
    if (rawKey.startsWith("on")) continue;
    if (key === "src" && tag.name === "img" && !options.allowImages) continue;
    if (key === "src" && !options.allowImages) continue;
    if (key === "src" && tag.name === "video" && !options.allowVideo) continue;
    if ((key === "href" || key === "src") && !isSafeUrl(rawValue, key === "src")) continue;
    if (key === "src" && tag.name === "img" && !options.allowImages) continue;
    if (key === "target") {
      if (rawValue !== "_blank" && rawValue !== "_self") continue;
      parts.push(`target="${rawValue}"`);
      continue;
    }
    if (key === "class") {
      const safeClass = rawValue.replace(/[^a-zA-Z0-9_\-\s]/g, "").slice(0, 200);
      if (safeClass) parts.push(`class="${safeClass}"`);
      continue;
    }
    const attrValue = key === "href" || key === "src" ? rawValue : rawValue.slice(0, 2000);
    parts.push(`${key}="${escapeAttr(attrValue)}"`);
    if (key === "href" && !relAdded) {
      relAdded = true;
      parts.push('rel="noopener noreferrer"');
    }
  }
  if (tag.name === "a" && !parts.some((p) => p.startsWith("target="))) {
    // keep links in the same tab by default
  }
  return `<${parts.join(" ")}${VOID_TAGS.has(tag.name) ? " /" : ""}>`;
}

function isSafeUrl(value: string, isResource: boolean): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("#")) return true;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return true;
  if (!isResource && (lower.startsWith("mailto:") || lower.startsWith("tel:"))) return true;
  return false;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
