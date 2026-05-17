-- 0001_initial.sql (fixture for `behind` migration scenario)
-- Creates a single trivial table; the test pre-populates schema_versions with
-- version=1 before invoking the runner, so this file should be skipped.
CREATE TABLE behind_initial (id TEXT PRIMARY KEY) STRICT;

INSERT INTO schema_versions (version, name, applied_at) VALUES (1, 'initial', 0);
