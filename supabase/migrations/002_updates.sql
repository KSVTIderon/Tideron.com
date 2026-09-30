-- ─── Oppdater ppa_contracts til å matche appens skjema ──────────────────────
alter table ppa_contracts
  add column if not exists motpart            text,
  add column if not exists pris_kr_kwh        numeric,
  add column if not exists estimert_arlig_kwh double precision,
  add column if not exists notater            text;

-- Migrer eksisterende data
update ppa_contracts set motpart = kunde where motpart is null and kunde is not null;
update ppa_contracts set pris_kr_kwh = pris_per_kwh where pris_kr_kwh is null and pris_per_kwh is not null;

-- Utvid status-enum for PPA
alter table ppa_contracts drop constraint if exists ppa_contracts_status_check;
alter table ppa_contracts add constraint ppa_contracts_status_check
  check (status in ('utkast','forhandlet','signert','utlopt','aktiv','utlopt'));

-- ─── O&M-logg ────────────────────────────────────────────────────────────────
create table if not exists om_logs (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid references projects(id) on delete cascade,
  created_by     uuid references profiles(id),
  dato           date not null default current_date,
  type           text not null check (type in ('inspeksjon','reparasjon','service','hendelse','produksjon')),
  tittel         text not null,
  beskrivelse    text,
  kwh_produsert  double precision,
  kostnad_nok    numeric,
  created_at     timestamptz default now()
);

alter table om_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'om_logs' and policyname = 'om_logs_select'
  ) then
    execute $p$
      create policy om_logs_select on om_logs for select using (
        project_id in (
          select id from projects where owner_id = auth.uid()
          union
          select project_id from project_members where user_id = auth.uid()
        )
      )
    $p$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'om_logs' and policyname = 'om_logs_insert'
  ) then
    execute $p$
      create policy om_logs_insert on om_logs for insert with check (
        project_id in (
          select id from projects where owner_id = auth.uid()
          union
          select project_id from project_members where user_id = auth.uid()
        )
      )
    $p$;
  end if;
end $$;

-- ─── application_templates ───────────────────────────────────────────────────
alter table application_templates
  add column if not exists sist_evaluert date;

-- ─── RLS på ppa_contracts ────────────────────────────────────────────────────
alter table ppa_contracts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'ppa_contracts' and policyname = 'ppa_select'
  ) then
    execute $p$
      create policy ppa_select on ppa_contracts for select using (
        project_id in (select id from projects where owner_id = auth.uid())
      )
    $p$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'ppa_contracts' and policyname = 'ppa_all'
  ) then
    execute $p$
      create policy ppa_all on ppa_contracts for all using (
        project_id in (select id from projects where owner_id = auth.uid())
      )
    $p$;
  end if;
end $$;
