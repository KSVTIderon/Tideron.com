-- Dokumentmetadata per prosjekt
create table if not exists project_documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade,
  filnavn      text not null,
  storage_path text not null,
  filstorrelse bigint,
  mime_type    text,
  kategori     text default 'annet',
  lastet_opp_av uuid references profiles(id),
  created_at   timestamptz default now()
);

alter table project_documents enable row level security;

create policy pd_select on project_documents for select using (auth.role() = 'authenticated');
create policy pd_insert on project_documents for insert with check (auth.role() = 'authenticated');
create policy pd_delete on project_documents for delete using (auth.role() = 'authenticated');
