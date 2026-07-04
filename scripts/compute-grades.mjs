// Adds the steepness term to trail difficulty:
//   average grade > 10% -> +0.5, > 15% -> +1.0
// Samples elevation along each rated trail from AWS Terrain Tiles, then
// recomputes difficulty from the stored difficulty_inputs. Idempotent.
//
//   npm run compute:grades

import { pool } from "./lib/db.mjs";
import { averageGradePct } from "../lib/elevation.mjs";

const { rows: trails } = await pool.query(`
  select id, st_asgeojson(st_simplify(geom, 0.0003))::json as geom,
         st_x(st_centroid(geom)) lon, st_y(st_centroid(geom)) lat,
         difficulty_inputs
  from trails
  where difficulty is not null
    and (difficulty_inputs->>'grade_adj') is null
  order by round(st_y(st_centroid(geom))::numeric, 1),
           round(st_x(st_centroid(geom))::numeric, 1)
`);
console.log(`Computing grades for ${trails.length} trails...`);

let done = 0;
let failed = 0;
const updates = [];

async function worker(queue) {
  for (;;) {
    const t = queue.shift();
    if (!t) return;
    try {
      const grade = await averageGradePct(t.geom, 12, 11);
      const adj = grade == null ? 0 : grade > 15 ? 1.0 : grade > 10 ? 0.5 : 0;
      updates.push({ id: t.id, grade, adj });
    } catch {
      failed++;
    }
    done++;
    if (done % 2000 === 0) console.log(`  ${done}/${trails.length} sampled`);
  }
}

const queue = [...trails];
await Promise.all(Array.from({ length: 8 }, () => worker(queue)));
console.log(`Sampled ${done} (${failed} failed). Writing updates...`);

const BATCH = 500;
let written = 0;
for (let i = 0; i < updates.length; i += BATCH) {
  const chunk = updates.slice(i, i + BATCH);
  const values = [];
  const params = [];
  for (const u of chunk) {
    const b = params.length;
    values.push(`($${b + 1}::uuid, $${b + 2}::real, $${b + 3}::real)`);
    params.push(u.id, u.grade, u.adj);
  }
  const res = await pool.query(
    `update trails t
     set difficulty_inputs = t.difficulty_inputs
           || jsonb_build_object('grade_adj', v.adj, 'avg_grade_pct', v.grade),
         difficulty = round(least(5, greatest(1,
             coalesce((t.difficulty_inputs->>'surface_base')::real,
                      case when t.difficulty_inputs->>'tracktype_adj' is not null
                           then 2.5 else null end)
             + coalesce((t.difficulty_inputs->>'tracktype_adj')::real, 0)
             + coalesce((t.difficulty_inputs->>'smoothness_adj')::real, 0)
             + v.adj
           )) * 2) / 2
     from (values ${values.join(",")}) as v(id, grade, adj)
     where t.id = v.id`,
    params
  );
  written += res.rowCount;
}
console.log(`Updated ${written} trails with grade data.`);

const { rows } = await pool.query(`
  select count(*) filter (where (difficulty_inputs->>'grade_adj')::real > 0) steep,
         round(avg((difficulty_inputs->>'avg_grade_pct')::numeric), 1) avg_grade
  from trails where difficulty_inputs ? 'avg_grade_pct'
`);
console.log(`Steep trails (grade bump applied): ${rows[0].steep}. Avg grade: ${rows[0].avg_grade}%`);
await pool.end();
