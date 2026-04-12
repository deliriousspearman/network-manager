-- Full-text search index over devices.
--
-- Replaces a slow LIKE + EXISTS fan-out across device_ips and device_tags.
-- The FTS table is denormalised: ip_list and tag_list are space-joined
-- strings rebuilt from device_ips / device_tags on write. Triggers below
-- keep devices_fts in sync; rowid mirrors devices.id for joining back.

CREATE VIRTUAL TABLE IF NOT EXISTS devices_fts USING fts5(
  name, os, type, hostname, location, ip_list, tag_list, subnet_name,
  tokenize='unicode61 remove_diacritics 2'
);

-- Initial population
INSERT INTO devices_fts(rowid, name, os, type, hostname, location, ip_list, tag_list, subnet_name)
SELECT
  d.id,
  COALESCE(d.name, ''),
  COALESCE(d.os, ''),
  COALESCE(d.type, ''),
  COALESCE(d.hostname, ''),
  COALESCE(d.location, ''),
  COALESCE((SELECT GROUP_CONCAT(ip_address, ' ') FROM device_ips WHERE device_id = d.id), ''),
  COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM device_tags WHERE device_id = d.id), ''),
  COALESCE((SELECT name FROM subnets WHERE id = d.subnet_id), '')
FROM devices d;

-- devices: insert/update/delete
CREATE TRIGGER IF NOT EXISTS devices_fts_ai AFTER INSERT ON devices BEGIN
  INSERT INTO devices_fts(rowid, name, os, type, hostname, location, ip_list, tag_list, subnet_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, ''),
    COALESCE(NEW.os, ''),
    COALESCE(NEW.type, ''),
    COALESCE(NEW.hostname, ''),
    COALESCE(NEW.location, ''),
    '',
    '',
    COALESCE((SELECT name FROM subnets WHERE id = NEW.subnet_id), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS devices_fts_au AFTER UPDATE ON devices BEGIN
  DELETE FROM devices_fts WHERE rowid = OLD.id;
  INSERT INTO devices_fts(rowid, name, os, type, hostname, location, ip_list, tag_list, subnet_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, ''),
    COALESCE(NEW.os, ''),
    COALESCE(NEW.type, ''),
    COALESCE(NEW.hostname, ''),
    COALESCE(NEW.location, ''),
    COALESCE((SELECT GROUP_CONCAT(ip_address, ' ') FROM device_ips WHERE device_id = NEW.id), ''),
    COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM device_tags WHERE device_id = NEW.id), ''),
    COALESCE((SELECT name FROM subnets WHERE id = NEW.subnet_id), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS devices_fts_ad AFTER DELETE ON devices BEGIN
  DELETE FROM devices_fts WHERE rowid = OLD.id;
END;

-- device_ips: rebuild ip_list on the affected device
CREATE TRIGGER IF NOT EXISTS device_ips_fts_ai AFTER INSERT ON device_ips BEGIN
  UPDATE devices_fts
  SET ip_list = COALESCE((SELECT GROUP_CONCAT(ip_address, ' ') FROM device_ips WHERE device_id = NEW.device_id), '')
  WHERE rowid = NEW.device_id;
END;

CREATE TRIGGER IF NOT EXISTS device_ips_fts_au AFTER UPDATE ON device_ips BEGIN
  UPDATE devices_fts
  SET ip_list = COALESCE((SELECT GROUP_CONCAT(ip_address, ' ') FROM device_ips WHERE device_id = NEW.device_id), '')
  WHERE rowid = NEW.device_id;
END;

CREATE TRIGGER IF NOT EXISTS device_ips_fts_ad AFTER DELETE ON device_ips BEGIN
  UPDATE devices_fts
  SET ip_list = COALESCE((SELECT GROUP_CONCAT(ip_address, ' ') FROM device_ips WHERE device_id = OLD.device_id), '')
  WHERE rowid = OLD.device_id;
END;

-- device_tags: rebuild tag_list on the affected device
CREATE TRIGGER IF NOT EXISTS device_tags_fts_ai AFTER INSERT ON device_tags BEGIN
  UPDATE devices_fts
  SET tag_list = COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM device_tags WHERE device_id = NEW.device_id), '')
  WHERE rowid = NEW.device_id;
END;

CREATE TRIGGER IF NOT EXISTS device_tags_fts_ad AFTER DELETE ON device_tags BEGIN
  UPDATE devices_fts
  SET tag_list = COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM device_tags WHERE device_id = OLD.device_id), '')
  WHERE rowid = OLD.device_id;
END;

-- subnets: propagate name changes to all devices assigned to this subnet
CREATE TRIGGER IF NOT EXISTS subnets_fts_au AFTER UPDATE OF name ON subnets BEGIN
  UPDATE devices_fts
  SET subnet_name = COALESCE(NEW.name, '')
  WHERE rowid IN (SELECT id FROM devices WHERE subnet_id = NEW.id);
END;
