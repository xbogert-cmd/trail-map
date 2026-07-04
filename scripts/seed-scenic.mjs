// Seeds the scenic_roads table with the region's famous paved drives.
// Geometry is pulled from OpenStreetMap by name/ref inside a per-road bbox,
// then merged into one line. Safe to re-run (clears + reseeds).
//
//   npm run seed:scenic

import { pool } from "./lib/db.mjs";
import { fetchWithRetry, sleep } from "./lib/tiles.mjs";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "trailmap-ingest/1.0 (xbogert@icloud.com)";

// selector: Overpass way filter; bbox: south,west,north,east
const ROADS = [
  {
    name: "Tail of the Dragon (US 129)",
    nickname: "The Dragon",
    curves: 318,
    description:
      "318 curves in 11 miles. The most famous driving road in America, crossing Deals Gap on the NC/TN line. Heavy sportbike and sports-car traffic on weekends — ride your own ride.",
    // Deals Gap to Tabcat Creek bridge — the actual 318-curve stretch
    selector: 'way["highway"]["ref"~"US 129"]',
    bbox: "35.455,-84.00,35.575,-83.905",
  },
  {
    name: "Cherohala Skyway",
    nickname: null,
    curves: null,
    description:
      "A 43-mile National Scenic Byway soaring over 5,400 ft between Tellico Plains, TN and Robbinsville, NC. High-elevation sweepers, huge views, zero gas stations.",
    selector: 'way["highway"]["name"~"Cherohala Skyway"]',
    bbox: "35.25,-84.35,35.46,-83.90",
  },
  {
    name: "Moonshiner 28 (NC 28)",
    nickname: "Moonshiner 28",
    curves: null,
    description:
      "The Dragon's quieter sibling: NC 28 from Deals Gap past Fontana Lake. Fast sweepers, lake views, and moonshine-running history.",
    selector: 'way["highway"]["ref"~"NC 28$"]',
    bbox: "35.32,-84.00,35.52,-83.55",
  },
  {
    name: "Blue Ridge Parkway (NC section)",
    nickname: "America's Favorite Drive",
    curves: null,
    description:
      "252 miles of ridge-top parkway through North Carolina, from the Virginia line to Cherokee. 45 mph, no trucks, endless overlooks. Sections close in winter.",
    selector: 'way["highway"]["name"="Blue Ridge Parkway"]',
    bbox: "35.03,-83.50,36.60,-80.85",
  },
  {
    name: "Diamondback (NC 226A)",
    nickname: "The Diamondback",
    curves: 190,
    description:
      "190 curves in 12 miles snaking up to Little Switzerland below the Blue Ridge Parkway. Tighter and less crowded than the Dragon.",
    selector: 'way["highway"]["ref"~"NC 226A"]',
    bbox: "35.78,-82.20,35.93,-82.05",
  },
  {
    name: "The Rattler (NC 209)",
    nickname: "The Rattler",
    curves: 290,
    description:
      "NC 209 from Lake Junaluska to Hot Springs: about 290 curves over 24 miles, from pastoral valley to tight mountain switchbacks.",
    selector: 'way["highway"]["ref"~"NC 209"]',
    bbox: "35.53,-83.00,35.90,-82.70",
  },
  {
    name: "Wolf Pen Gap (GA 60, Suches loop)",
    nickname: "Georgia's Tail of the Dragon",
    curves: null,
    description:
      "GA 60 through Suches — Georgia's twistiest pavement, climbing over Woody Gap through the Chattahoochee NF. Part of the famous Suches triangle with GA 180.",
    selector: 'way["highway"]["ref"~"(SR|GA) 60$"]',
    bbox: "34.60,-84.10,34.80,-83.93",
  },
  {
    name: "Russell-Brasstown Scenic Byway (GA 348)",
    nickname: null,
    curves: null,
    description:
      "A 40-mile loop over Hogpen Gap near Brasstown Bald, Georgia's highest peak. Smooth pavement, long climbs, waterfall stops.",
    selector: 'way["highway"]["ref"~"(SR|GA) 348"]',
    bbox: "34.66,-83.95,34.84,-83.68",
  },
  {
    name: "Oscar Wigington Scenic Byway (SC 107)",
    nickname: null,
    curves: null,
    description:
      "Upstate South Carolina's mountain byway past the Walhalla Fish Hatchery toward Whitewater Falls, in the cool woods of Sumter National Forest.",
    selector: 'way["highway"]["ref"~"SC 107"]',
    bbox: "34.93,-83.12,35.08,-82.98",
  },
];

async function fetchRoad(road) {
  const q = `[out:json][timeout:120];
(${road.selector}(${road.bbox}););
out tags geom;`;
  const res = await fetchWithRetry(OVERPASS, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ data: q }),
  });
  const body = await res.json();
  return (body.elements ?? []).filter(
    (e) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length >= 2
  );
}

await pool.query("delete from scenic_roads");
console.log("Seeding scenic roads...");

let seeded = 0;
for (const road of ROADS) {
  try {
    const ways = await fetchRoad(road);
    if (!ways.length) {
      console.warn(`  !! ${road.name}: no OSM ways matched — skipped`);
      continue;
    }
    const multi = {
      type: "MultiLineString",
      coordinates: ways.map((w) => w.geometry.map((pt) => [pt.lon, pt.lat])),
    };
    await pool.query(
      `insert into scenic_roads (name, nickname, description, curve_count, geom, length_mi)
       values ($1, $2, $3, $4,
         st_multi(st_linemerge(st_setsrid(st_geomfromgeojson($5), 4326))),
         st_length(st_setsrid(st_geomfromgeojson($5), 4326)::geography) / 1609.344)`,
      [road.name, road.nickname, road.description, road.curves, JSON.stringify(multi)]
    );
    const { rows } = await pool.query(
      "select round(length_mi::numeric,1) mi from scenic_roads where name = $1",
      [road.name]
    );
    console.log(`  ok ${road.name}: ${ways.length} ways, ${rows[0].mi} mi`);
    seeded++;
  } catch (err) {
    console.error(`  !! ${road.name}: ${err.message}`);
  }
  await sleep(5000); // Overpass etiquette
}

console.log(`\nSeeded ${seeded}/${ROADS.length} scenic roads.`);
await pool.end();
