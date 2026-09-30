-- ─────────────────────────────────────────────────────────────────────────────
-- Tideron Platform — Initial Schema
-- Kjør i Supabase SQL Editor: Dashboard → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";  -- for fristpåminnelser (aktiver i Supabase Dashboard)

-- ─── Brukerprofiler ──────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  navn        text,
  epost       text,
  rolle       text default 'bruker',   -- admin | bruker
  sist_aktiv  timestamptz,
  created_at  timestamptz default now()
);

-- Opprett profil automatisk ved ny bruker
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, epost)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── StreamLeads (globale strømlokasjoner) ───────────────────────────────────
create table if not exists stream_leads (
  id                uuid primary key default uuid_generate_v4(),
  navn              text not null,
  lat               double precision,
  lon               double precision,
  stream_type       text check (stream_type in ('tidevann','elv','havstrøm')),
  avg_velocity_m_s  double precision,
  peak_velocity_m_s double precision,
  velocity_source   text,
  status            text default 'prospekt'
                    check (status in ('prospekt','vurdert','planlagt','aktivt','avvist')),
  rapportert_av     uuid references profiles(id),
  rapportert_dato   date default current_date,
  sist_oppdatert    timestamptz default now(),
  project_id        uuid,   -- FK settes etter projects-tabell
  notater           text,
  created_at        timestamptz default now()
);

-- ─── Prosjekter ──────────────────────────────────────────────────────────────
create table if not exists projects (
  id              uuid primary key default uuid_generate_v4(),
  navn            text not null,
  sted            text,
  lat             double precision,
  lon             double precision,
  land            text default 'NO',
  valuta          text default 'NOK',
  stadie          text default 'Prospektering'
                  check (stadie in (
                    'Prospektering','Forhåndsutredning','Godkjent',
                    'Pilot','Utbygging','Ferdig utbygd'
                  )),
  stream_lead_id  uuid references stream_leads(id),
  owner_id        uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- FK tilbake fra stream_leads → projects
alter table stream_leads
  add constraint fk_stream_lead_project
  foreign key (project_id) references projects(id);

-- ─── Stream (strøm per prosjekt) ─────────────────────────────────────────────
create table if not exists streams (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid references projects(id) on delete cascade,
  stream_type       text check (stream_type in ('tidevann','elv','havstrøm')),
  peak_velocity_m_s double precision,
  avg_velocity_m_s  double precision
                    generated always as (peak_velocity_m_s * 0.637) stored,
  datakilde         text,
  notat             text,
  created_at        timestamptz default now()
);

-- ─── Rotorer ─────────────────────────────────────────────────────────────────
create table if not exists rotors (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id) on delete cascade,
  modell          text,                  -- f.eks. 'Waterotor 6ft'
  diameter_m      double precision default 1.83,
  hoyde_m         double precision default 1.83,
  bredde_m        double precision,
  effekt_kw       double precision,
  lat             double precision,
  lon             double precision,
  container_id    uuid,                  -- FK til landgangscontainere
  created_at      timestamptz default now()
);

-- ─── Landgangscontainere ─────────────────────────────────────────────────────
create table if not exists containers (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id) on delete cascade,
  navn            text,
  lat             double precision,
  lon             double precision,
  antall_rotorer  int default 0,
  basispris_nok   numeric default 80000,
  created_at      timestamptz default now()
);

alter table rotors add constraint fk_rotor_container
  foreign key (container_id) references containers(id);

-- ─── Prosjektmedlemmer ───────────────────────────────────────────────────────
create table if not exists project_members (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid references projects(id) on delete cascade,
  user_id     uuid references profiles(id) on delete cascade,
  rolle       text default 'member',   -- owner | member
  created_at  timestamptz default now(),
  unique(project_id, user_id)
);

-- ─── Prosjektinvitasjoner ────────────────────────────────────────────────────
create table if not exists project_invites (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id) on delete cascade,
  invitee_email   text not null,
  invitee_scope   text default 'full'
                  check (invitee_scope in ('full','ingen_finans','kun_teknisk')),
  token           uuid default uuid_generate_v4(),
  expires_at      timestamptz default (now() + interval '7 days'),
  akseptert       boolean default false,
  created_at      timestamptz default now()
);

-- ─── Oppgaver (Tasks) ────────────────────────────────────────────────────────
create table if not exists tasks (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id) on delete cascade,
  tittel          text not null,
  beskrivelse     text,
  tildelt_til     uuid references profiles(id),
  opprettet_av    uuid references profiles(id),
  frist           timestamptz,
  prioritet       text default 'normal'
                  check (prioritet in ('lav','normal','høy','kritisk')),
  status          text default 'åpen'
                  check (status in ('åpen','pågående','fullført','avvist')),
  fullfort_dato   timestamptz,
  notater         text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── Søknadsmaler ────────────────────────────────────────────────────────────
create table if not exists application_templates (
  id              uuid primary key default uuid_generate_v4(),
  navn            text not null,
  type            text,               -- NVE | Statsforvalter | Enova | Kommune | InnoNorge
  mal_innhold     text,               -- Markdown/HTML
  sist_evaluert   date,
  aktiv           boolean default true,
  created_at      timestamptz default now()
);

-- ─── PPA-kontrakter ──────────────────────────────────────────────────────────
create table if not exists ppa_contracts (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id) on delete cascade,
  kunde           text,
  pris_per_kwh    numeric,
  valuta          text default 'NOK',
  varighet_aar    int,
  start_dato      date,
  slutt_dato      date,
  status          text default 'utkast' check (status in ('utkast','aktiv','utløpt')),
  created_at      timestamptz default now()
);

-- ─── Solcellesoner ───────────────────────────────────────────────────────────
create table if not exists solar_zones (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id) on delete cascade,
  navn            text,
  polygon         jsonb,              -- GeoJSON polygon (4 punkter)
  areal_m2        double precision,
  pris_per_m2     numeric default 2500,
  monteringspris  numeric default 500,
  created_at      timestamptz default now()
);

-- ─── Batteripakker ───────────────────────────────────────────────────────────
create table if not exists battery_packs (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid references projects(id) on delete cascade,
  kapasitet_kwh   double precision,
  effekt_kw       double precision,
  pris_nok        numeric,
  leverandor      text,
  created_at      timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table tasks enable row level security;
alter table stream_leads enable row level security;
alter table rotors enable row level security;

-- Brukere ser kun sin egen profil
create policy "Bruker ser egen profil"
  on profiles for select using (auth.uid() = id);

-- Prosjekter: synlig for medlemmer
create policy "Prosjektmedlemmer ser prosjektet"
  on projects for select
  using (
    id in (select project_id from project_members where user_id = auth.uid())
    or owner_id = auth.uid()
  );

-- Oppgaver: tildelt bruker ser sine egne oppgaver
create policy "Ser egne oppgaver"
  on tasks for select
  using (tildelt_til = auth.uid() or opprettet_av = auth.uid());

create policy "Prosjektmedlemmer ser alle oppgaver i prosjektet"
  on tasks for select
  using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

-- StreamLeads: alle innloggede brukere ser alle
create policy "Innloggede ser stream_leads"
  on stream_leads for select using (auth.role() = 'authenticated');

create policy "Innloggede oppretter stream_leads"
  on stream_leads for insert with check (auth.role() = 'authenticated');

-- Rotorer: synlig for prosjektmedlemmer
create policy "Prosjektmedlemmer ser rotorer"
  on rotors for select
  using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );
