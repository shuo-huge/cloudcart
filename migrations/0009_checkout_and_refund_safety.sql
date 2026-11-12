-- Atomically claim a cart for checkout so two requests cannot create two
-- orders from the same cart.
ALTER TABLE carts ADD COLUMN checkout_order_id TEXT;
ALTER TABLE carts ADD COLUMN checkout_started_at TEXT;

-- Orders cancelled by older releases may already have restock movements but
-- no restocked_at value. Backfill the marker so the new idempotent cancel
-- path does not restore their stock a second time.
UPDATE orders
SET restocked_at = COALESCE(cancelled_at, updated_at, created_at)
WHERE status = 'cancelled'
  AND restocked_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM inventory_movements m
    WHERE m.reference_type = 'order'
      AND m.reference_id = orders.id
      AND m.reason = 'restock'
  );
