// Computes the estimated 1-5 difficulty score for every trail, from:
//   surface baseline: asphalt 1, gravel 2, dirt/ground 3, sand/rock 4
//   tracktype:  grade1 -1, grade2 -0.5, grade3 0, grade4 +1, grade5 +1.5
//   smoothness: bad +1, very_bad +1.5, horrible/very_horrible +2
// Clamped to 1..5, rounded to the nearest half.
//
// Trails with none of these signals stay NULL and show as "Not rated".
// The average-grade (steepness) term is added in Phase 4 once elevation
// sampling exists; difficulty_inputs records what fed each score so the
// formula can be re-tuned without re-ingesting.
//
//   npm run compute:difficulty

import { pool } from "./lib/db.mjs";

const result = await pool.query(`
  with scored as (
    select id,
      case
        when surface in ('asphalt','paved','concrete') then 1
        when surface in ('gravel','compacted','fine_gravel','pebblestone') then 2
        when surface in ('dirt','ground','earth','unpaved','grass','wood') then 3
        when surface in ('sand','rock','stone') then 4
        else null
      end as surface_base,
      case tracktype
        when 'grade1' then -1.0
        when 'grade2' then -0.5
        when 'grade3' then 0.0
        when 'grade4' then 1.0
        when 'grade5' then 1.5
        else null
      end as tracktype_adj,
      case smoothness
        when 'bad' then 1.0
        when 'very_bad' then 1.5
        when 'horrible' then 2.0
        when 'very_horrible' then 2.0
        else null
      end as smoothness_adj
    from trails
  )
  update trails t
  set difficulty = round(least(5, greatest(1,
        coalesce(s.surface_base,
                 -- no surface tag: infer a baseline from tracktype alone
                 case when s.tracktype_adj is not null then 2.5 else null end)
        + coalesce(s.tracktype_adj, 0)
        + coalesce(s.smoothness_adj, 0)
      )) * 2) / 2,
      difficulty_inputs = jsonb_build_object(
        'surface_base', s.surface_base,
        'tracktype_adj', s.tracktype_adj,
        'smoothness_adj', s.smoothness_adj,
        'grade_adj', null
      )
  from scored s
  where t.id = s.id
    and (s.surface_base is not null or s.tracktype_adj is not null)
`);

console.log(`Scored ${result.rowCount} trails.`);
const { rows } = await pool.query(`
  select difficulty, count(*) from trails
  where difficulty is not null group by 1 order by 1
`);
console.table(rows);
const unrated = await pool.query(
  `select count(*) n from trails where difficulty is null and not hidden`
);
console.log(`Not rated (no surface/tracktype signal): ${unrated.rows[0].n}`);
await pool.end();
