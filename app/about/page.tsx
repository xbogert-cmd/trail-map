import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — TrailMap",
  description:
    "Data sources, attribution, and disclaimers for TrailMap, an offroad trail map of North Carolina and the southern Appalachians.",
};

export default function AboutPage() {
  return (
    // h-dvh + overflow-y-auto because the root layout clips <body> for the map
    <main className="h-dvh overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="text-sm text-orange-400 hover:text-orange-300">
          &larr; Back to the map
        </Link>

        <h1 className="mt-4 text-3xl font-bold">
          Trail<span className="text-orange-500">Map</span>
        </h1>
        <p className="mt-2 leading-relaxed text-slate-300">
          An offroad trail and scenic-drive map covering North Carolina and the
          adjacent mountains of eastern Tennessee, upstate South Carolina, and
          north Georgia — the national forests, the gravel, the sand, and the
          famous pavement in between.
        </p>

        <h2 className="mt-8 text-lg font-bold">Data sources</h2>
        <ul className="mt-3 space-y-4 text-sm leading-relaxed text-slate-300">
          <li>
            <strong className="text-slate-100">US Forest Service MVUM.</strong>{" "}
            Legal motorized routes come from the Forest Service&apos;s Motor
            Vehicle Use Map data (public domain), covering Pisgah, Nantahala,
            Uwharrie, Croatan, Cherokee, Sumter, and Chattahoochee-Oconee
            National Forests. The MVUM is the legal document — when in doubt,
            check the official PDF for the ranger district.
          </li>
          <li>
            <strong className="text-slate-100">OpenStreetMap.</strong> Trail
            surfaces, track grades, and additional routes are ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              className="text-orange-400 underline"
            >
              OpenStreetMap contributors
            </a>
            , available under the Open Database License (ODbL).
          </li>
          <li>
            <strong className="text-slate-100">MapTiler.</strong> Base maps and
            3D terrain ©{" "}
            <a href="https://www.maptiler.com/copyright/" className="text-orange-400 underline">
              MapTiler
            </a>{" "}
            © OpenStreetMap contributors.
          </li>
          <li>
            <strong className="text-slate-100">Elevation.</strong> Elevation
            profiles use the{" "}
            <a
              href="https://registry.opendata.aws/terrain-tiles/"
              className="text-orange-400 underline"
            >
              Terrain Tiles
            </a>{" "}
            open dataset on AWS (USGS 3DEP / SRTM, public domain).
          </li>
        </ul>

        <h2 className="mt-8 text-lg font-bold">Estimated difficulty</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          The 1&ndash;5 difficulty rating is <em>estimated automatically</em>{" "}
          from surface type, OSM track grade and smoothness tags, and average
          steepness sampled from elevation data. No one has field-checked these
          numbers. A washed-out &ldquo;2&rdquo; can be harder than a dry
          &ldquo;4&rdquo;.
        </p>

        <h2 className="mt-8 text-lg font-bold">Disclaimer</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Trail data may be outdated or wrong. Roads close seasonally, gates
          lock, storms change everything, and OpenStreetMap routes may cross
          private land. <strong className="text-slate-100">You are responsible for
          verifying legal access and current conditions before driving any
          route.</strong> Beach driving at Cape Hatteras National Seashore requires
          an NPS ORV permit. Tread Lightly and pack out what you pack in.
        </p>

        <p className="mt-8 text-xs text-slate-500">
          Built with Next.js, MapLibre GL, Supabase/PostGIS, and Tailwind CSS.
        </p>
      </div>
    </main>
  );
}
