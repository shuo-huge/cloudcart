-- Tax rates and email notification outbox.

CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL COLLATE NOCASE CHECK (length(country) = 2),
  region TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  rate_bps INTEGER NOT NULL CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_rates_scope
  ON tax_rates(country, region);
CREATE INDEX IF NOT EXISTS idx_tax_rates_active
  ON tax_rates(country, active);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('customer', 'store')),
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT NOT NULL,
  locked_at TEXT,
  provider TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_due
  ON email_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_order
  ON email_outbox(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created
  ON email_outbox(created_at DESC);
