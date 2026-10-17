import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { candidateInput } from "@/lib/ats";
import { CAND_SELECT, buildFilter } from "@/lib/queries";

// GET /api/candidates?q=&stage=&job_id=&skill=&min_rating=&source=&stale=1&interviews=1&sort=&page=&pageSize=
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { whereSql, orderSql, params } = buildFilter(sp);
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize")) || 25));
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const db = await getDb();
  const [{ total }] = await db.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM candidates c JOIN jobs j ON j.id = c.job_id ${whereSql}`,
    params,
  );
  const rows = await db.query(
    `${CAND_SELECT} ${whereSql} ${orderSql} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  return NextResponse.json({ candidates: rows, total, page, pageSize });
}

export async function POST(req: Request) {
  const parsed = candidateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const c = parsed.data;
  const db = await getDb();
  const [job] = await db.query<{ status: string }>("SELECT status FROM jobs WHERE id = $1", [c.job_id]);
  if (!job) return NextResponse.json({ error: "Validation failed", fields: { job_id: ["Job not found"] } }, { status: 400 });
  if (job.status === "Closed") return NextResponse.json({ error: "Validation failed", fields: { job_id: ["This job is closed"] } }, { status: 400 });
  const dup = await db.query("SELECT 1 FROM candidates WHERE email = $1", [c.email]);
  if (dup.length) {
    return NextResponse.json({ error: "Validation failed", fields: { email: ["A candidate with this email already exists"] } }, { status: 409 });
  }
  const [created] = await db.query<{ id: number }>(
    `INSERT INTO candidates (name,email,phone,job_id,skills,experience_years,source,rating,interview_at,interview_type,stage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [c.name, c.email, c.phone, c.job_id, c.skills, c.experience_years, c.source, c.rating, c.interview_at, c.interview_type, c.stage],
  );
  await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage) VALUES ($1,NULL,$2)", [created.id, c.stage]);
  const [row] = await db.query(`${CAND_SELECT} WHERE c.id = $1`, [created.id]);
  return NextResponse.json({ candidate: row }, { status: 201 });
}
