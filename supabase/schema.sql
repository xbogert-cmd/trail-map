-- TrailMap database schema
-- Run once against the Supabase Postgres database (npm run db:setup).

create extension if not exists postgis;
create extension if not exists pg_trgm; -- fast name search later

-- ---------------------------------------------------------------------------
-- trails: every offroad route from MVUM and OSM
-- ---------------------------------------------------------------------------
create table if not exists trails (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('mvum', 'osm')),
  source_id text,          -- MVUM globalid
  osm_id bigint,           -- OSM way id
  name text,
  route_id text,           -- MVUM route number, e.g. "479"
  highway text,            -- OSM highway tag (track/path/unclassified)

  -- surface & condition (normalized; raw values kept in attrs)
  surface text,            -- asphalt | gravel | dirt | sand | ground | ...
  tracktype text,          -- grade1..grade5
  smoothness text,
  access text,
  fourwd_only boolean default false,

  -- MVUM legality info
  vehicle_classes jsonb,   -- { "highway_legal": true, "lt50": false, ... }
  seasonal text,           -- "yearlong" | "seasonal"
  season_dates jsonb,      -- { "highway_legal": "03/15-01/01", ... }

  permit_required boolean not null default false,

  length_mi double precision,

  -- estimated difficulty (computed in Phase 4)
  difficulty numeric(2,1),      -- 1.0 .. 5.0, half steps
  difficulty_inputs jsonb,      -- raw formula inputs, for re-tuning

  attrs jsonb,             -- full raw attributes from the source
  merged_from_osm bigint,  -- OSM way id whose tags were merged in
  hidden boolean not null default false, -- OSM duplicates of MVUM routes

  geom geometry(MultiLineString, 4326) not null,
  created_at timestamptz not null default now()
);

create index if not exists trails_geom_idx on trails using gist (geom);
create index if not exists trails_source_idx on trails (source);
create index if not exists trails_name_trgm_idx on trails using gin (name gin_trgm_ops);
create unique index if not exists trails_source_uid
  on trails (source, source_id) where source_id is not null;
create unique index if not exists trails_osm_uid
  on trails (osm_id) where osm_id is not null;

-- ---------------------------------------------------------------------------
-- scenic_roads: hand-curated famous paved drives (seeded in Phase 5)
-- ---------------------------------------------------------------------------
create table if not exists scenic_roads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  description text,
  length_mi double precision,
  curve_count integer,
  surface text not null default 'asphalt',
  road_type text not null default 'scenic_paved',
  geom geometry(MultiLineString, 4326),
  created_at timestamptz not null default now()
);

create index if not exists scenic_roads_geom_idx on scenic_roads using gist (geom);

-- ---------------------------------------------------------------------------
-- ingest_progress: which bbox tiles each ingestion script has finished,
-- so a crashed run resumes instead of starting over
-- ---------------------------------------------------------------------------
create table if not exists ingest_progress (
  source text not null,
  tile_key text not null,
  status text not null default 'done',
  feature_count integer not null default 0,
  completed_at timestamptz not null default now(),
  primary key (source, tile_key)
);

-- ---------------------------------------------------------------------------
-- Row-level security: the public (anon key) may read trails, never write.
-- Ingestion connects directly to Postgres and bypasses RLS.
-- ---------------------------------------------------------------------------
alter table trails enable row level security;
alter table scenic_roads enable row level security;
alter table ingest_progress enable row level security;

drop policy if exists "public read trails" on trails;
create policy "public read trails" on trails for select using (true);

drop policy if exists "public read scenic_roads" on scenic_roads;
create policy "public read scenic_roads" on scenic_roads for select using (true);
-- ingest_progress: no policies -> not readable/writable via the public API
