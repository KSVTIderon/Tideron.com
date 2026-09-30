-- Hydraulikk-parametere per prosjekt
-- Brukes for å beregne P_maks (elvens totale kinetiske effektflux)
-- og begrense rotorareal via blokkeringsgrense.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS elv_bredde_m    NUMERIC,          -- elvens bredde i meter
  ADD COLUMN IF NOT EXISTS elv_dybde_m     NUMERIC,          -- elvens midlere dybde i meter
  ADD COLUMN IF NOT EXISTS blokkering_pst  NUMERIC DEFAULT 20, -- blokkeringsgrense % (typisk 20–30 %)
  ADD COLUMN IF NOT EXISTS vann_type       TEXT    DEFAULT 'ferskvann', -- 'ferskvann' | 'sjovann'
  ADD COLUMN IF NOT EXISTS vannforing_m3s  NUMERIC,          -- gjennomsnittlig vannføring m³/s
  ADD COLUMN IF NOT EXISTS gradient_m_km   NUMERIC;          -- elvefall i m/km (fra gradient-måling)
