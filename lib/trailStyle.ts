// Shared visual language for trails: surface colors, difficulty labels.
// Used by the map layers, the legend, and popups so they never disagree.

export const SURFACE_COLORS: Record<string, string> = {
  asphalt: "#6b7280", // dark gray
  gravel: "#f97316", // orange
  dirt: "#9a6b3f", // brown
  sand: "#e7c15f", // tan
  unknown: "#a855f7", // purple (drawn dashed)
};

// Map raw surface tag values onto our five buckets
export const SURFACE_BUCKET: Record<string, keyof typeof SURFACE_COLORS> = {
  asphalt: "asphalt",
  paved: "asphalt",
  concrete: "asphalt",
  gravel: "gravel",
  compacted: "gravel",
  fine_gravel: "gravel",
  pebblestone: "gravel",
  dirt: "dirt",
  ground: "dirt",
  earth: "dirt",
  unpaved: "dirt",
  grass: "dirt",
  sand: "sand",
};

// MapLibre expression: property "surface" -> line color
export const surfaceColorExpression = [
  "match",
  ["get", "surface"],
  ["asphalt", "paved", "concrete"], SURFACE_COLORS.asphalt,
  ["gravel", "compacted", "fine_gravel", "pebblestone"], SURFACE_COLORS.gravel,
  ["dirt", "ground", "earth", "unpaved", "grass"], SURFACE_COLORS.dirt,
  ["sand"], SURFACE_COLORS.sand,
  SURFACE_COLORS.unknown,
] as unknown as string;

// Surfaces with a known bucket (rendered solid); everything else is dashed
export const KNOWN_SURFACES = Object.keys(SURFACE_BUCKET);

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Easy — any vehicle",
  2: "Moderate — high clearance recommended",
  3: "Intermediate — 4WD / high clearance",
  4: "Difficult — 4WD low range, experienced",
  5: "Extreme — modified vehicles, lockers",
};

export function difficultyLabel(d: number): string {
  return DIFFICULTY_LABELS[Math.min(5, Math.max(1, Math.round(d)))];
}

export function difficultyColor(d: number): string {
  if (d < 1.75) return "#22c55e"; // green
  if (d < 2.75) return "#eab308"; // yellow
  if (d < 3.75) return "#f97316"; // orange
  if (d < 4.5) return "#ef4444"; // red
  return "#b91c1c"; // dark red
}
