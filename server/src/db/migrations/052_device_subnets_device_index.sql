-- Support cascade deletes and device-centric membership lookups on device_subnets.
-- Migration 045 added idx_device_subnets_subnet; this adds the other side.
CREATE INDEX IF NOT EXISTS idx_device_subnets_device ON device_subnets (device_id);
