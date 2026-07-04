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

-- ---------------------------------------------------------------------------
-- trails_in_bbox: everything the map needs for the current viewport, as one
-- GeoJSON FeatureCollection. Called by the Next.js /api/trails route.
--  * low zoom shows only MVUM routes (drawing all 110k OSM ways would melt
--    the browser); more detail appears as you zoom in
--  * geometries are simplified harder at low zoom
-- ---------------------------------------------------------------------------
create or replace function trails_in_bbox(
  min_lon double precision,
  min_lat double precision,
  max_lon double precision,
  max_lat double precision,
  zoom integer
) returns jsonb
language sql stable parallel safe
as $$
  with candidates as (
    select id, name, source, highway, surface, tracktype, difficulty,
           length_mi, permit_required, seasonal,
           case
             when zoom < 9  then st_simplify(geom, 0.001)
             when zoom < 12 then st_simplify(geom, 0.0002)
             else geom
           end as g
    from trails
    where not hidden
      and geom && st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)
      and (
        zoom >= 11
        or (zoom >= 9 and (source = 'mvum' or highway = 'track'))
        or source = 'mvum'
      )
    order by (source = 'mvum') desc, length_mi desc nulls last
    limit 6000
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', st_asgeojson(g, 5)::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'name', name,
          'source', source,
          'highway', highway,
          'surface', surface,
          'tracktype', tracktype,
          'difficulty', difficulty,
          'length_mi', round(length_mi::numeric, 1),
          'permit_required', permit_required,
          'seasonal', seasonal
        )
      )), '[]'::jsonb)
  )
  from candidates
  where g is not null and not st_isempty(g);
$$;

-- ---------------------------------------------------------------------------
-- trail_detail: everything the detail panel needs for one trail,
-- geometry included (full resolution) so the elevation profile is accurate
-- ---------------------------------------------------------------------------
create or replace function trail_detail(trail_id uuid)
returns jsonb
language sql stable parallel safe
as $$
  select jsonb_build_object(
    'id', id,
    'name', name,
    'source', source,
    'route_id', route_id,
    'highway', highway,
    'surface', surface,
    'tracktype', tracktype,
    'smoothness', smoothness,
    'access', access,
    'fourwd_only', fourwd_only,
    'vehicle_classes', vehicle_classes,
    'seasonal', seasonal,
    'season_dates', season_dates,
    'permit_required', permit_required,
    'length_mi', round(length_mi::numeric, 1),
    'difficulty', difficulty,
    'difficulty_inputs', difficulty_inputs,
    'geometry', st_asgeojson(st_linemerge(geom), 6)::jsonb,
    'start_point', jsonb_build_array(st_x(st_startpoint(st_geometryn(geom, 1))),
                                     st_y(st_startpoint(st_geometryn(geom, 1)))),
    'end_point', jsonb_build_array(st_x(st_endpoint(st_geometryn(geom, st_numgeometries(geom)))),
                                   st_y(st_endpoint(st_geometryn(geom, st_numgeometries(geom)))))
  )
  from trails where id = trail_id;
$$;

-- ---------------------------------------------------------------------------
-- scenic_detail + scenic_roads_geojson: the curated paved drives layer
-- ---------------------------------------------------------------------------
create or replace function scenic_detail(road_id uuid)
returns jsonb
language sql stable parallel safe
as $$
  select jsonb_build_object(
    'id', id, 'name', name, 'nickname', nickname, 'description', description,
    'length_mi', round(length_mi::numeric, 1), 'curve_count', curve_count,
    'surface', surface, 'road_type', road_type,
    'geometry', st_asgeojson(geom, 6)::jsonb,
    'start_point', jsonb_build_array(st_x(st_startpoint(st_geometryn(geom, 1))),
                                     st_y(st_startpoint(st_geometryn(geom, 1)))),
    'end_point', jsonb_build_array(st_x(st_endpoint(st_geometryn(geom, st_numgeometries(geom)))),
                                   st_y(st_endpoint(st_geometryn(geom, st_numgeometries(geom)))))
  )
  from scenic_roads where id = road_id;
$$;

create or replace function scenic_roads_geojson()
returns jsonb
language sql stable parallel safe
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', st_asgeojson(st_simplify(geom, 0.0001), 5)::jsonb,
        'properties', jsonb_build_object(
          'id', id, 'name', name, 'nickname', nickname,
          'length_mi', round(length_mi::numeric, 1),
          'curve_count', curve_count, 'road_type', road_type,
          'surface', surface
        )
      )), '[]'::jsonb)
  )
  from scenic_roads where geom is not null;
$$;

-- ---------------------------------------------------------------------------
-- search_trails: name search across trails and scenic roads (trigram-ranked)
-- ---------------------------------------------------------------------------
create or replace function search_trails(q text, max_results integer default 20)
returns jsonb
language sql stable parallel safe
as $$
  select coalesce(jsonb_agg(row order by rank desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
        'kind', 'trail', 'id', id, 'name', name, 'surface', surface,
        'difficulty', difficulty, 'length_mi', round(length_mi::numeric, 1),
        'center', jsonb_build_array(st_x(st_centroid(geom)), st_y(st_centroid(geom))),
        'bbox', jsonb_build_array(st_xmin(geom), st_ymin(geom), st_xmax(geom), st_ymax(geom))
      ) as row,
      similarity(name, q) + (case when source = 'mvum' then 0.2 else 0 end) as rank
    from trails
    where not hidden and name ilike '%' || q || '%'
    union all
    select jsonb_build_object(
        'kind', 'scenic', 'id', id, 'name', name, 'nickname', nickname,
        'length_mi', round(length_mi::numeric, 1), 'curve_count', curve_count,
        'center', jsonb_build_array(st_x(st_centroid(geom)), st_y(st_centroid(geom))),
        'bbox', jsonb_build_array(st_xmin(geom), st_ymin(geom), st_xmax(geom), st_ymax(geom))
      ) as row,
      similarity(coalesce(name,'') || ' ' || coalesce(nickname,''), q) + 0.5 as rank
    from scenic_roads
    where geom is not null
      and (name ilike '%' || q || '%' or nickname ilike '%' || q || '%')
    limit 200
  ) hits
  limit max_results;
$$;
