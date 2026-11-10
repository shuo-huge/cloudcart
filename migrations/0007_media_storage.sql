-- Media storage providers: R2, jsDelivr (via GitHub), and explicit external URLs.
-- The GitHub token is encrypted with APP_MASTER_KEY by the application; this
-- migration only creates the storage columns/table.

ALTER TABLE media ADD COLUMN storage TEXT;

UPDATE media
SET storage = CASE
  WHEN content_type = 'image/external' THEN 'external'
  ELSE 'r2'
END
WHERE storage IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_storage_created ON media(storage, created_at DESC);

CREATE TABLE IF NOT EXISTS media_storage_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_provider TEXT NOT NULL DEFAULT 'r2',
  jsdelivr_owner TEXT,
  jsdelivr_repo TEXT,
  jsdelivr_branch TEXT NOT NULL DEFAULT 'main',
  jsdelivr_path TEXT NOT NULL DEFAULT 'products',
  jsdelivr_token_encrypted TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO media_storage_config (
  id, default_provider, jsdelivr_branch, jsdelivr_path, created_at, updated_at
) VALUES (
  1, 'r2', 'main', 'products',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
