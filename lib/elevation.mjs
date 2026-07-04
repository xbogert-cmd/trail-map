// Elevation sampling from the AWS Open Data "Terrain Tiles" set (terrarium
// encoding, public domain USGS/SRTM elevation). No API key required.
// Used by /api/trail/[id] for elevation profiles and by
// scripts/compute-grades.mjs for the difficulty steepness term.

import { PNG } from "pngjs";

const TILE_URL = (z, x, y) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// Decoded-tile cache (Map preserves insertion order -> simple LRU)
const cache = new Map();
const MAX_TILES = 600;

async function getTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(TILE_URL(z, x, y));
  if (!res.ok) throw new Error(`terrain tile ${key}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const png = PNG.sync.read(buf);
  if (cache.size >= MAX_TILES) cache.delete(cache.keys().next().value);
  cache.set(key, png);
  return png;
}

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Elevation in meters at a single lon/lat. */
export async function elevationAt(lon, lat, z = 12) {
  const { x, y } = lonLatToTile(lon, lat, z);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const png = await getTile(z, tx, ty);
  const px = Math.min(255, Math.floor((x - tx) * 256));
  const py = Math.min(255, Math.floor((y - ty) * 256));
  const i = (py * 256 + px) * 4;
  const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
  // terrarium encoding
  return r * 256 + g + b / 256 - 32768;
}

const R_EARTH_MI = 3958.8;

/** Haversine distance in miles. */
export function distanceMi([lon1, lat1], [lon2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_MI * Math.asin(Math.sqrt(a));
}

/**
 * Coordinates of a (Multi)LineString's longest continuous part. Multi-part
 * route geometries (common in MVUM data) can have disconnected segments;
 * treating them as one line would count phantom climbs at the gaps.
 */
export function flattenCoords(geometry) {
  if (geometry.type === "LineString") return geometry.coordinates;
  let best = geometry.coordinates[0];
  let bestLen = -1;
  for (const part of geometry.coordinates) {
    let len = 0;
    for (let i = 1; i < part.length; i++) len += distanceMi(part[i - 1], part[i]);
    if (len > bestLen) {
      bestLen = len;
      best = part;
    }
  }
  return best;
}

/** Resample a coordinate list to at most `n` points, evenly by distance. */
export function resample(coords, n) {
  if (coords.length <= 2) return coords;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distanceMi(coords[i - 1], coords[i]));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [coords[0], coords[coords.length - 1]];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const span = cum[j + 1] - cum[j] || 1e-12;
    const t = (target - cum[j]) / span;
    out.push([
      coords[j][0] + (coords[j + 1][0] - coords[j][0]) * t,
      coords[j][1] + (coords[j + 1][1] - coords[j][1]) * t,
    ]);
  }
  return out;
}

const M_TO_FT = 3.28084;

/**
 * Elevation profile along a geometry.
 * Returns { points: [{mi, ft}], ascentFt, descentFt, minFt, maxFt, lengthMi }
 * Elevations are lightly smoothed (3-point average) to keep one-pixel noise
 * out of the ascent/descent totals.
 */
export async function elevationProfile(geometry, samples = 120, z = 12) {
  const line = resample(flattenCoords(geometry), samples);
  const raw = [];
  for (const [lon, lat] of line) raw.push(await elevationAt(lon, lat, z));
  const smooth = raw.map((v, i) => {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(raw.length - 1, i + 1)];
    return (a + v + b) / 3;
  });

  const points = [];
  let dist = 0;
  let ascent = 0;
  let descent = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) {
      dist += distanceMi(line[i - 1], line[i]);
      const d = smooth[i] - smooth[i - 1];
      if (d > 0) ascent += d;
      else descent -= d;
    }
    points.push({ mi: Math.round(dist * 100) / 100, ft: Math.round(smooth[i] * M_TO_FT) });
  }
  const fts = points.map((p) => p.ft);
  return {
    points,
    ascentFt: Math.round(ascent * M_TO_FT),
    descentFt: Math.round(descent * M_TO_FT),
    minFt: Math.min(...fts),
    maxFt: Math.max(...fts),
    lengthMi: Math.round(dist * 100) / 100,
  };
}

/**
 * Average grade (%) along a geometry: total |elevation change| / distance.
 * Coarser sampling + lower zoom than profiles — it feeds one difficulty term.
 */
export async function averageGradePct(geometry, samples = 12, z = 11) {
  const line = resample(flattenCoords(geometry), samples);
  const eles = [];
  for (const [lon, lat] of line) eles.push(await elevationAt(lon, lat, z));
  let climb = 0;
  let dist = 0;
  for (let i = 1; i < line.length; i++) {
    climb += Math.abs(eles[i] - eles[i - 1]);
    dist += distanceMi(line[i - 1], line[i]) * 1609.344; // meters
  }
  if (dist < 50) return null; // too short to measure meaningfully
  return Math.round((climb / dist) * 1000) / 10;
}
