-- 0002_add_widgets.sql (fixture for `behind` migration scenario)
-- Should be applied because the pre-populated schema_versions stops at v1.
CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;

INSERT INTO schema_versions (version, name, applied_at) VALUES (2, 'add_widgets', 0);
