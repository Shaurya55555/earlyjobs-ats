import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { STAGES } from "@/lib/ats";

export async function GET() {
  const db = await getDb();
  const [totals] = (await db.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_this_week,
           COALESCE(AVG(experience_years),0)::float AS avg_experience
    FROM candidates`)) as { total: number; new_this_week: number; avg_experience: number }[];
  const byStageRows = (await db.query("SELECT stage, COUNT(*)::int AS n FROM candidates GROUP BY stage")) as { stage: string; n: number }[];
  const bySourceRows = (await db.query("SELECT source, COUNT(*)::int AS n FROM candidates GROUP BY source ORDER BY n DESC")) as { source: string; n: number }[];
  const byRoleRows = (await db.query("SELECT role, COUNT(*)::int AS n FROM candidates GROUP BY role ORDER BY n DESC")) as { role: string; n: number }[];
  // Funnel: how many candidates have ever reached each stage (from history), so moving forward never shrinks earlier bars.
  const reached = (await db.query("SELECT to_stage AS stage, COUNT(DISTINCT candidate_id)::int AS n FROM stage_history GROUP BY to_stage")) as { stage: string; n: number }[];
  const byStage = Object.fromEntries(STAGES.map((s) => [s, byStageRows.find((r) => r.stage === s)?.n ?? 0]));
  const funnel = STAGES.filter((s) => s !== "Rejected").map((s) => ({ stage: s, reached: reached.find((r) => r.stage === s)?.n ?? 0 }));
  const hired = byStage.Hired;
  const decided = hired + byStage.Rejected;
  return NextResponse.json({
    total: totals.total,
    newThisWeek: totals.new_this_week,
    avgExperience: Math.round(totals.avg_experience * 10) / 10,
    active: totals.total - hired - byStage.Rejected,
    hireRate: decided ? Math.round((hired / decided) * 100) : null,
    byStage,
    funnel,
    bySource: bySourceRows,
    byRole: byRoleRows,
  });
}
