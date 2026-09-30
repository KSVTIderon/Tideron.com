-- V-rotor støtte: legg til rotor_type og dimensjoner på rotors-tabellen
ALTER TABLE rotors
  ADD COLUMN IF NOT EXISTS rotor_type      TEXT    DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS bredde_m        NUMERIC,
  ADD COLUMN IF NOT EXISTS dybde_m         NUMERIC,
  ADD COLUMN IF NOT EXISTS retning_grader  NUMERIC DEFAULT 0;
