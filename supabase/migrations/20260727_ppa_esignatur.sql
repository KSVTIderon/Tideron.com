-- Utvid ppa_contracts med alle PPA-malvariabler og signeringsstatus
ALTER TABLE ppa_contracts
  ADD COLUMN IF NOT EXISTS spv_navn             TEXT,
  ADD COLUMN IF NOT EXISTS spv_org_nr           TEXT,
  ADD COLUMN IF NOT EXISTS spv_adresse          TEXT,
  ADD COLUMN IF NOT EXISTS spv_kontaktperson    TEXT,
  ADD COLUMN IF NOT EXISTS spv_epost            TEXT,
  ADD COLUMN IF NOT EXISTS spv_telefon          TEXT,
  ADD COLUMN IF NOT EXISTS kjoper_navn          TEXT,
  ADD COLUMN IF NOT EXISTS kjoper_org_nr        TEXT,
  ADD COLUMN IF NOT EXISTS kjoper_adresse       TEXT,
  ADD COLUMN IF NOT EXISTS kjoper_kontaktperson TEXT,
  ADD COLUMN IF NOT EXISTS kjoper_epost         TEXT,
  ADD COLUMN IF NOT EXISTS kjoper_telefon       TEXT,
  ADD COLUMN IF NOT EXISTS anleggsnavn          TEXT,
  ADD COLUMN IF NOT EXISTS installert_effekt_kw NUMERIC,
  ADD COLUMN IF NOT EXISTS estimert_arsprod_kwh NUMERIC,
  ADD COLUMN IF NOT EXISTS gsrn_maalepunkt_id   TEXT,
  ADD COLUMN IF NOT EXISTS avregningsperiode    TEXT DEFAULT 'Månedlig',
  ADD COLUMN IF NOT EXISTS forventet_cod_dato   DATE,
  ADD COLUMN IF NOT EXISTS avtalens_utlop_dato  DATE,
  ADD COLUMN IF NOT EXISTS antall_ar            INTEGER,
  ADD COLUMN IF NOT EXISTS sted_signering       TEXT,
  ADD COLUMN IF NOT EXISTS goo_eier             TEXT DEFAULT 'Selger',
  ADD COLUMN IF NOT EXISTS signing_status       TEXT DEFAULT 'utkast';

-- Signeringsstokens: én per kontrakt per mottaker
CREATE TABLE IF NOT EXISTS ppa_signing_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES ppa_contracts(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  signer_email TEXT NOT NULL,
  signer_navn  TEXT,
  sign_ip      TEXT,
  sign_name    TEXT,
  signed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS (consistent with all other tables; app uses anon key directly)
ALTER TABLE ppa_signing_tokens DISABLE ROW LEVEL SECURITY;
