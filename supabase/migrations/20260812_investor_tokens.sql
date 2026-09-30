-- Sporingslenker for investor-utsendelser
CREATE TABLE IF NOT EXISTS investor_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  navn             TEXT,
  pitch_type       TEXT,          -- 'teaser' | 'full' | null (bare lenke)
  pitch_tekst      TEXT,          -- den genererte pitchteksten som ble sendt
  token            TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  sent_at          TIMESTAMPTZ DEFAULT NOW(),
  first_visited_at TIMESTAMPTZ,
  last_visited_at  TIMESTAMPTZ,
  visit_count      INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Anon kan lese og oppdatere via token (token er hemmeligheten)
ALTER TABLE investor_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle kan lese via token" ON investor_tokens FOR SELECT USING (true);
CREATE POLICY "Alle kan oppdatere via token" ON investor_tokens FOR UPDATE USING (true);
CREATE POLICY "Autentiserte brukere kan sette inn" ON investor_tokens FOR INSERT WITH CHECK (true);
