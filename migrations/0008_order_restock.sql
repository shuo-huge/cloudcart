-- Track cancellation restocks so every cancel path is idempotent and
-- concurrent cancels cannot restore stock twice.
ALTER TABLE orders ADD COLUMN restocked_at TEXT;
ALTER TABLE orders ADD COLUMN restock_token TEXT;
