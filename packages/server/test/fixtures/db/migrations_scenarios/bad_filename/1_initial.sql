-- 1_initial.sql (fixture for `bad_filename` migration scenario)
-- 3-digit prefix violates the NNNN_short_description.sql convention; parser
-- must throw MigrationError code='bad_filename' before any DDL executes.
CREATE TABLE bad_filename_initial (id TEXT PRIMARY KEY) STRICT;
