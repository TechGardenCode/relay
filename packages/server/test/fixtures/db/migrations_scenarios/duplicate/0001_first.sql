-- 0001_first.sql (fixture for `duplicate` migration scenario)
-- See README in this directory: two distinct *.sql files cannot share a
-- filename, so the duplicate guard is defensive code. The spec documents the
-- gap-check as the practical equivalent and asserts the duplicate branch's
-- existence via static analysis only.
CREATE TABLE duplicate_first (id TEXT PRIMARY KEY) STRICT;

INSERT INTO schema_versions (version, name, applied_at) VALUES (1, 'first', 0);
