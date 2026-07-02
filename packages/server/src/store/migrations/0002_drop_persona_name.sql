-- 0002_drop_persona_name.sql
-- Drop the persona_name column from sessions (D-17 persona code removal).

-- Per D-17: personas are descoped from MVP and the persona code was removed
-- (restore point: tag pre-cleanup-phase1). The sentinel-backed column is
-- droppable: it is NOT NULL with no index, CHECK, or FK referencing it.
ALTER TABLE sessions DROP COLUMN persona_name;

INSERT INTO schema_versions (version, name, applied_at)
VALUES (2, 'drop_persona_name', CAST(strftime('%s','now') AS INTEGER) * 1000);
