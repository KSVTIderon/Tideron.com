-- Lån per prosjekt
create table if not exists project_loans (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references projects(id) on delete cascade not null,
  navn                text,
  kilde               text,
  belop_nok           numeric not null,
  rente_pst           numeric not null default 5,
  nedbetalingstid_ar  integer not null default 15,
  startaar            integer,
  laan_type           text not null default 'annuitet',  -- 'annuitet' | 'serie'
  status              text not null default 'planlagt',  -- planlagt | bekreftet | trukket
  merknad             text,
  created_at          timestamptz default now()
);

alter table project_loans enable row level security;

create policy "project_loans_select" on project_loans
  for select using (
    project_id in (select id from projects where owner_id = auth.uid())
  );

create policy "project_loans_insert" on project_loans
  for insert with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );

create policy "project_loans_update" on project_loans
  for update using (
    project_id in (select id from projects where owner_id = auth.uid())
  );

create policy "project_loans_delete" on project_loans
  for delete using (
    project_id in (select id from projects where owner_id = auth.uid())
  );
