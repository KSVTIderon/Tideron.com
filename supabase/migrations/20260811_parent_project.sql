-- Samleprosjekt: hvert prosjekt kan tilhøre et overordnet prosjekt
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
