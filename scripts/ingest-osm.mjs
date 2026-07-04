// Ingests offroad-relevant OpenStreetMap ways via the Overpass API into the
// `trails` table, one 1°x1° bbox tile at a time, resumable. OSM data is
// cached in our own database — the website never queries Overpass live.
//
//   npm run ingest:osm                 -> western NC mountain tiles
//   npm run ingest:osm -- --tiles=rest -> everything else in the region
//   npm run ingest:osm -- --tiles=all  -> all tiles (skips completed ones)

import { pool } from "./lib/db.mjs";
import { selectTiles, fetchWithRetry, sleep } from "./lib/tiles.mjs";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "trailmap-ingest/1.0 (xbogert@icloud.com)";
const SIMPLIFY_TOLERANCE = 0.00005; // ~5.5 m, same as MVUM
// Be a polite Overpass citizen: one query at a time, pause between tiles
const PAUSE_BETWEEN_TILES_MS = 10_000;

function overpassQuery(tile) {
  const bbox = `${tile.south},${tile.west},${tile.north},${tile.east}`;
  return `[out:json][timeout:180][maxsize:536870912];
(
  way["highway"="track"](${bbox});
  way["highway"="path"]["motor_vehicle"="yes"](${bbox});
  way["highway"="unclassified"](${bbox});
  way["4wd_only"="yes"](${bbox});
);
out tags geom;`;
}

async function fetchTile(tile) {
  const res = await fetchWithRetry(
    OVERPASS,
    {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ data: overpassQuery(tile) }),
    },
    5
  );
  const body = await res.json();
  return (body.elements ?? []).filter(
    (e) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length >= 2
  );
}

async function insertWays(ways) {
  let inserted = 0;
  for (const way of ways) {
    const t = way.tags ?? {};
    const coords = way.geometry.map((pt) => [pt.lon, pt.lat]);
    const geojson = { type: "LineString", coordinates: coords };
    const res = await pool.query(
      `insert into trails
         (source, osm_id, name, highway, surface, tracktype, smoothness,
          access, fourwd_only, attrs, geom, length_mi)
       values
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          st_multi(st_simplifypreservetopology(
            st_setsrid(st_geomfromgeojson($11), 4326), $12)),
          st_length(st_setsrid(st_geomfromgeojson($11), 4326)::geography) / 1609.344)
       on conflict (osm_id) where osm_id is not null
       do nothing`,
      [
        "osm",
        way.id,
        t.name ?? null,
        t.highway ?? null,
        t.surface ?? null,
        t.tracktype ?? null,
        t.smoothness ?? null,
        t.access ?? null,
        t["4wd_only"] === "yes",
        JSON.stringify(t),
        JSON.stringify(geojson),
        SIMPLIFY_TOLERANCE,
      ]
    );
    inserted += res.rowCount;
  }
  return inserted;
}

const tiles = selectTiles(process.argv);
console.log(`OSM ingestion: ${tiles.length} tiles selected`);

const { rows: doneRows } = await pool.query(
  "select tile_key from ingest_progress where source = 'osm'"
);
const done = new Set(doneRows.map((r) => r.tile_key));

let grandTotal = 0;
try {
  for (const [i, tile] of tiles.entries()) {
    const label = `[${i + 1}/${tiles.length}] tile ${tile.key}`;
    if (done.has(tile.key)) {
      console.log(`${label}: already done, skipping`);
      continue;
    }
    const ways = await fetchTile(tile);
    const inserted = await insertWays(ways);
    await pool.query(
      `insert into ingest_progress (source, tile_key, feature_count)
       values ('osm', $1, $2)
       on conflict (source, tile_key)
       do update set feature_count = $2, completed_at = now()`,
      [tile.key, inserted]
    );
    grandTotal += inserted;
    console.log(`${label}: ${ways.length} ways fetched, ${inserted} inserted`);
    if (i < tiles.length - 1) await sleep(PAUSE_BETWEEN_TILES_MS);
  }

  // Cape Hatteras National Seashore ORV beach corridors need an NPS permit.
  // Flag: explicit OSM permit tags anywhere, plus sand routes on the
  // Outer Banks seashore strip.
  const flagged = await pool.query(
    `update trails
     set permit_required = true
     where permit_required = false
       and (attrs->>'motor_vehicle' = 'permit'
            or (surface = 'sand'
                and geom && st_makeenvelope(-76.1, 34.9, -75.4, 35.85, 4326)))`
  );
  console.log(`Flagged ${flagged.rowCount} routes as permit_required (Cape Hatteras ORV).`);

  const { rows } = await pool.query(
    `select count(*) as trails,
            pg_size_pretty(pg_database_size(current_database())) as db_size
     from trails where source = 'osm'`
  );
  console.log(`\nDone. Inserted ${grandTotal} new OSM ways this run.`);
  console.log(`Total OSM rows: ${rows[0].trails}. Database size: ${rows[0].db_size}.`);
} finally {
  await pool.end();
}
