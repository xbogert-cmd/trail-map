// Where an MVUM route and an OSM way trace the same physical road, copy the
// OSM surface/condition tags onto the MVUM record ("legal + surface" in one
// row) and hide the OSM duplicate so the map doesn't draw the line twice.
//
//   npm run merge:sources
//
// Match rule: an OSM way counts as the same road when at least 60% of its
// length lies within 30 m of the MVUM line. Safe to run repeatedly.

import { pool } from "./lib/db.mjs";

console.log("Matching OSM ways to MVUM routes (30 m buffer, 60% overlap)...");

// 1) Copy surface tags from the best-matching OSM way onto each MVUM route
const merged = await pool.query(`
  with matches as (
    select m.id as mvum_id, o.id as osm_row_id, o.osm_id,
           o.surface, o.tracktype, o.smoothness,
           row_number() over (
             partition by m.id
             order by st_length(st_intersection(
               o.geom, st_buffer(m.geom::geography, 30)::geometry)::geography) desc
           ) as rank
    from trails m
    join trails o
      on o.source = 'osm'
     and m.source = 'mvum'
     -- geometry-space prefilter (~33 m in degrees) so the GiST index is used
     and st_dwithin(m.geom, o.geom, 0.0003)
    where st_length(st_intersection(
            o.geom, st_buffer(m.geom::geography, 30)::geometry)::geography)
          > 0.6 * st_length(o.geom::geography)
  )
  update trails m
  set surface    = coalesce(m.surface, x.surface),
      tracktype  = coalesce(m.tracktype, x.tracktype),
      smoothness = coalesce(m.smoothness, x.smoothness),
      merged_from_osm = x.osm_id
  from matches x
  where m.id = x.mvum_id and x.rank = 1
`);
console.log(`Updated ${merged.rowCount} MVUM routes with OSM surface data.`);

// 2) Hide every OSM way that duplicates an MVUM route
const hidden = await pool.query(`
  update trails o
  set hidden = true
  from trails m
  where o.source = 'osm' and o.hidden = false
    and m.source = 'mvum'
    and st_dwithin(m.geom, o.geom, 0.0003)
    and st_length(st_intersection(
          o.geom, st_buffer(m.geom::geography, 30)::geometry)::geography)
        > 0.6 * st_length(o.geom::geography)
`);
console.log(`Hid ${hidden.rowCount} OSM ways that duplicate MVUM routes.`);

const { rows } = await pool.query(
  `select pg_size_pretty(pg_database_size(current_database())) as db_size`
);
console.log(`Database size: ${rows[0].db_size}.`);
await pool.end();
