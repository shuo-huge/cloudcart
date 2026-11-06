import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";

export interface AdminLocale {
  code: string;
  label: string;
}

interface ApiState {
  enabled: boolean;
  defaultLocale: string;
  showSwitcher: boolean;
  locales: AdminLocale[];
  dictionaries: Record<string, Record<string, string>>;
}

interface I18nValue {
  ready: boolean;
  enabled: boolean;
  locale: string;
  defaultLocale: string;
  locales: AdminLocale[];
  showSwitcher: boolean;
  messages: Record<string, string>;
  setLocale: (code: string) => void;
}

const STORAGE_KEY = "cloudcart.admin.locale";

const I18nContext = createContext<I18nValue>({
  ready: false,
  enabled: false,
  locale: "en",
  defaultLocale: "en",
  locales: [{ code: "en", label: "English" }],
  showSwitcher: false,
  messages: {},
  setLocale: () => undefined,
});

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [value, setValue] = useState<I18nValue>({
    ready: false,
    enabled: false,
    locale: "en",
    defaultLocale: "en",
    locales: [{ code: "en", label: "English" }],
    showSwitcher: false,
    messages: {},
    setLocale: () => undefined,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/i18n", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((response) => response.ok ? response.json() as Promise<ApiState> : null)
      .then((data) => {
        if (!active || !data) return;
        const locales = Array.isArray(data.locales) && data.locales.length > 0
          ? data.locales
          : [{ code: "en", label: "English" }];
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(STORAGE_KEY);
        } catch {
          stored = null;
        }
        const validStored = stored && locales.some((locale) => locale.code === stored) ? stored : null;
        const defaultValid = locales.some((locale) => locale.code === data.defaultLocale) ? data.defaultLocale : "en";
        const locale = data.enabled ? (validStored ?? defaultValid) : "en";
        const messages = data.enabled ? (data.dictionaries?.[locale] ?? {}) : {};
        setValue({
          ready: true,
          enabled: Boolean(data.enabled),
          locale,
          defaultLocale: defaultValid,
          locales,
          showSwitcher: Boolean(data.showSwitcher),
          messages,
          setLocale: (code: string) => {
            if (!code || code === locale) return;
            try {
              window.localStorage.setItem(STORAGE_KEY, code);
            } catch {
              // storage unavailable — the reload will fall back to default
            }
            window.location.reload();
          },
        });
      })
      .catch(() => {
        if (active) setValue((current) => ({ ...current, ready: true }));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (value.ready) document.documentElement.lang = value.locale;
  }, [value.ready, value.locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
const CELL_WHITELIST = ".badge, .link-button, .button, .row-actions, .empty-state, .pagination";
const ATTRIBUTE_KEYS = ["placeholder", "aria-label", "title"];

function translateText(node: Text, messages: Record<string, string>): void {
  const parent = node.parentElement;
  if (!parent) return;
  if (parent.closest("script, style, textarea, code, pre, [data-i18n-skip]")) return;
  // Never translate business data inside table cells; only known UI affordances.
  if (parent.closest("td") && !parent.closest(CELL_WHITELIST)) return;
  const original = node.nodeValue ?? "";
  const trimmed = original.trim();
  if (!trimmed) return;
  const translated = messages[trimmed];
  if (!translated || translated === trimmed) return;
  const start = original.indexOf(trimmed);
  node.nodeValue = original.slice(0, start) + translated + original.slice(start + trimmed.length);
}

function translateAttributes(element: Element, messages: Record<string, string>): void {
  for (const key of ATTRIBUTE_KEYS) {
    const value = element.getAttribute(key);
    if (!value) continue;
    const translated = messages[value.trim()];
    if (translated && translated !== value) element.setAttribute(key, translated);
  }
}

function translateTree(root: Node, messages: Record<string, string>): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateText(root as Text, messages);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root as Element;
  if (SKIP_TAGS.has(element.tagName) || element.hasAttribute("data-i18n-skip")) return;
  translateAttributes(element, messages);
  for (const child of Array.from(element.childNodes)) translateTree(child, messages);
}

/**
 * Applies the language pack to the rendered admin UI.
 *
 * Only exact UI-string matches are replaced; product names, emails, addresses
 * and other business data inside table cells stay untouched. Strings that are
 * not in the dictionary remain in English. Switching languages reloads the
 * page, so the DOM always starts from clean English source text.
 */
export function TranslationOverlay() {
  const { ready, enabled, locale, messages } = useI18n();

  useEffect(() => {
    if (!ready || !enabled || locale === "en" || Object.keys(messages).length === 0) return;
    translateTree(document.body, messages);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          translateText(record.target as Text, messages);
          continue;
        }
        for (const node of Array.from(record.addedNodes)) translateTree(node, messages);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [ready, enabled, locale, messages]);

  return null;
}
