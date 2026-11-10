import type {
  Database,
  MediaRow,
  MediaStorageConfigRow,
  MediaStorageProvider,
} from "@cloudcart/database";
import { decryptSecret, encryptSecret, sha256Hex } from "@cloudcart/security";
import { HttpError, nowIso } from "@cloudcart/shared";
import { insertMediaRow, type ValidatedImage } from "./media";

export const GITHUB_API_BASE = "https://api.github.com";
export const DEFAULT_JSDELIVR_BRANCH = "main";
export const DEFAULT_JSDELIVR_PATH = "products";

export interface JsDelivrSettings {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string | null;
  tokenConfigured: boolean;
  tokenReadable: boolean;
}

export interface MediaStorageConfig {
  defaultProvider: MediaStorageProvider;
  jsdelivr: JsDelivrSettings;
  updatedAt: string | null;
}

export interface MediaStorageStatus {
  defaultProvider: MediaStorageProvider;
  effectiveDefault: MediaStorageProvider;
  providers: {
    r2: { available: boolean; configured: boolean; reason?: string };
    jsdelivr: {
      available: boolean;
      configured: boolean;
      tokenConfigured: boolean;
      tokenReadable: boolean;
      owner: string;
      repo: string;
      branch: string;
      path: string;
      reason?: string;
    };
    external: { available: true; configured: true; advanced: true };
  };
  updatedAt: string | null;
}

export interface MediaStorageInput {
  defaultProvider?: string;
  jsdelivr?: {
    owner?: string;
    repo?: string;
    branch?: string;
    path?: string;
    token?: string | null;
    clearToken?: boolean;
  };
}

export interface MediaStorageRequestOptions {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function defaults(): MediaStorageConfig {
  return {
    defaultProvider: "r2",
    jsdelivr: {
      owner: "",
      repo: "",
      branch: DEFAULT_JSDELIVR_BRANCH,
      path: DEFAULT_JSDELIVR_PATH,
      token: null,
      tokenConfigured: false,
      tokenReadable: true,
    },
    updatedAt: null,
  };
}

function asProvider(value: unknown): MediaStorageProvider {
  return value === "jsdelivr" ? "jsdelivr" : "r2";
}

export async function loadMediaStorageConfig(
  db: Database,
  masterKey?: string,
): Promise<MediaStorageConfig> {
  const row = await db.first<MediaStorageConfigRow>(
    "SELECT * FROM media_storage_config WHERE id = 1",
  );
  if (!row) return defaults();
  const result = defaults();
  result.defaultProvider = asProvider(row.default_provider);
  result.jsdelivr.owner = row.jsdelivr_owner || "";
  result.jsdelivr.repo = row.jsdelivr_repo || "";
  result.jsdelivr.branch = row.jsdelivr_branch || DEFAULT_JSDELIVR_BRANCH;
  result.jsdelivr.path = row.jsdelivr_path || DEFAULT_JSDELIVR_PATH;
  result.jsdelivr.tokenConfigured = Boolean(row.jsdelivr_token_encrypted);
  result.jsdelivr.tokenReadable = !row.jsdelivr_token_encrypted;
  result.updatedAt = row.updated_at || null;
  if (row.jsdelivr_token_encrypted && masterKey) {
    try {
      result.jsdelivr.token = await decryptSecret(row.jsdelivr_token_encrypted, masterKey);
      result.jsdelivr.tokenReadable = true;
    } catch {
      result.jsdelivr.token = null;
      result.jsdelivr.tokenReadable = false;
    }
  }
  return result;
}

export async function getMediaStorageStatus(
  db: Database,
  r2Available: boolean,
  masterKey?: string,
): Promise<MediaStorageStatus> {
  const config = await loadMediaStorageConfig(db, masterKey);
  const jsdelivrConfigured = Boolean(
    config.jsdelivr.owner && config.jsdelivr.repo && config.jsdelivr.tokenConfigured,
  );
  const jsdelivrAvailable = jsdelivrConfigured && config.jsdelivr.tokenReadable;
  const defaultAvailable = config.defaultProvider === "r2" ? r2Available : jsdelivrAvailable;
  const effectiveDefault = defaultAvailable
    ? config.defaultProvider
    : jsdelivrAvailable
      ? "jsdelivr"
      : r2Available
        ? "r2"
        : config.defaultProvider;
  return {
    defaultProvider: config.defaultProvider,
    effectiveDefault,
    providers: {
      r2: {
        available: r2Available,
        configured: r2Available,
        ...(r2Available ? {} : { reason: "R2 binding is not configured in this deployment." }),
      },
      jsdelivr: {
        available: jsdelivrAvailable,
        configured: jsdelivrConfigured,
        tokenConfigured: config.jsdelivr.tokenConfigured,
        tokenReadable: config.jsdelivr.tokenReadable,
        owner: config.jsdelivr.owner,
        repo: config.jsdelivr.repo,
        branch: config.jsdelivr.branch,
        path: config.jsdelivr.path,
        ...(jsdelivrAvailable
          ? {}
          : {
            reason: config.jsdelivr.tokenConfigured && !config.jsdelivr.tokenReadable
              ? "The stored GitHub token cannot be decrypted. Re-enter it."
              : "Configure a public GitHub repository and token.",
          }),
      },
      external: { available: true, configured: true, advanced: true },
    },
    updatedAt: config.updatedAt,
  };
}

function validateName(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(trimmed)) {
    throw new HttpError(400, "invalid_jsdelivr_config", `${label} contains invalid characters.`);
  }
  return trimmed;
}

function validateBranch(value: string): string {
  const branch = value.trim() || DEFAULT_JSDELIVR_BRANCH;
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branch) || branch.includes("..") || branch.startsWith("/") || branch.endsWith("/")) {
    throw new HttpError(400, "invalid_jsdelivr_config", "The branch name is invalid.");
  }
  return branch;
}

function validatePath(value: string): string {
  const cleaned = value.trim().replace(/^\/+|\/+$/g, "");
  if (!cleaned) return DEFAULT_JSDELIVR_PATH;
  if (cleaned.length > 300 || cleaned.includes("\\") || cleaned.split("/").some((part) => !part || part === "." || part === ".." || !/^[A-Za-z0-9._-]+$/.test(part))) {
    throw new HttpError(400, "invalid_jsdelivr_config", "The folder path is invalid.");
  }
  return cleaned;
}

export async function saveMediaStorageConfig(
  db: Database,
  masterKey: string,
  input: MediaStorageInput,
): Promise<MediaStorageStatus> {
  const existing = await db.first<MediaStorageConfigRow>(
    "SELECT * FROM media_storage_config WHERE id = 1",
  );
  const defaultProvider = input.defaultProvider === undefined
    ? asProvider(existing?.default_provider)
    : asProvider(input.defaultProvider);
  if (input.defaultProvider !== undefined && !["r2", "jsdelivr"].includes(String(input.defaultProvider))) {
    throw new HttpError(400, "invalid_storage_provider", "defaultProvider must be r2 or jsdelivr.");
  }
  const jsdelivr = input.jsdelivr || {};
  const owner = validateName(jsdelivr.owner ?? existing?.jsdelivr_owner ?? "", "Repository owner");
  const repo = validateName(jsdelivr.repo ?? existing?.jsdelivr_repo ?? "", "Repository name");
  const branch = validateBranch(jsdelivr.branch ?? existing?.jsdelivr_branch ?? DEFAULT_JSDELIVR_BRANCH);
  const path = validatePath(jsdelivr.path ?? existing?.jsdelivr_path ?? DEFAULT_JSDELIVR_PATH);
  let encrypted = existing?.jsdelivr_token_encrypted ?? null;
  if (jsdelivr.clearToken) {
    encrypted = null;
  } else if (typeof jsdelivr.token === "string" && jsdelivr.token.trim() && !jsdelivr.token.startsWith("••")) {
    if (!masterKey || masterKey.length < 16) {
      throw new HttpError(500, "not_configured", "APP_MASTER_KEY is not configured.");
    }
    encrypted = await encryptSecret(jsdelivr.token.trim(), masterKey);
  }
  const now = nowIso();
  if (existing) {
    await db.run(
      `UPDATE media_storage_config
       SET default_provider = ?, jsdelivr_owner = ?, jsdelivr_repo = ?, jsdelivr_branch = ?,
           jsdelivr_path = ?, jsdelivr_token_encrypted = ?, updated_at = ?
       WHERE id = 1`,
      [defaultProvider, owner || null, repo || null, branch, path, encrypted, now],
    );
  } else {
    await db.run(
      `INSERT INTO media_storage_config
       (id, default_provider, jsdelivr_owner, jsdelivr_repo, jsdelivr_branch, jsdelivr_path,
        jsdelivr_token_encrypted, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [defaultProvider, owner || null, repo || null, branch, path, encrypted, now, now],
    );
  }
  return getMediaStorageStatus(db, false, masterKey);
}

export function resolveMediaProvider(requested: string | null | undefined, status: MediaStorageStatus): MediaStorageProvider {
  const value = requested ? String(requested) : "";
  if (value && value !== "r2" && value !== "jsdelivr") {
    throw new HttpError(400, "invalid_storage", "storage must be r2 or jsdelivr.");
  }
  if (value) {
    const provider = value as MediaStorageProvider;
    if (!status.providers[provider].available) {
      throw new HttpError(409, "storage_unavailable", `${provider} is not available.`, { provider });
    }
    return provider;
  }
  if (status.providers[status.effectiveDefault].available) return status.effectiveDefault;
  if (status.providers.jsdelivr.available) return "jsdelivr";
  if (status.providers.r2.available) return "r2";
  throw new HttpError(503, "storage_not_configured", "Configure R2 or jsDelivr in Settings before uploading images.");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

function encodePath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "CloudCart",
  };
}

async function githubRequest(
  url: string,
  init: RequestInit,
  options: MediaStorageRequestOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch (error) {
    throw new HttpError(
      502,
      "jsdelivr_unreachable",
      `Could not reach GitHub: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface JsDelivrUploadResult {
  url: string;
  path: string;
  commitSha: string;
}

export async function uploadToJsDelivr(
  config: MediaStorageConfig,
  image: ValidatedImage,
  options: MediaStorageRequestOptions = {},
): Promise<JsDelivrUploadResult> {
  const { owner, repo, branch, path, token } = config.jsdelivr;
  if (!owner || !repo || !token) {
    throw new HttpError(409, "jsdelivr_not_configured", "Configure the jsDelivr GitHub repository and token first.");
  }
  const apiBase = (options.apiBase || GITHUB_API_BASE).replace(/\/+$/, "");
  const hash = (await sha256Hex(image.bytes)).slice(0, 10);
  const filename = `${slug(image.filename)}-${hash}.${image.extension}`;
  const objectPath = `${path}/${filename}`;
  const contentsUrl = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(objectPath)}`;
  const body = {
    message: `Add ${filename} from CloudCart`,
    content: bytesToBase64(image.bytes),
    branch,
  };
  let response = await githubRequest(contentsUrl, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify(body),
  }, options);

  if (response.status === 422) {
    const existing = await githubRequest(`${contentsUrl}?ref=${encodeURIComponent(branch)}`, {
      method: "GET",
      headers: githubHeaders(token),
    }, options);
    if (existing.ok) {
      const current = await existing.json() as { sha?: string };
      if (current.sha) {
        response = await githubRequest(contentsUrl, {
          method: "PUT",
          headers: githubHeaders(token),
          body: JSON.stringify({ ...body, sha: current.sha }),
        }, options);
      }
    }
  }

  if (!response.ok) {
    const code = response.status;
    if (code === 401 || code === 403) {
      throw new HttpError(502, "jsdelivr_auth_failed", "GitHub rejected the token or it lacks Contents write permission.");
    }
    if (code === 404) {
      throw new HttpError(400, "jsdelivr_repo_not_found", "GitHub repository or branch was not found.");
    }
    if (code === 429) {
      throw new HttpError(502, "jsdelivr_rate_limited", "GitHub rate limit reached. Try again later.");
    }
    throw new HttpError(502, "jsdelivr_upload_failed", `GitHub upload failed (HTTP ${code}).`);
  }

  const result = await response.json() as {
    commit?: { sha?: string };
    content?: { path?: string };
  };
  const commitSha = result.commit?.sha;
  if (!commitSha) throw new HttpError(502, "jsdelivr_upload_failed", "GitHub did not return a commit SHA.");
  const finalPath = result.content?.path || objectPath;
  return {
    url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${commitSha}/${finalPath.split("/").map(encodeURIComponent).join("/")}`,
    path: finalPath,
    commitSha,
  };
}

export interface MediaStorageTestResult {
  ok: boolean;
  message: string;
  checks: {
    tokenValid: boolean;
    repoAccessible: boolean;
    branchExists: boolean;
    writePermission?: boolean;
  };
}

export async function testJsDelivrConnection(
  config: MediaStorageConfig,
  options: MediaStorageRequestOptions = {},
): Promise<MediaStorageTestResult> {
  const { owner, repo, branch, token } = config.jsdelivr;
  if (!owner || !repo || !token) {
    return {
      ok: false,
      message: "Set the GitHub owner, repository and token first.",
      checks: { tokenValid: false, repoAccessible: false, branchExists: false },
    };
  }
  const apiBase = (options.apiBase || GITHUB_API_BASE).replace(/\/+$/, "");
  const repoUrl = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const repoResponse = await githubRequest(repoUrl, { method: "GET", headers: githubHeaders(token) }, options);
  if (repoResponse.status === 401 || repoResponse.status === 403) {
    return {
      ok: false,
      message: "GitHub rejected the token.",
      checks: { tokenValid: false, repoAccessible: false, branchExists: false },
    };
  }
  if (!repoResponse.ok) {
    return {
      ok: false,
      message: `Repository access failed (HTTP ${repoResponse.status}).`,
      checks: { tokenValid: true, repoAccessible: false, branchExists: false },
    };
  }
  const repoInfo = await repoResponse.json() as { private?: boolean; permissions?: { push?: boolean; maintain?: boolean; admin?: boolean } };
  if (repoInfo.private) {
    return {
      ok: false,
      message: "jsDelivr only serves public repositories. Make this repository public or choose another repository.",
      checks: { tokenValid: true, repoAccessible: false, branchExists: false, writePermission: Boolean(repoInfo.permissions?.push) },
    };
  }
  const branchResponse = await githubRequest(
    `${repoUrl}/branches/${encodeURIComponent(branch)}`,
    { method: "GET", headers: githubHeaders(token) },
    options,
  );
  const writePermission = repoInfo.permissions?.push ?? repoInfo.permissions?.maintain ?? repoInfo.permissions?.admin;
  if (!branchResponse.ok) {
    return {
      ok: false,
      message: `Branch "${branch}" was not found.`,
      checks: { tokenValid: true, repoAccessible: true, branchExists: false, writePermission },
    };
  }
  return {
    ok: true,
    message: `Connected to ${owner}/${repo} on ${branch}. jsDelivr will serve uploaded files from this public repository.`,
    checks: { tokenValid: true, repoAccessible: true, branchExists: true, writePermission },
  };
}

export async function testR2Storage(bucket: R2Bucket | undefined): Promise<MediaStorageTestResult> {
  if (!bucket) {
    return {
      ok: false,
      message: "R2 is not configured in this deployment.",
      checks: { tokenValid: false, repoAccessible: false, branchExists: false },
    };
  }
  try {
    await bucket.head("__cloudcart_probe__");
    return {
      ok: true,
      message: "R2 binding is available.",
      checks: { tokenValid: true, repoAccessible: true, branchExists: true },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "R2 probe failed.",
      checks: { tokenValid: false, repoAccessible: false, branchExists: false },
    };
  }
}

export async function storeJsDelivrMedia(
  db: Database,
  config: MediaStorageConfig,
  image: ValidatedImage,
  uploadedBy: string | null,
  alt = "",
  options: MediaStorageRequestOptions = {},
): Promise<MediaRow> {
  const uploaded = await uploadToJsDelivr(config, image, options);
  return insertMediaRow(db, {
    key: uploaded.url,
    filename: image.filename,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    storage: "jsdelivr",
    uploadedBy,
    alt,
  });
}
