// Ingests US Forest Service MVUM (Motor Vehicle Use Map) roads and trails
// into the `trails` table, one 1°x1° bbox tile at a time, resumable.
//
//   npm run ingest:mvum                 -> western NC mountain tiles
//   npm run ingest:mvum -- --tiles=rest -> everything else in the region
//   npm run ingest:mvum -- --tiles=all  -> all tiles (skips completed ones)

import { pool } from "./lib/db.mjs";
import { selectTiles, fetchWithRetry, sleep } from "./lib/tiles.mjs";

const SERVICE = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer";
const LAYERS = [
  { id: 1, kind: "road" },
  { id: 2, kind: "trail" },
];
const PAGE_SIZE = 1000;
// ~5.5 m simplification tolerance keeps geometry light on the free tier
const SIMPLIFY_TOLERANCE = 0.00005;

// MVUM surfacetype -> our normalized surface values
function normalizeSurface(raw) {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s.includes("ASPHALT") || s.includes("PAVED") || s.startsWith("AC ") || s.startsWith("P -")) return "asphalt";
  if (s.includes("GRAVEL") || s.includes("AGGREGATE") || s.includes("CRUSH")) return "gravel";
  if (s.includes("SAND")) return "sand";
  if (s.includes("NATIVE") || s.includes("SOIL") || s.includes("DIRT") || s.includes("IMPROVED NATIVE")) return "dirt";
  return null; // unknown -> styled as "unknown" on the map
}

// A vehicle class is allowed when its MVUM field holds any open-season value
const open = (v) => v != null && String(v).trim() !== "" && !/^n\b/i.test(String(v));

function vehicleInfo(p) {
  return {
    classes: {
      highway_legal: open(p.passengervehicle) || open(p.highclearancevehicle),
      high_clearance: open(p.highclearancevehicle),
      lt50: open(p.atv) || open(p.other_ohv_lt50inches) || open(p.tracked_ohv_lt50inches),
      atv: open(p.atv),
      motorcycle: open(p.motorcycle),
    },
    dates: {
      highway_legal: p.passengervehicle_datesopen ?? null,
      high_clearance: p.highclearancevehicle_datesopen ?? null,
      atv: p.atv_datesopen ?? null,
      motorcycle: p.motorcycle_datesopen ?? null,
    },
  };
}

async function fetchLayerPage(layerId, tile, offset) {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${tile.west},${tile.south},${tile.east},${tile.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    outSR: "4326",
    returnGeometry: "true",
    orderByFields: "objectid",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    f: "geojson",
  });
  const res = await fetchWithRetry(`${SERVICE}/${layerId}/query?${params}`);
  const body = await res.json();
  if (body.error) throw new Error(`ArcGIS error: ${JSON.stringify(body.error)}`);
  return body.features ?? [];
}

async function insertFeatures(features, kind) {
  let inserted = 0;
  for (const f of features) {
    const p = f.properties ?? {};
    const geom = f.geometry;
    if (!geom || (geom.type !== "LineString" && geom.type !== "MultiLineString")) continue;
    const { classes, dates } = vehicleInfo(p);
    const res = await pool.query(
      `insert into trails
         (source, source_id, name, route_id, highway, surface,
          vehicle_classes, seasonal, season_dates, length_mi, attrs, geom)
       values
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          st_multi(st_simplifypreservetopology(
            st_setsrid(st_geomfromgeojson($12), 4326), $13)))
       on conflict (source, source_id) where source_id is not null
       do nothing`,
      [
        "mvum",
        p.globalid ?? `oid-${p.objectid}`,
        p.name || null,
        p.id || null,
        kind,
        normalizeSurface(p.surfacetype),
        JSON.stringify(classes),
        p.seasonal?.toLowerCase() || null,
        JSON.stringify(dates),
        p.gis_miles ?? p.seg_length ?? null,
        JSON.stringify(p),
        JSON.stringify(geom),
        SIMPLIFY_TOLERANCE,
      ]
    );
    inserted += res.rowCount;
  }
  return inserted;
}

const tiles = selectTiles(process.argv);
console.log(`MVUM ingestion: ${tiles.length} tiles selected`);

const { rows: doneRows } = await pool.query(
  "select tile_key from ingest_progress where source = 'mvum'"
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
    let tileCount = 0;
    for (const layer of LAYERS) {
      let offset = 0;
      for (;;) {
        const features = await fetchLayerPage(layer.id, tile, offset);
        tileCount += await insertFeatures(features, layer.kind);
        if (features.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    }
    await pool.query(
      `insert into ingest_progress (source, tile_key, feature_count)
       values ('mvum', $1, $2)
       on conflict (source, tile_key)
       do update set feature_count = $2, completed_at = now()`,
      [tile.key, tileCount]
    );
    grandTotal += tileCount;
    console.log(`${label}: ${tileCount} features`);
    await sleep(500);
  }

  const { rows } = await pool.query(
    `select count(*) as trails,
            pg_size_pretty(pg_database_size(current_database())) as db_size
     from trails where source = 'mvum'`
  );
  console.log(`\nDone. Inserted ${grandTotal} new MVUM features this run.`);
  console.log(`Total MVUM rows: ${rows[0].trails}. Database size: ${rows[0].db_size}.`);
} finally {
  await pool.end();
}
