CREATE TABLE IF NOT EXISTS order_returns (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded')),
  reason TEXT,
  note TEXT,
  restock INTEGER NOT NULL DEFAULT 0 CHECK (restock IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_returns_order ON order_returns(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_id TEXT,
  variant_id TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_return_items_return ON order_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_order_return_items_order_item ON order_return_items(order_item_id);
