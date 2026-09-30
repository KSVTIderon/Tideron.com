-- Solcellefelt per prosjekt
CREATE TABLE IF NOT EXISTS solar_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  navn        TEXT,
  areal_m2    NUMERIC,
  koordinater JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE solar_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autentiserte brukere kan lese og skrive solcellefelt"
  ON solar_fields FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
