-- Utvid solar_fields med panel-detaljer
ALTER TABLE solar_fields
  ADD COLUMN IF NOT EXISTS panel_type       TEXT    DEFAULT 'monokrystallinsk',
  ADD COLUMN IF NOT EXISTS effektivitet_pst NUMERIC DEFAULT 21,
  ADD COLUMN IF NOT EXISTS tilt_grader      NUMERIC DEFAULT 30,
  ADD COLUMN IF NOT EXISTS azimut_grader    NUMERIC DEFAULT 180,
  ADD COLUMN IF NOT EXISTS notater          TEXT;
