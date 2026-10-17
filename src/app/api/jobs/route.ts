import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jobInput } from "@/lib/ats";

const JOBS_SQL = `
  SELECT j.id, j.title, j.department, j.location, j.status,
         COUNT(c.id)::int AS candidates
  FROM jobs j LEFT JOIN candidates c ON c.job_id = j.id
  GROUP BY j.id ORDER BY (j.status = 'Open') DESC, j.created_at DESC, j.id DESC`;

export async function GET() {
  const db = await getDb();
  return NextResponse.json({ jobs: await db.query(JOBS_SQL) });
}

export async function POST(req: Request) {
  const parsed = jobInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const db = await getDb();
  const j = parsed.data;
  const inserted = await db.query("INSERT INTO jobs (title,department,location) VALUES ($1,$2,$3) ON CONFLICT (title) DO NOTHING RETURNING id", [j.title, j.department, j.location]);
  if (!inserted.length) return NextResponse.json({ error: "Validation failed", fields: { title: ["A job with this title already exists"] } }, { status: 409 });
  return NextResponse.json({ jobs: await db.query(JOBS_SQL) }, { status: 201 });
}
