-- Legg til manglende kolonner på rotors-tabellen
-- Disse brukes i kart/page.tsx men manglet i skjema
ALTER TABLE rotors
  ADD COLUMN IF NOT EXISTS nominell_kw_1_8  NUMERIC,
  ADD COLUMN IF NOT EXISTS lengde_m          NUMERIC,
  ADD COLUMN IF NOT EXISTS hastighet_m_s     NUMERIC,
  ADD COLUMN IF NOT EXISTS serienummer       TEXT,
  ADD COLUMN IF NOT EXISTS notater           TEXT,
  ADD COLUMN IF NOT EXISTS v_vinkel_grader   NUMERIC DEFAULT 90;
