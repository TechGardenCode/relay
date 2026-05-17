-- 0003_skip.sql (fixture for `gap` migration scenario)
-- Intentional gap: the parseMigrationsDir step must reject this dir before any
-- DDL runs because version 2 is missing.
CREATE TABLE gap_skip (id TEXT PRIMARY KEY) STRICT;

INSERT INTO schema_versions (version, name, applied_at) VALUES (3, 'skip', 0);
