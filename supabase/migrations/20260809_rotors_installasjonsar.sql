-- Installasjonsår på rotorer (mangler fra opprinnelig skjema)
ALTER TABLE rotors
  ADD COLUMN IF NOT EXISTS installasjonsar INTEGER;
