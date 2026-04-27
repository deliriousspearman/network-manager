-- Missing output_id index on parsed_arp — migration 058 added this index for
-- 7 other parsed_* tables but omitted parsed_arp. Migration 064 recreated the
-- table without restoring the index either. Without it, every command-output
-- fetch full-scans parsed_arp.

CREATE INDEX IF NOT EXISTS idx_parsed_arp_output ON parsed_arp(output_id);
