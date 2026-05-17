-- 0001_bad_sql.sql (fixture for `sql_error` migration scenario)
-- Pre-table parses and applies cleanly; the second statement is malformed.
-- The runner-owned transaction must roll the whole file back, so neither
-- table is left in the DB.
CREATE TABLE sql_error_good (id TEXT PRIMARY KEY) STRICT;

CREATE TABLE sql_error_bad (id TEXT
