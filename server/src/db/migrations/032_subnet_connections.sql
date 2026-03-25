ALTER TABLE connections ADD COLUMN source_subnet_id INTEGER REFERENCES subnets(id) ON DELETE CASCADE;
ALTER TABLE connections ADD COLUMN target_subnet_id INTEGER REFERENCES subnets(id) ON DELETE CASCADE;
