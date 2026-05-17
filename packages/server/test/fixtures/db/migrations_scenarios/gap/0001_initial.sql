-- 0001_initial.sql (fixture for `gap` migration scenario)
-- Pairs with 0003_skip.sql; the missing 0002 must cause MigrationError code='gap'.
CREATE TABLE gap_initial (id TEXT PRIMARY KEY) STRICT;

INSERT INTO schema_versions (version, name, applied_at) VALUES (1, 'initial', 0);
