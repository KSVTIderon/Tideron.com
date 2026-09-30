-- solar_fields bruker anon-nøkkel (ingen Supabase Auth) — deaktiver RLS
-- Same pattern som ppa_contracts (20260728_solar_installasjonsar_rls.sql)
ALTER TABLE solar_fields DISABLE ROW LEVEL SECURITY;
