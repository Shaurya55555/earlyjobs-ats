import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { STAGES, STALE_DAYS } from "@/lib/ats";

// GET /api/metrics?job_id=  (omit job_id for all jobs)
export async function GET(req: Request) {
  const jobParam = Number(new URL(req.url).searchParams.get("job_id"));
  const job = Number.isInteger(jobParam) && jobParam > 0 ? jobParam : null;
  const p = job ? [job] : [];
  const w = job ? "WHERE c.job_id = $1" : "";
  const and = job ? "AND c.job_id = $1" : "";
  const db = await getDb();

  const [totals] = await db.query<{ total: number; new_this_week: number; avg_experience: number; avg_rating: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.created_at > now() - interval '7 days')::int AS new_this_week,
            COALESCE(AVG(c.experience_years),0)::float AS avg_experience,
            COALESCE(AVG(NULLIF(c.rating,0)),0)::float AS avg_rating
     FROM candidates c ${w}`, p);
  const byStageRows = await db.query<{ stage: string; n: number }>(`SELECT c.stage, COUNT(*)::int AS n FROM candidates c ${w} GROUP BY c.stage`, p);
  const bySource = await db.query(`SELECT c.source, COUNT(*)::int AS n FROM candidates c ${w} GROUP BY c.source ORDER BY n DESC`, p);
  const byRole = await db.query(`SELECT j.title AS role, COUNT(*)::int AS n FROM candidates c JOIN jobs j ON j.id = c.job_id ${w} GROUP BY j.title ORDER BY n DESC`, p);

  // Funnel from history: who ever reached each stage, so moving forward never shrinks earlier bars.
  const reached = await db.query<{ stage: string; n: number }>(
    `SELECT h.to_stage AS stage, COUNT(DISTINCT h.candidate_id)::int AS n
     FROM stage_history h JOIN candidates c ON c.id = h.candidate_id ${w} GROUP BY h.to_stage`, p);

  // Applications per day for the last 14 days (zero-filled).
  const perDay = await db.query<{ d: string; n: number }>(
    `SELECT to_char(g.d, 'YYYY-MM-DD') AS d, COUNT(c.id)::int AS n
     FROM generate_series(current_date - 13, current_date, interval '1 day') AS g(d)
     LEFT JOIN candidates c ON c.created_at::date = g.d::date ${and}
     GROUP BY g.d ORDER BY g.d`, p);

  // Average days from application to hire, and average days spent in each finished stage.
  const [hire] = await db.query<{ days: number | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (h.changed_at - c.created_at)) / 86400)::float AS days
     FROM stage_history h JOIN candidates c ON c.id = h.candidate_id
     WHERE h.to_stage = 'Hired' ${and}`, p);
  const timeInStage = await db.query<{ stage: string; days: number }>(
    `SELECT h.to_stage AS stage,
            AVG(EXTRACT(EPOCH FROM (nxt.changed_at - h.changed_at)) / 86400)::float AS days
     FROM stage_history h
     JOIN candidates c ON c.id = h.candidate_id
     JOIN LATERAL (SELECT MIN(x.changed_at) AS changed_at FROM stage_history x
                   WHERE x.candidate_id = h.candidate_id AND (x.changed_at > h.changed_at OR (x.changed_at = h.changed_at AND x.id > h.id))) nxt ON nxt.changed_at IS NOT NULL
     WHERE h.to_stage IN ('Applied','Screening','Interview','Offer') ${and}
     GROUP BY h.to_stage`, p);

  const stuck = await db.query(
    `SELECT c.id, c.name, j.title AS role, c.stage,
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - c.stage_changed_at)) / 86400))::int AS days
     FROM candidates c JOIN jobs j ON j.id = c.job_id
     WHERE c.stage NOT IN ('Hired','Rejected') AND c.stage_changed_at < now() - interval '${STALE_DAYS} days' ${and}
     ORDER BY c.stage_changed_at ASC LIMIT 5`, p);
  const [{ n: stuckCount }] = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM candidates c
     WHERE c.stage NOT IN ('Hired','Rejected') AND c.stage_changed_at < now() - interval '${STALE_DAYS} days' ${and}`, p);
  const upcoming = await db.query(
    `SELECT c.id, c.name, j.title AS role, c.interview_at, c.interview_type
     FROM candidates c JOIN jobs j ON j.id = c.job_id
     WHERE c.interview_at IS NOT NULL AND c.interview_at >= now() ${and}
     ORDER BY c.interview_at ASC LIMIT 5`, p);

  const byStage = Object.fromEntries(STAGES.map((s) => [s, byStageRows.find((r) => r.stage === s)?.n ?? 0])) as Record<string, number>;
  const decided = byStage.Hired + byStage.Rejected;
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return NextResponse.json({
    total: totals.total,
    newThisWeek: totals.new_this_week,
    avgExperience: round1(totals.avg_experience),
    avgRating: round1(totals.avg_rating),
    active: totals.total - decided,
    hireRate: decided ? Math.round((byStage.Hired / decided) * 100) : null,
    avgDaysToHire: hire?.days == null ? null : round1(hire.days),
    byStage,
    funnel: STAGES.filter((s) => s !== "Rejected").map((s) => ({ stage: s, reached: reached.find((r) => r.stage === s)?.n ?? 0 })),
    timeInStage: ["Applied", "Screening", "Interview", "Offer"].map((s) => ({ stage: s, days: round1(timeInStage.find((r) => r.stage === s)?.days ?? 0) })),
    perDay,
    bySource,
    byRole,
    stuck,
    stuckCount,
    upcoming,
  });
}
