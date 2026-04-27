-- UNIQUE constraints on device_ips(device_id, ip_address) and subnets(project_id, cidr).
-- Both are expressed as unique indexes, which is the simplest way to add a
-- composite uniqueness constraint without recreating the table.
--
-- We deduplicate existing rows first (keep MIN(id)) — these are extremely rare
-- in practice but CREATE UNIQUE INDEX fails if duplicates exist. After this
-- migration, route handlers must catch SQLITE_CONSTRAINT_UNIQUE and return 400.

-- device_ips: drop duplicate (device_id, ip_address) pairs, keeping the oldest row.
DELETE FROM device_ips
 WHERE id NOT IN (
   SELECT MIN(id) FROM device_ips GROUP BY device_id, ip_address
 );

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_ips_unique
  ON device_ips(device_id, ip_address);

-- subnets: drop duplicate (project_id, cidr) pairs, keeping the oldest row.
DELETE FROM subnets
 WHERE id NOT IN (
   SELECT MIN(id) FROM subnets GROUP BY project_id, cidr
 );

CREATE UNIQUE INDEX IF NOT EXISTS idx_subnets_project_cidr_unique
  ON subnets(project_id, cidr);
