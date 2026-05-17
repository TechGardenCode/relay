-- 0001_initial.sql (fixture for `ahead` migration scenario)
-- The on-disk max version is 1; the test pre-populates schema_versions with
-- version=5 to simulate a downgrade. Runner must refuse boot with code='ahead'.
CREATE TABLE ahead_initial (id TEXT PRIMARY KEY) STRICT;

INSERT INTO schema_versions (version, name, applied_at) VALUES (1, 'initial', 0);
