-- Fase B dell'algoritmo: voti aggregati multi-fonte e classifiche settimanali.
-- Tabelle a parte, MAI colonne dentro `titles`: quella riga viene riscritta per intero
-- da `upsertTitle` a ogni rinfresco del cache TMDB e i voti sparirebbero.

create table public.title_ratings (
  title_id      bigint not null,
  media_type    public.media_type not null,
  -- {"imdb":{"value":8.5,"votes":1200000}, "tomatoes":{"value":92,"votes":410}, ...}
  sources       jsonb not null default '{}'::jsonb,
  zapp_score    numeric(3,1),
  zapp_votes    bigint not null default 0,
  zapp_critics  integer not null default 0,
  confidence    text not null default 'low',
  -- MDBList non conosce il titolo: non riprovarlo a ogni giro
  mdblist_miss  boolean not null default false,
  fetched_at    timestamptz not null default now(),
  primary key (title_id, media_type),
  constraint title_ratings_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  constraint title_ratings_title_fkey
    foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete cascade
);

create index title_ratings_score_idx on public.title_ratings (zapp_score desc nulls last)
  where confidence = 'high';
create index title_ratings_fetched_idx on public.title_ratings (fetched_at);

create table public.title_charts (
  id             bigserial primary key,
  source         text not null,
  provider_id    integer not null,
  country        text not null default 'IT',
  media_type     public.media_type not null,
  period         date not null,
  rank           integer not null,
  title_id       bigint,
  raw_title      text not null,
  raw_season     text,
  weeks_in_chart integer,
  momentum       integer,
  resolve_tries  smallint not null default 0,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint title_charts_source_check
    check (source in ('netflix_tudum', 'justwatch', 'tmdb')),
  constraint title_charts_unique
    unique (source, provider_id, country, media_type, period, rank),
  constraint title_charts_title_fkey
    foreign key (title_id, media_type) references public.titles (id, media_type)
    on delete set null
);

create index title_charts_latest_idx
  on public.title_charts (source, provider_id, media_type, period desc, rank);
create index title_charts_title_idx on public.title_charts (title_id, media_type)
  where title_id is not null;
create index title_charts_unresolved_idx on public.title_charts (period desc)
  where title_id is null and resolve_tries < 5;

-- Registro delle esecuzioni: senza, un job che smette di girare non se ne accorge nessuno.
create table public.job_runs (
  id         bigserial primary key,
  job        text not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  ok         boolean,
  detail     jsonb
);
create index job_runs_job_idx on public.job_runs (job, started_at desc);

alter table public.title_ratings enable row level security;
alter table public.title_charts  enable row level security;
alter table public.job_runs      enable row level security;

-- Stessa regola di `titles`: lettura per tutti, scrittura solo col service client.
create policy "title_ratings_select_all" on public.title_ratings for select using (true);
create policy "title_charts_select_all"  on public.title_charts  for select using (true);
-- `job_runs` resta senza policy di select: è roba di servizio.
