-- Investorer per prosjekt
create table if not exists project_investors (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade not null,
  navn            text not null,
  epost           text,
  eierandel_pst   numeric not null default 0,   -- % eierandel i prosjektet
  investert_nok   numeric,                       -- faktisk investert kapital (NOK)
  status          text not null default 'planlagt', -- planlagt | bekreftet | innbetalt
  merknad         text,
  created_at      timestamptz default now()
);

alter table project_investors disable row level security;
