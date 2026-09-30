-- Høydedata (meter over havet) for hver plassert rotor
ALTER TABLE rotors ADD COLUMN IF NOT EXISTS elevation_m NUMERIC;
