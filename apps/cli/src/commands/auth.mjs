import { flagList, flagString, requirePositional } from "../args.mjs";
import { ApiClient } from "../client.mjs";
import { maskKey, normalizeUrl, removeProfile, saveProfile } from "../config.mjs";
import { CliError, requireConfirmation, usageError } from "../errors.mjs";
import { getEmail, getPassword, getSetupToken } from "../prompt.mjs";

function options(ctx) {
  return {
    timeout: Number(ctx.flags.timeout) || 30_000,
    dryRun: Boolean(ctx.flags["dry-run"]),
    verbose: Boolean(ctx.flags.verbose),
  };
}

function urlFor(ctx, value) {
  return normalizeUrl(value || ctx.flags.url || ctx.env.CLOUDCART_URL || ctx.url, {
    allowInsecure: Boolean(ctx.flags.insecure),
  });
}

async function sessionLogin(ctx, baseUrl) {
  const client = new ApiClient({ baseUrl, apiKey: null, ...options(ctx) });
  const email = await getEmail(ctx.flags, ctx.env);
  const password = await getPassword(ctx.flags, ctx.env);
  const data = await client.login(email, password);
  return { client, csrf: data.csrfToken, admin: data.admin };
}

export async function login(ctx) {
  const baseUrl = urlFor(ctx);
  const profileName = String(ctx.flags.profile || ctx.env.CLOUDCART_PROFILE || ctx.config.defaultProfile || "default");
  const explicitKey = ctx.flags.key || ctx.flags.token || ctx.env.CLOUDCART_API_KEY || ctx.env.CLOUDCART_TOKEN;

  if (explicitKey) {
    const client = new ApiClient({ baseUrl, apiKey: explicitKey, ...options(ctx) });
    const me = await client.requestJson("GET", "/api/admin/me");
    const file = saveProfile(profileName, {
      url: baseUrl,
      apiKey: explicitKey,
      keyId: me.keyId || null,
      adminEmail: me.admin?.email || null,
      scopes: me.scopes || [],
      createdAt: new Date().toISOString(),
    }, ctx.env);
    return {
      data: {
        url: baseUrl,
        profile: profileName,
        admin: me.admin,
        key: { prefix: maskKey(explicitKey), scopes: me.scopes || [] },
        configPath: file,
      },
      message: `Signed in to ${baseUrl} as ${me.admin?.email ?? "administrator"} (profile: ${profileName}).`,
    };
  }

  if (!ctx.flags.force && ctx.profile?.apiKey) {
    try {
      const existing = new ApiClient({ baseUrl, apiKey: ctx.profile.apiKey, ...options(ctx) });
      const me = await existing.requestJson("GET", "/api/admin/me");
      return {
        data: {
          url: baseUrl,
          profile: profileName,
          admin: me.admin,
          key: { prefix: maskKey(ctx.profile.apiKey), scopes: me.scopes || [] },
          configPath: ctx.configPath,
        },
        message: `Already signed in to ${baseUrl} (profile: ${profileName}). Use --force to create a new key.`,
      };
    } catch {
      // Fall through to a fresh login if the stored key is invalid or revoked.
    }
  }

  const { client, csrf, admin } = await sessionLogin(ctx, baseUrl);
  const scopes = flagList(ctx.flags, "scope");
  const created = await client.createApiKey(
    String(ctx.flags.name || "CLI"),
    scopes,
    csrf,
    flagString(ctx.flags, "expires-at"),
  );
  await client.logoutSession(csrf);
  const key = created.data?.data ?? created.data;
  const file = saveProfile(profileName, {
    url: baseUrl,
    apiKey: key.token,
    keyId: key.id,
    adminEmail: admin.email,
    scopes: key.scopes,
    createdAt: key.createdAt,
  }, ctx.env);

  const payload = {
    url: baseUrl,
    profile: profileName,
    admin,
    key: { id: key.id, prefix: key.prefix, scopes: key.scopes, expiresAt: key.expiresAt },
    configPath: file,
  };
  if (ctx.flags["show-key"]) payload.token = key.token;
  return {
    data: payload,
    message: [
      `Signed in to ${baseUrl} as ${admin.email}.`,
      `API key ${key.prefix} saved to ${file} (profile: ${profileName}).`,
      ctx.flags["show-key"] ? `Key: ${key.token}` : "The key is stored locally; use --show-key to print it once.",
    ].join("\n"),
  };
}

export async function setup(ctx) {
  const baseUrl = urlFor(ctx);
  const profileName = String(ctx.flags.profile || ctx.env.CLOUDCART_PROFILE || "default");
  const email = await getEmail(ctx.flags, ctx.env);
  const password = await getPassword(ctx.flags, ctx.env);
  const setupToken = await getSetupToken(ctx.flags);
  const client = new ApiClient({ baseUrl, apiKey: null, ...options(ctx) });
  const result = await client.request("POST", "/api/admin/setup", {
    anonymous: true,
    body: {
      setupToken,
      email,
      password,
      name: String(ctx.flags.name || "Store Owner"),
      storeName: String(ctx.flags["store-name"] || "My Store"),
      currency: String(ctx.flags.currency || "USD"),
    },
  });
  const data = result.data;
  client.absorbCookies(result.headers);
  const created = await client.createApiKey(
    "CLI",
    flagList(ctx.flags, "scope"),
    data.csrfToken,
    flagString(ctx.flags, "expires-at"),
  );
  await client.logoutSession(data.csrfToken);
  const key = created.data?.data ?? created.data;
  const file = saveProfile(profileName, {
    url: baseUrl,
    apiKey: key.token,
    keyId: key.id,
    adminEmail: data.admin?.email || email,
    scopes: key.scopes,
    createdAt: key.createdAt,
  }, ctx.env);
  return {
    data: {
      url: baseUrl,
      profile: profileName,
      admin: data.admin,
      key: { id: key.id, prefix: key.prefix, scopes: key.scopes },
      configPath: file,
    },
    message: `Store initialized at ${baseUrl}. CLI key ${key.prefix} saved to ${file}.`,
  };
}

export async function status(ctx) {
  const profiles = Object.entries(ctx.config.profiles).map(([name, profile]) => ({
    name,
    current: name === ctx.config.defaultProfile,
    url: profile.url,
    key: maskKey(profile.apiKey),
    adminEmail: profile.adminEmail || null,
    scopes: Array.isArray(profile.scopes) ? profile.scopes : [],
  }));
  const data = {
    configPath: ctx.configPath,
    defaultProfile: ctx.config.defaultProfile,
    profiles,
  };
  if (ctx.flags.probe) {
    const client = ctx.requireClient();
    const probe = await client.requestJson("GET", "/api/admin/capabilities");
    data.health = probe?.data ?? probe;
  }
  return {
    data,
    message: profiles.length === 0
      ? "No saved profiles. Run `cloudcart auth login --url ... --email ...`."
      : profiles.map((profile) => `${profile.current ? "*" : " "} ${profile.name}: ${profile.url} (${profile.key})`).join("\n"),
  };
}

export async function whoami(ctx) {
  const client = ctx.requireClient();
  const body = await client.requestJson("GET", "/api/admin/me");
  const data = body?.data ?? (body?.ok
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "ok"))
    : body);
  return {
    data,
    message: `${data.admin.email} · ${data.authMethod}${data.keyId ? ` · ${data.keyId}` : ""}`,
  };
}

export async function logout(ctx) {
  const profileName = ctx.profileName;
  if (!ctx.flags.forget && ctx.apiKey) {
    try {
      const client = ctx.requireClient();
      await client.request("DELETE", "/api/admin/api-keys/self");
    } catch (error) {
      if (error instanceof CliError && error.status === 401) {
        // Already revoked; still remove the local profile.
      } else {
        process.stderr.write(`warning: could not revoke the server key (${error.message}); removing local config anyway.\n`);
      }
    }
  }
  removeProfile(profileName, ctx.env);
  return {
    data: { profile: profileName, revoked: !ctx.flags.forget },
    message: `Removed profile "${profileName}"${ctx.flags.forget ? " (server key left active)" : ""}.`,
  };
}

export async function keysList(ctx) {
  const client = ctx.requireClient();
  const body = await client.requestJson("GET", "/api/admin/api-keys");
  const items = body?.data?.items ?? [];
  return {
    data: { items },
    message: items.length === 0 ? "No API keys." : undefined,
  };
}

export async function keysCreate(ctx) {
  const baseUrl = urlFor(ctx);
  const { client, csrf } = await sessionLogin(ctx, baseUrl);
  const created = await client.createApiKey(
    String(ctx.flags.name || "CLI"),
    flagList(ctx.flags, "scope"),
    csrf,
    flagString(ctx.flags, "expires-at"),
  );
  await client.logoutSession(csrf);
  const key = created.data?.data ?? created.data;
  return {
    data: key,
    message: [
      `Created API key ${key.prefix}.`,
      `Key: ${key.token}`,
      "This is the only time the key is shown. Store it in a secret manager, then run `cloudcart auth login --key ...`.",
    ].join("\n"),
  };
}

export async function keysRevoke(ctx) {
  requireConfirmation(ctx.flags, "Revoking an API key");
  const keyId = requirePositional(ctx.args, 0, "API key id");
  const baseUrl = urlFor(ctx);
  const { client, csrf } = await sessionLogin(ctx, baseUrl);
  await client.sessionRequest("DELETE", `/api/admin/api-keys/${encodeURIComponent(keyId)}`, { csrf });
  await client.logoutSession(csrf);
  return { data: { id: keyId, revoked: true }, message: `Revoked API key ${keyId}.` };
}

export function requireUrl(ctx) {
  if (!ctx.url && !ctx.flags.url && !ctx.env.CLOUDCART_URL) {
    throw usageError("A store URL is required. Use --url or CLOUDCART_URL.");
  }
}
