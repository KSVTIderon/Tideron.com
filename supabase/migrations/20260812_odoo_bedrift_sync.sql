-- Cache over bedrifter allerede synkronisert til Odoo CRM
CREATE TABLE IF NOT EXISTS odoo_bedrift_sync (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgnr      TEXT NOT NULL,
  navn       TEXT,
  odoo_id    INT,                                         -- Odoo lead-ID
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  synced_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Unikt på orgnr globalt — forhindrer duplikater på tvers av prosjekter
CREATE UNIQUE INDEX IF NOT EXISTS odoo_bedrift_sync_orgnr_idx ON odoo_bedrift_sync(orgnr);

ALTER TABLE odoo_bedrift_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autentiserte kan lese og skrive" ON odoo_bedrift_sync FOR ALL USING (true);
