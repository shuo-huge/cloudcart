-- Hybrid plugins: bundled (default) and remote (external HTTPS service).

ALTER TABLE plugins ADD COLUMN runtime TEXT NOT NULL DEFAULT 'bundled';
ALTER TABLE plugins ADD COLUMN manifest_url TEXT;
ALTER TABLE plugins ADD COLUMN manifest_json TEXT;
ALTER TABLE plugins ADD COLUMN service_base_url TEXT;
ALTER TABLE plugins ADD COLUMN admin_entry_url TEXT;
ALTER TABLE plugins ADD COLUMN admin_origin TEXT;
ALTER TABLE plugins ADD COLUMN manifest_hash TEXT;
ALTER TABLE plugins ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE plugins ADD COLUMN last_health_check_at TEXT;
ALTER TABLE plugins ADD COLUMN uninstalled_at TEXT;

CREATE TABLE IF NOT EXISTS store_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
