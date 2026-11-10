import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { publicSend } from "./api";
import { BrandMark, Icon, type IconName } from "./icons";
import { useI18n } from "./i18n";
import { usePluginNav } from "./plugin-nav";
import { linkProps, usePath } from "./router";
import type { Admin } from "./types";

const NAV: Array<{ path: string; label: string; icon: IconName }> = [
  { path: "/", label: "Dashboard", icon: "dashboard" },
  { path: "/products", label: "Products", icon: "products" },
  { path: "/categories", label: "Categories", icon: "categories" },
  { path: "/orders", label: "Orders", icon: "orders" },
  { path: "/customers", label: "Customers", icon: "customers" },
  { path: "/discounts", label: "Discounts", icon: "discounts" },
  { path: "/pages", label: "Page Builder", icon: "pages" },
  { path: "/themes", label: "Themes", icon: "themes" },
  { path: "/plugins", label: "Plugins", icon: "plugins" },
  { path: "/emails", label: "Emails", icon: "emails" },
  { path: "/payments", label: "Payments", icon: "payments" },
  { path: "/shipping", label: "Shipping", icon: "shipping" },
  { path: "/seo", label: "SEO", icon: "seo" },
  { path: "/media", label: "Media", icon: "media" },
  { path: "/settings", label: "Settings", icon: "settings" },
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
  const pluginNav = usePluginNav();
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
          <BrandMark />
          <span>CloudCart</span>
        </div>
        <nav class="sidebar-nav">
          {NAV.map((item) => {
            const active = item.path === "/" ? path === "/" : path.startsWith(item.path);
            return (
              <a key={item.path} class={`sidebar-link${active ? " sidebar-link--active" : ""}`} {...linkProps(item.path)}>
                <Icon name={item.icon} className="sidebar-icon" />
                <span class="sidebar-link-label">{item.label}</span>
              </a>
            );
          })}
          {pluginNav.length > 0 && (
            <>
              <div class="sidebar-section-label">Plugins</div>
              {pluginNav.map((item) => {
                const active = path === item.path;
                return (
                  <a
                    key={item.path}
                    class={`sidebar-link sidebar-link--plugin${active ? " sidebar-link--active" : ""}`}
                    {...linkProps(item.path)}
                    onClick={(event) => {
                      setOpen(false);
                      linkProps(item.path).onClick(event);
                    }}
                  >
                    <Icon name={pluginIconName(item.icon)} className="sidebar-icon" />
                    <span class="sidebar-link-label">{item.label}</span>
                  </a>
                );
              })}
            </>
          )}
        </nav>
        <div class="sidebar-footer">
          <a class="sidebar-link" href="/" target="_blank" rel="noopener">
            <Icon name="external" className="sidebar-icon" />
            <span class="sidebar-link-label">View store</span>
          </a>
        </div>
      </aside>
      {open && <button type="button" class="sidebar-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div class="shell-main">
        <header class="topbar">
          <button
            type="button"
            class="menu-button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <Icon name={open ? "close" : "menu"} size={20} />
          </button>
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

function pluginIconName(icon: string | undefined): IconName {
  switch (icon) {
    case "chart": return "chart";
    case "settings": return "settings";
    case "orders": return "orders";
    case "products": return "products";
    case "customers": return "customers";
    case "mail": return "mail";
    case "link": return "link";
    case "image": return "image";
    default: return "plugins";
  }
}
