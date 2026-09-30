-- Per-prosjekt soknader og tillatelser
create table if not exists project_applications (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  tittel        text not null,
  type          text not null default 'konsesjon',
  status        text not null default 'under_utarbeidelse',
  myndighet     text,
  frist         date,
  innsendt_dato date,
  ansvarlig     text,
  notater       text,
  created_at    timestamptz default now()
);

alter table project_applications enable row level security;

create policy pa_select on project_applications for select using (auth.role() = 'authenticated');
create policy pa_insert on project_applications for insert with check (auth.role() = 'authenticated');
create policy pa_update on project_applications for update using (auth.role() = 'authenticated');
create policy pa_delete on project_applications for delete using (auth.role() = 'authenticated');
