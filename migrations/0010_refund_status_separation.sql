-- Older releases stored partial refunds in the order status, which blocked
-- fulfilment. Move legacy partial-refund statuses back to a fulfilment state;
-- tracking data, when present, means the order had already shipped.
UPDATE orders
SET status = CASE
    WHEN tracking_number IS NOT NULL OR shipping_carrier IS NOT NULL THEN 'shipped'
    ELSE 'paid'
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'partially_refunded';
