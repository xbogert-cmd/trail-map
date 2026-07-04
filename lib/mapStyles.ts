// The three base map styles, all served by MapTiler.
// Each style is a complete map "look" (colors, labels, contour lines, etc.)
// that MapLibre downloads and renders.

export type BaseLayerId = "topo" | "satellite" | "hybrid";

export interface BaseLayer {
  id: BaseLayerId;
  label: string;
  description: string;
  styleUrl: (key: string) => string;
}

export const BASE_LAYERS: BaseLayer[] = [
  {
    id: "topo",
    label: "Topo",
    description: "Contour lines & hillshading",
    styleUrl: (key) => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${key}`,
  },
  {
    id: "satellite",
    label: "Satellite",
    description: "Aerial imagery only",
    styleUrl: (key) => `https://api.maptiler.com/maps/satellite/style.json?key=${key}`,
  },
  {
    id: "hybrid",
    label: "Hybrid",
    description: "Satellite with labels & roads",
    styleUrl: (key) => `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`,
  },
];

// Terrain-RGB tiles encode elevation in pixel colors; MapLibre uses them
// to raise the map surface into real 3D.
export const terrainSourceUrl = (key: string) =>
  `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`;

export const TERRAIN_SOURCE_ID = "maptiler-terrain";
export const TERRAIN_EXAGGERATION = 1.3;

// Start over western North Carolina — Pisgah/Nantahala country,
// the densest trail area for this project.
export const INITIAL_VIEW = {
  center: [-82.55, 35.45] as [number, number],
  zoom: 8.5,
};
