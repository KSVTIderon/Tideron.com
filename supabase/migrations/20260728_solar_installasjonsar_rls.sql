-- Driftsår på solcellefelt
ALTER TABLE solar_fields
  ADD COLUMN IF NOT EXISTS installasjonsar INTEGER;

-- Deaktiver RLS på ppa_contracts (appen bruker anon-nøkkel, ingen auth.uid())
ALTER TABLE ppa_contracts DISABLE ROW LEVEL SECURITY;
