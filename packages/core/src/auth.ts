import type { Database } from "@cloudcart/database";
import type { AdminRow, AdminSessionRow } from "@cloudcart/database";
import {
  constantTimeEqual,
  createSessionToken,
  hashPassword,
  newCsrfToken,
  parseSessionToken,
  validatePasswordStrength,
  verifyPassword,
} from "@cloudcart/security";
import { isoPlusSeconds, newId, nowIso } from "@cloudcart/shared";
import { writeAuditLog } from "./audit";
import { ensureDefaultContentPages } from "./pages";
import { SETTING_KEYS, setSettings } from "./settings";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 15;
const RATE_WINDOW_MINUTES = 15;

export interface SetupInput {
  setupToken: string;
  email: string;
  password: string;
  name: string;
  storeName?: string;
  currency?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
}

export interface AuthenticatedAdmin {
  admin: AdminRow;
  session: AdminSessionRow;
}

export async function isInstalled(db: Database): Promise<boolean> {
  return db.exists("SELECT 1 FROM installation_state WHERE id = 1");
}

export async function getInstallation(db: Database) {
  return db.first<{ installed_at: string; installer_email: string }>(
    "SELECT installed_at, installer_email FROM installation_state WHERE id = 1",
  );
}

export interface SetupError {
  code: "already_installed" | "invalid_token" | "token_not_configured" | "invalid_input" | "weak_password" | "email_taken";
  message: string;
}

export async function setupStore(
  db: Database,
  masterKey: string | undefined,
  expectedSetupToken: string | undefined,
  input: SetupInput,
  ip: string | null,
): Promise<{ ok: true; adminId: string } | { ok: false; error: SetupError }> {
  if (!masterKey || masterKey.length < 16) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "APP_MASTER_KEY is not configured on this Worker." },
    };
  }
  if (/^replace-with-/i.test(masterKey) || masterKey === "REPLACE_WITH_A_LONG_RANDOM_VALUE") {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "APP_MASTER_KEY is still the example value. Generate a long random secret before setup.",
      },
    };
  }
  if (await isInstalled(db)) {
    return { ok: false, error: { code: "already_installed", message: "This store has already been set up." } };
  }
  if (!expectedSetupToken) {
    return {
      ok: false,
      error: { code: "token_not_configured", message: "SETUP_TOKEN is not configured. Add it as a Worker secret and redeploy." },
    };
  }
  if (/^replace-with-/i.test(expectedSetupToken) || expectedSetupToken === "REPLACE_WITH_A_RANDOM_SETUP_TOKEN") {
    return {
      ok: false,
      error: {
        code: "token_not_configured",
        message: "SETUP_TOKEN is still the example value. Set a real one-time token before setup.",
      },
    };
  }
  if (!constantTimeEqual(input.setupToken, expectedSetupToken)) {
    return { ok: false, error: { code: "invalid_token", message: "The setup token is invalid." } };
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: { code: "invalid_input", message: "Enter a valid email address." } };
  }
  const strength = validatePasswordStrength(input.password);
  if (strength) {
    return { ok: false, error: { code: "weak_password", message: strength } };
  }
  if (await db.exists("SELECT 1 FROM admins LIMIT 1")) {
    return { ok: false, error: { code: "already_installed", message: "An administrator already exists." } };
  }

  const now = nowIso();
  const adminId = newId("adm");
  const passwordHash = await hashPassword(input.password);
  const currency = (input.currency || "USD").toUpperCase();

  // Atomic setup: admin, installation marker and store settings.
  await db.batch([
    db.prepare(
      `INSERT INTO admins (id, email, name, password_hash, role, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, 'owner', ?, ?, NULL)`,
      [adminId, email, input.name.trim() || "Store Owner", passwordHash, now, now],
    ),
    db.prepare(
      "INSERT INTO installation_state (id, installed_at, installer_email) VALUES (1, ?, ?)",
      [now, email],
    ),
    ...Object.entries({
      [SETTING_KEYS.storeName]: input.storeName?.trim() || "CloudCart",
      [SETTING_KEYS.storeCurrency]: currency,
      [SETTING_KEYS.storeLocale]: "en-US",
      [SETTING_KEYS.seoTitle]: input.storeName?.trim() || "CloudCart",
      [SETTING_KEYS.seoDescription]: "A CloudCart store.",
      [SETTING_KEYS.taxIncluded]: "0",
      [SETTING_KEYS.taxDefaultRateBps]: "0",
      [SETTING_KEYS.taxDefaultName]: "Tax",
    }).map(([key, value]) => db.prepare(
      `INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now],
    )),
  ]);

  await writeAuditLog(db, {
    adminId,
    action: "store.installed",
    entityType: "installation_state",
    entityId: "1",
    ip,
  });
  await seedStoreDefaults(db);

  return { ok: true, adminId };
}

export type LoginResult =
  | {
    ok: true;
    admin: AdminRow;
    sessionToken: string;
    csrfToken: string;
    expiresAt: string;
  }
  | { ok: false; code: "invalid_credentials" | "rate_limited"; message: string };

export async function loginAdmin(
  db: Database,
  masterKey: string,
  input: LoginInput,
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const windowStart = isoPlusSeconds(-RATE_WINDOW_MINUTES * 60);

  const [emailFailures, ipFailures] = await db.batch([
    db.prepare(
      "SELECT COUNT(*) AS count FROM login_attempts WHERE email = ? AND success = 0 AND created_at > ?",
      [email, windowStart],
    ),
    db.prepare(
      "SELECT COUNT(*) AS count FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > ?",
      [input.ip ?? "", windowStart],
    ),
  ]);
  const emailCount = Number((emailFailures?.results?.[0] as { count?: number } | undefined)?.count ?? 0);
  const ipCount = Number((ipFailures?.results?.[0] as { count?: number } | undefined)?.count ?? 0);
  if (emailCount >= MAX_FAILURES_PER_EMAIL || ipCount >= MAX_FAILURES_PER_IP) {
    return {
      ok: false,
      code: "rate_limited",
      message: "Too many failed sign-in attempts. Try again in 15 minutes.",
    };
  }

  const admin = await db.first<AdminRow>(
    "SELECT * FROM admins WHERE email = ? COLLATE NOCASE",
    [email],
  );

  let valid = false;
  if (admin) {
    valid = await verifyPassword(input.password, admin.password_hash);
  }

  if (!admin || !valid) {
    await db.run(
      "INSERT INTO login_attempts (id, email, ip, success, created_at) VALUES (?, ?, ?, 0, ?)",
      [newId("la"), email, input.ip ?? "", nowIso()],
    );
    // Small delay slows automated guessing without consuming CPU time.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      ok: false,
      code: "invalid_credentials",
      message: "The email or password is incorrect.",
    };
  }

  const sessionId = newId("ses");
  const { token, tokenHash } = await createSessionToken(masterKey, sessionId);
  const csrfToken = newCsrfToken();
  const now = nowIso();
  const expiresAt = isoPlusSeconds(SESSION_TTL_SECONDS);

  await db.batch([
    db.prepare(
      `INSERT INTO admin_sessions (id, admin_id, token_hash, csrf_token, ip, user_agent, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [sessionId, admin.id, tokenHash, csrfToken, input.ip ?? "", input.userAgent ?? "", now, expiresAt],
    ),
    db.prepare("UPDATE admins SET last_login_at = ?, updated_at = ? WHERE id = ?", [now, now, admin.id]),
    db.prepare(
      "INSERT INTO login_attempts (id, email, ip, success, created_at) VALUES (?, ?, ?, 1, ?)",
      [newId("la"), email, input.ip ?? "", now],
    ),
  ]);

  await writeAuditLog(db, {
    adminId: admin.id,
    action: "admin.login",
    entityType: "admin",
    entityId: admin.id,
    ip: input.ip,
  });

  return { ok: true, admin, sessionToken: token, csrfToken, expiresAt };
}

export async function authenticateSession(
  db: Database,
  masterKey: string,
  token: string | null | undefined,
): Promise<AuthenticatedAdmin | null> {
  if (!token) return null;
  const parsed = await parseSessionToken(masterKey, token);
  if (!parsed) return null;
  const row = await db.first<AdminSessionRow & { admin_email: string; admin_name: string; admin_role: string; password_hash: string; last_login_at: string | null; admin_created_at: string; admin_updated_at: string }>(
    `SELECT s.*, a.email AS admin_email, a.name AS admin_name, a.role AS admin_role,
            a.password_hash, a.last_login_at, a.created_at AS admin_created_at, a.updated_at AS admin_updated_at
     FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.id = ? AND s.token_hash = ? LIMIT 1`,
    [parsed.sessionId, parsed.tokenHash],
  );
  if (!row) return null;
  if (row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;

  const admin: AdminRow = {
    id: row.admin_id,
    email: row.admin_email,
    name: row.admin_name,
    role: row.admin_role as AdminRow["role"],
    password_hash: row.password_hash,
    created_at: row.admin_created_at,
    updated_at: row.admin_updated_at,
    last_login_at: row.last_login_at,
  };
  const session: AdminSessionRow = {
    id: row.id,
    admin_id: row.admin_id,
    token_hash: row.token_hash,
    csrf_token: row.csrf_token,
    ip: row.ip,
    user_agent: row.user_agent,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
  };
  return { admin, session };
}

export async function logoutAdmin(
  db: Database,
  sessionId: string,
  adminId: string,
  ip: string | null,
): Promise<void> {
  await db.run("UPDATE admin_sessions SET revoked_at = ? WHERE id = ?", [nowIso(), sessionId]);
  await writeAuditLog(db, {
    adminId,
    action: "admin.logout",
    entityType: "admin_session",
    entityId: sessionId,
    ip,
  });
}

export async function changeAdminPassword(
  db: Database,
  adminId: string,
  currentPassword: string,
  newPassword: string,
  ip: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = await db.first<AdminRow>("SELECT * FROM admins WHERE id = ?", [adminId]);
  if (!admin) return { ok: false, message: "Administrator not found." };
  if (!(await verifyPassword(currentPassword, admin.password_hash))) {
    return { ok: false, message: "The current password is incorrect." };
  }
  const strength = validatePasswordStrength(newPassword);
  if (strength) return { ok: false, message: strength };
  const hash = await hashPassword(newPassword);
  // Invalidate every other session after a password change.
  await db.batch([
    db.prepare("UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?", [hash, nowIso(), adminId]),
    db.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL", [nowIso(), adminId]),
  ]);
  await writeAuditLog(db, {
    adminId,
    action: "admin.password_changed",
    entityType: "admin",
    entityId: adminId,
    ip,
  });
  return { ok: true };
}

/** Seeds sensible defaults used by the storefront and admin. */
export async function seedStoreDefaults(db: Database): Promise<void> {
  const now = nowIso();
  await setSettings(db, {
    [SETTING_KEYS.storeLocale]: "en-US",
  });
  // Tax defaults are inserted only when absent so existing stores keep their
  // configured rates.
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO store_settings (key, value, updated_at) VALUES (?, '0', ?)", [SETTING_KEYS.taxIncluded, now]),
    db.prepare("INSERT OR IGNORE INTO store_settings (key, value, updated_at) VALUES (?, '0', ?)", [SETTING_KEYS.taxDefaultRateBps, now]),
    db.prepare("INSERT OR IGNORE INTO store_settings (key, value, updated_at) VALUES (?, 'Tax', ?)", [SETTING_KEYS.taxDefaultName, now]),
  ]);
  const existingZone = await db.first<{ id: string }>("SELECT id FROM shipping_zones WHERE is_default = 1 LIMIT 1");
  if (!existingZone) {
    const zoneId = newId("zone");
    await db.batch([
      db.prepare(
        "INSERT INTO shipping_zones (id, name, countries_json, is_default, created_at, updated_at) VALUES (?, ?, '[]', 1, ?, ?)",
        [zoneId, "Rest of World", now, now],
      ),
      db.prepare(
        `INSERT INTO shipping_rates (id, zone_id, name, price_cents, min_order_cents, max_order_cents, free_over_cents, is_active, position, created_at, updated_at)
         VALUES (?, ?, 'Standard shipping', 0, 0, NULL, NULL, 1, 0, ?, ?)`,
        [newId("rate"), zoneId, now, now],
      ),
    ]);
  }
  const manualPlugin = await db.first<{ id: string }>("SELECT id FROM plugins WHERE id = 'manual' LIMIT 1");
  if (!manualPlugin) {
    await db.run(
      `INSERT INTO plugins (id, name, version, type, description, icon, author, enabled, built_in, last_error, installed_at, updated_at)
       VALUES ('manual', 'Manual Payment', '1.0.0', 'payment',
         'Bank transfer, cash on delivery or custom offline payment instructions.', NULL, 'CloudCart',
         1, 1, NULL, ?, ?)`,
      [now, now],
    );
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('manual', 'method', 'bank_transfer', 0, ?)", [now]),
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('manual', 'instructions', 'Complete your bank transfer using the details below. Your order will be processed once payment is confirmed.', 0, ?)", [now]),
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('manual', 'accountName', '', 0, ?)", [now]),
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('manual', 'bankName', '', 0, ?)", [now]),
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('manual', 'accountNumber', '', 0, ?)", [now]),
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('manual', 'swift', '', 0, ?)", [now]),
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('manual', 'codInstructions', 'Pay in cash when your order is delivered.', 0, ?)", [now]),
    ]);
  }

  // The admin language pack is bundled and enabled by default, with English
  // as the default language so nothing changes until the administrator picks
  // another locale.
  const i18nPlugin = await db.first<{ id: string }>("SELECT id FROM plugins WHERE id = 'admin-i18n' LIMIT 1");
  if (!i18nPlugin) {
    await db.run(
      `INSERT INTO plugins (id, name, version, type, description, icon, author, enabled, built_in, last_error, installed_at, updated_at)
       VALUES ('admin-i18n', 'Admin Language Pack', '1.0.0', 'admin',
         'Translate the CloudCart admin interface into English or Simplified Chinese.', NULL, 'CloudCart',
         1, 1, NULL, ?, ?)`,
      [now, now],
    );
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('admin-i18n', 'defaultLocale', 'en', 0, ?)", [now]),
      db.prepare("INSERT OR IGNORE INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES ('admin-i18n', 'showSwitcher', '1', 0, ?)", [now]),
    ]);
  }

  const defaultTheme = await db.first<{ id: string }>("SELECT id FROM themes WHERE id = 'default' LIMIT 1");
  if (!defaultTheme) {
    const existingTheme = await db.first<{ id: string }>("SELECT id FROM themes WHERE active = 1 LIMIT 1");
    await db.run(
      `INSERT OR IGNORE INTO themes (id, name, version, description, preview_image, built_in, active, installed_at, updated_at)
       VALUES ('default', 'Default', '1.0.0', 'A clean, modern storefront theme.', NULL, 1, ?, ?, ?)`,
      [existingTheme ? 0 : 1, now, now],
    );
  }

  const homePage = await db.first<{ id: string }>("SELECT id FROM pages WHERE slug = 'home' LIMIT 1");
  if (!homePage) {
    const pageId = newId("page");
    const doc = JSON.stringify({
      version: 1,
      page: "home",
      sections: [
        {
          id: "hero-001",
          type: "hero",
          enabled: true,
          settings: {
            title: "Welcome to our store",
            subtitle: "Thoughtfully selected products, shipped to your door.",
            buttonText: "Shop now",
            buttonUrl: "/products",
          },
        },
        {
          id: "products-001",
          type: "product-grid",
          enabled: true,
          settings: { title: "Featured products", limit: 8, source: "featured" },
        },
      ],
    });
    const versionId = newId("pv");
    await db.batch([
      db.prepare(
        "INSERT INTO pages (id, slug, title, type, draft_json, published_version, created_at, updated_at) VALUES (?, 'home', 'Home', 'home', ?, 1, ?, ?)",
        [pageId, doc, now, now],
      ),
      db.prepare(
        `INSERT INTO page_versions (id, page_id, version, data_json, published_by, published_at, created_at)
         VALUES (?, ?, 1, ?, NULL, ?, ?)`,
        [versionId, pageId, doc, now, now],
      ),
    ]);
  }
  await ensureDefaultContentPages(db);
}
