import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { publicSend } from "./api";
import { useI18n } from "./i18n";
import { linkProps, usePath } from "./router";
import type { Admin } from "./types";

const NAV = [
  { path: "/", label: "Dashboard" },
  { path: "/products", label: "Products" },
  { path: "/categories", label: "Categories" },
  { path: "/orders", label: "Orders" },
  { path: "/customers", label: "Customers" },
  { path: "/discounts", label: "Discounts" },
  { path: "/pages", label: "Page Builder" },
  { path: "/themes", label: "Themes" },
  { path: "/plugins", label: "Plugins" },
  { path: "/payments", label: "Payments" },
  { path: "/shipping", label: "Shipping" },
  { path: "/seo", label: "SEO" },
  { path: "/media", label: "Media" },
  { path: "/settings", label: "Settings" },
];

export function Shell({
  admin,
  onLogout,
  children,
}: {
  admin: Admin;
  onLogout: () => void;
  children: ComponentChildren;
}) {
  const path = usePath();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { enabled: i18nEnabled, showSwitcher, locales, locale, setLocale } = useI18n();

  async function logout() {
    setLoggingOut(true);
    try {
      await publicSend("/api/admin/logout", "POST", {});
    } finally {
      setLoggingOut(false);
      onLogout();
    }
  }

  return (
    <div class="shell">
      <aside class={`sidebar${open ? " sidebar--open" : ""}`}>
        <div class="sidebar-brand">
          <span class="brand-mark">C</span>
          <span>CloudCart</span>
        </div>
        <nav class="sidebar-nav">
          {NAV.map((item) => {
            const active = item.path === "/" ? path === "/" : path.startsWith(item.path);
            return (
              <a key={item.path} class={`sidebar-link${active ? " sidebar-link--active" : ""}`} {...linkProps(item.path)}>
                {item.label}
              </a>
            );
          })}
        </nav>
        <div class="sidebar-footer">
          <a class="sidebar-link" href="/" target="_blank" rel="noopener">View store ↗</a>
        </div>
      </aside>
      {open && <button type="button" class="sidebar-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div class="shell-main">
        <header class="topbar">
          <button type="button" class="menu-button" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu">☰</button>
          <div class="topbar-title">CloudCart Admin</div>
          <div class="topbar-user">
            {i18nEnabled && showSwitcher && locales.length > 1 && (
              <select
                class="locale-select"
                aria-label="Language"
                value={locale}
                onChange={(event) => setLocale((event.target as HTMLSelectElement).value)}
              >
                {locales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            )}
            <span class="topbar-name">{admin.name || admin.email}</span>
            <button type="button" class="button button--small" onClick={logout} disabled={loggingOut}>
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>
        <main class="content" onClick={() => setOpen(false)}>{children}</main>
      </div>
    </div>
  );
}
