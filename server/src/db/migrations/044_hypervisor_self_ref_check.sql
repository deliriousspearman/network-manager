-- Prevent a device from being its own hypervisor
-- SQLite doesn't support ADD CONSTRAINT on existing tables, so we
-- enforce this at the application level (see devices route validation).
-- This migration adds a trigger as the enforcement mechanism.

CREATE TRIGGER IF NOT EXISTS trg_no_self_hypervisor_insert
BEFORE INSERT ON devices
WHEN NEW.hypervisor_id IS NOT NULL AND NEW.hypervisor_id = NEW.id
BEGIN
  SELECT RAISE(ABORT, 'A device cannot be its own hypervisor');
END;

CREATE TRIGGER IF NOT EXISTS trg_no_self_hypervisor_update
BEFORE UPDATE ON devices
WHEN NEW.hypervisor_id IS NOT NULL AND NEW.hypervisor_id = NEW.id
BEGIN
  SELECT RAISE(ABORT, 'A device cannot be its own hypervisor');
END;
