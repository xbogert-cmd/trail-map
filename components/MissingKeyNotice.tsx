// Friendly full-screen instructions shown when NEXT_PUBLIC_MAPTILER_KEY
// hasn't been set yet, so the app never shows a broken blank map.
export default function MissingKeyNotice() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-slate-950 p-6">
      <div className="max-w-lg rounded-2xl bg-slate-900 p-8 shadow-xl shadow-black/50">
        <h1 className="text-xl font-bold text-slate-100">
          Trail<span className="text-orange-500">Map</span> — one step left
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          The map needs a free MapTiler API key before it can load imagery.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>
            Create a free account at{" "}
            <a
              href="https://cloud.maptiler.com/auth/widget"
              className="text-orange-400 underline"
              target="_blank"
              rel="noreferrer"
            >
              cloud.maptiler.com
            </a>
          </li>
          <li>
            Go to <span className="font-semibold">API Keys</span> in the left
            sidebar and copy your default key
          </li>
          <li>
            Open the file <code className="rounded bg-slate-800 px-1.5 py-0.5 text-orange-300">.env.local</code>{" "}
            in the project folder and paste the key after{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-orange-300">NEXT_PUBLIC_MAPTILER_KEY=</code>
          </li>
          <li>Restart the dev server (stop it with Ctrl+C, run <code className="rounded bg-slate-800 px-1.5 py-0.5 text-orange-300">npm run dev</code> again)</li>
        </ol>
      </div>
    </div>
  );
}
