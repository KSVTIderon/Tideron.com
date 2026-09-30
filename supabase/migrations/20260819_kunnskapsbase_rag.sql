-- Kunnskapsassistent: pgvector-basert RAG-kunnskapsbase for Tideron
-- Kjør denne migrasjonen i Supabase (SQL Editor, eller `supabase db push`)
-- FØR du tar i bruk /api/assistent/chat eller scripts/ingest-kunnskapsbase.ts.

create extension if not exists vector;

-- ── Kunnskapsbase: tekstbiter med embeddings ────────────────────────────────
create table if not exists kunnskapsbase_chunks (
  id            bigserial primary key,
  source        text not null,                 -- filnavn / dokumentnavn
  audience      text not null check (audience in ('internal', 'customer')),
  category      text,
  chunk_index   int not null default 0,
  content       text not null,
  embedding     vector(1024),                   -- voyage-3.5 standarddimensjon
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists kunnskapsbase_chunks_audience_idx
  on kunnskapsbase_chunks (audience);

create index if not exists kunnskapsbase_chunks_source_idx
  on kunnskapsbase_chunks (source);

-- HNSW-indeks for raskt kosinus-likhetssøk (pgvector >= 0.5.0, standard på Supabase).
-- Hvis dette feiler på din Supabase-instans (eldre pgvector), bytt til:
--   create index ... using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists kunnskapsbase_chunks_embedding_idx
  on kunnskapsbase_chunks using hnsw (embedding vector_cosine_ops);

-- RLS: tabellen skal KUN nås server-side via service-role-klienten (supabaseAdmin).
-- Ingen policies opprettes = ingen tilgang for anon/authenticated klienter.
alter table kunnskapsbase_chunks enable row level security;

-- ── Søkefunksjon ─────────────────────────────────────────────────────────────
-- allow_internal = false  -> kun audience='customer' returneres (kundemodus)
-- allow_internal = true   -> alle chunks returneres (internmodus, Tideron-team)
create or replace function match_kunnskapsbase(
  query_embedding vector(1024),
  match_count int default 6,
  allow_internal boolean default false
)
returns table (
  id bigint,
  source text,
  audience text,
  category text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id, source, audience, category, content,
    1 - (embedding <=> query_embedding) as similarity
  from kunnskapsbase_chunks
  where allow_internal or audience = 'customer'
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ── Spørsmålslogg ────────────────────────────────────────────────────────────
-- Loggfører hvert spørsmål stilt til assistenten - nyttig for salg/produktinnsikt
-- (hva lurer besøkende faktisk på?) og for å finne kunnskapshull.
create table if not exists kunnskapsbase_sporsmalslogg (
  id            bigserial primary key,
  audience      text not null check (audience in ('internal', 'customer')),
  sporsmal      text not null,
  svar          text,
  kilder        jsonb,
  bruker_epost  text,
  created_at    timestamptz not null default now()
);

alter table kunnskapsbase_sporsmalslogg enable row level security;
