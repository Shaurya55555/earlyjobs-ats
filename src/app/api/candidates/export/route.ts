import { getDb } from "@/lib/db";
import { toCsv } from "@/lib/ats";
import { CAND_SELECT, buildFilter } from "@/lib/queries";

// Exports whatever the current filters match, so "filter then export" works.
export async function GET(req: Request) {
  const { whereSql, orderSql, params } = buildFilter(new URL(req.url).searchParams);
  const db = await getDb();
  const rows = await db.query<Record<string, string | number | string[] | null>>(`${CAND_SELECT} ${whereSql} ${orderSql}`, params);
  const csv = toCsv([
    ["name", "email", "phone", "role", "skills", "experience_years", "source", "rating", "stage", "interview_at", "applied_on"],
    ...rows.map((r) => [
      r.name as string, r.email as string, r.phone as string, r.role as string, (r.skills as string[]).join("; "),
      r.experience_years as number, r.source as string, r.rating as number, r.stage as string,
      r.interview_at ? new Date(r.interview_at as string).toISOString() : "", new Date(r.created_at as string).toISOString().slice(0, 10),
    ]),
  ]);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="candidates.csv"' },
  });
}
