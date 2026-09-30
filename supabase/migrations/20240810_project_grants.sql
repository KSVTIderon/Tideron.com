-- Støtteordninger / tilskudd per prosjekt
create table if not exists project_grants (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade not null,
  navn          text not null,
  kilde         text,
  land          text,
  kategori      text,                         -- produksjon | innovasjon | nett | infrastruktur
  beregning     text not null default 'prosent', -- 'prosent' | 'sum'
  prosent       numeric,                      -- % av brutto CAPEX
  belop_nok     numeric,                      -- fast beløp i NOK
  status        text not null default 'planlagt', -- planlagt | søkt | innvilget
  merknad       text,
  created_at    timestamptz default now()
);

alter table project_grants enable row level security;

create policy "project_grants_select" on project_grants
  for select using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

create policy "project_grants_insert" on project_grants
  for insert with check (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

create policy "project_grants_update" on project_grants
  for update using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );

create policy "project_grants_delete" on project_grants
  for delete using (
    project_id in (
      select id from projects where user_id = auth.uid()
    )
  );
