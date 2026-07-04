// The full v1 coverage region: NC + adjacent east TN / upstate SC / north GA.
export const REGION = { west: -85.7, south: 33.7, east: -75.4, north: 36.7 };

// The Blue Ridge / national-forest core where trail data is densest.
// These tiles are ingested and verified first.
const WESTERN_NC = { west: -84.7, south: 34.7, east: -81.7, north: 36.7 };

const TILE_DEG = 1.0;

export function makeTiles() {
  const tiles = [];
  for (let lon = REGION.west; lon < REGION.east; lon += TILE_DEG) {
    for (let lat = REGION.south; lat < REGION.north; lat += TILE_DEG) {
      const west = round2(lon);
      const south = round2(lat);
      const east = round2(Math.min(lon + TILE_DEG, REGION.east));
      const north = round2(Math.min(lat + TILE_DEG, REGION.north));
      tiles.push({
        key: `${west}_${south}`,
        west,
        south,
        east,
        north,
        isWestern:
          west < WESTERN_NC.east &&
          east > WESTERN_NC.west &&
          south < WESTERN_NC.north &&
          north > WESTERN_NC.south,
      });
    }
  }
  // Western tiles first so the densest data lands (and can be verified) early
  tiles.sort((a, b) => Number(b.isWestern) - Number(a.isWestern));
  return tiles;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

// --tiles=west (default) | rest | all
export function selectTiles(argv) {
  const arg = (argv.find((a) => a.startsWith("--tiles=")) ?? "--tiles=west").slice(8);
  const all = makeTiles();
  if (arg === "all") return all;
  if (arg === "rest") return all.filter((t) => !t.isWestern);
  return all.filter((t) => t.isWestern);
}

export async function fetchWithRetry(url, options = {}, attempts = 5) {
  let delay = 3000;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // 429/5xx: back off and retry; anything else is a real error
      if (res.status === 429 || res.status >= 500) {
        console.warn(`  HTTP ${res.status}, retry ${i}/${attempts} in ${delay / 1000}s`);
      } else {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
    } catch (err) {
      if (i === attempts) throw err;
      console.warn(`  ${err.message ?? err}, retry ${i}/${attempts} in ${delay / 1000}s`);
    }
    await sleep(delay);
    delay *= 2;
  }
  throw new Error(`gave up after ${attempts} attempts: ${url.slice(0, 120)}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
