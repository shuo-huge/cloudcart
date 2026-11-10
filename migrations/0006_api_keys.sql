-- Long-lived API keys for the CLI and agent integrations.
-- Only a SHA-256 hash of the token is stored; the plaintext token is returned
-- once at creation time and never persisted.

CREATE TABLE IF NOT EXISTS admin_api_keys (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_api_keys_admin ON admin_api_keys(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_api_keys_expires ON admin_api_keys(expires_at);
