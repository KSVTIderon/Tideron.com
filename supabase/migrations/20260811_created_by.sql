-- Eier: e-post til brukeren som opprettet prosjektet
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS created_by text;
