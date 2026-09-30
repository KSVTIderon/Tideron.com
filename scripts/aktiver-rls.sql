-- ============================================================
-- Aktiver Row Level Security (RLS) på alle tabeller
-- som mangler det ifølge Supabase Security Advisor.
--
-- Kjør i Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- Strategi:
--   • projects, streams, rotors, countries → brukerisolering via
--     project_members / allowed_users
--   • allowed_users → kun service_role kan lese/skrive (aldri klienten)
--   • cables, containers, project_grants, project_loans, solar_fields
--     → koblet til projects, så samme tilgang som prosjektet
-- ============================================================

-- ── 1. AKTIVER RLS ──────────────────────────────────────────

ALTER TABLE public.cables          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.containers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_loans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solar_fields    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_users   ENABLE ROW LEVEL SECURITY;

-- ── 2. POLICIES ─────────────────────────────────────────────
-- Appen bruker service_role-nøkkelen (supabaseAdmin) for alle
-- server-side-kall, så vi trenger ikke åpne for anon/authenticated.
-- Disse policyene sier: kun service_role (backend) har tilgang.
-- Det stopper direkte klientangrep mot disse tabellene.

-- cables
DROP POLICY IF EXISTS "service_role_only" ON public.cables;
CREATE POLICY "service_role_only" ON public.cables
  USING (auth.role() = 'service_role');

-- containers
DROP POLICY IF EXISTS "service_role_only" ON public.containers;
CREATE POLICY "service_role_only" ON public.containers
  USING (auth.role() = 'service_role');

-- project_grants
DROP POLICY IF EXISTS "service_role_only" ON public.project_grants;
CREATE POLICY "service_role_only" ON public.project_grants
  USING (auth.role() = 'service_role');

-- project_loans
DROP POLICY IF EXISTS "service_role_only" ON public.project_loans;
CREATE POLICY "service_role_only" ON public.project_loans
  USING (auth.role() = 'service_role');

-- solar_fields
DROP POLICY IF EXISTS "service_role_only" ON public.solar_fields;
CREATE POLICY "service_role_only" ON public.solar_fields
  USING (auth.role() = 'service_role');

-- allowed_users (passord-hashes — ekstra viktig å beskytte)
DROP POLICY IF EXISTS "service_role_only" ON public.allowed_users;
CREATE POLICY "service_role_only" ON public.allowed_users
  USING (auth.role() = 'service_role');

-- ── 3. BEKREFT ──────────────────────────────────────────────
-- Kjør dette for å se at RLS er skrudd på:
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('cables','containers','project_grants','project_loans','solar_fields','allowed_users')
ORDER BY tablename;
