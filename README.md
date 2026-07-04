# TrailMap

An offroad trail and scenic-drive map for North Carolina and the southern
Appalachians (western NC, east TN, upstate SC, north GA). Inspired by onX
Offroad: MVUM-legal routes, surface types, estimated difficulty, and 3D
terrain.

## Running it locally

1. Install dependencies (first time only):

   ```
   npm install
   ```

2. Copy `.env.example` to `.env.local` and paste in your free MapTiler key
   (from https://cloud.maptiler.com → API Keys).

3. Start the dev server:

   ```
   npm run dev
   ```

   Then open http://localhost:3000 in your browser.

## Tech stack

- Next.js (App Router) on Vercel
- MapLibre GL JS with MapTiler tiles (topo / satellite / hybrid + 3D terrain)
- Supabase (Postgres + PostGIS) for trail data — coming in Phase 2
- Tailwind CSS

## Data sources & attribution

- Base maps © [MapTiler](https://www.maptiler.com/copyright/)
  © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Trail data (Phase 2+): US Forest Service MVUM (public domain) and
  OpenStreetMap (ODbL)

Trail data may be outdated. Users are responsible for verifying legal
access and current conditions before driving any route.
