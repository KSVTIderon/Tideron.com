-- Energikilde og sammenligningspris per prosjekt
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS energikilde text NOT NULL DEFAULT 'grid',
  ADD COLUMN IF NOT EXISTS sammenligning_kr_kwh float8 NOT NULL DEFAULT 1.2;
