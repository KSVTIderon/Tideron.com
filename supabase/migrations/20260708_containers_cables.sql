-- Containere (elektriske anlegg, transformatorer, kontrollrom)
create table if not exists containers (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid references projects(id) on delete cascade not null,
  navn        text not null default 'Container',
  type        text not null default 'elektrisk',  -- elektrisk | transformator | kontroll
  lat         double precision,
  lon         double precision,
  notater     text,
  created_at  timestamptz default now()
);
alter table containers enable row level security;
create policy "Autentiserte brukere kan alt" on containers
  for all using (auth.role() = 'authenticated');

-- Kabler (polyline med flere waypoints)
create table if not exists cables (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid references projects(id) on delete cascade not null,
  navn        text not null default 'Kabel',
  type        text not null default 'AC',  -- AC | DC | lavspent
  waypoints   jsonb not null default '[]', -- [{lat, lon}, ...]
  notater     text,
  created_at  timestamptz default now()
);
alter table cables enable row level security;
create policy "Autentiserte brukere kan alt" on cables
  for all using (auth.role() = 'authenticated');
