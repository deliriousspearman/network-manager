CREATE TABLE IF NOT EXISTS device_subnets (
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  subnet_id INTEGER NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
  PRIMARY KEY (device_id, subnet_id)
);
