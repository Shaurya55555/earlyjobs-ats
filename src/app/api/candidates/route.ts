import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { candidateInput, STAGES } from "@/lib/ats";

const COLS = "id,name,email,phone,role,skills,experience_years::float AS experience_years,source,notes,stage,created_at,updated_at";

// GET /api/candidates?q=&stage=&role=&skill=&sort=newest|oldest|name|experience
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  const q = sp.get("q")?.trim();
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(`(name ILIKE $${i} OR email ILIKE $${i} OR role ILIKE $${i} OR notes ILIKE $${i} OR array_to_string(skills, ',') ILIKE $${i})`);
  }
  const stage = sp.get("stage");
  if (stage && (STAGES as readonly string[]).includes(stage)) {
    params.push(stage);
    where.push(`stage = $${params.length}`);
  }
  const role = sp.get("role");
  if (role) {
    params.push(role);
    where.push(`role = $${params.length}`);
  }
  const skill = sp.get("skill")?.trim();
  if (skill) {
    params.push(skill.toLowerCase());
    where.push(`EXISTS (SELECT 1 FROM unnest(skills) s WHERE lower(s) = $${params.length})`);
  }
  const order =
    { oldest: "created_at ASC", name: "name ASC", experience: "experience_years DESC" }[sp.get("sort") ?? ""] ??
    "created_at DESC";
  const db = await getDb();
  const rows = await db.query(
    `SELECT ${COLS} FROM candidates ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}, id DESC`,
    params,
  );
  return NextResponse.json({ candidates: rows });
}

export async function POST(req: Request) {
  const parsed = candidateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const c = parsed.data;
  const db = await getDb();
  const dup = await db.query("SELECT 1 FROM candidates WHERE email = $1", [c.email]);
  if (dup.length) {
    return NextResponse.json({ error: "Validation failed", fields: { email: ["A candidate with this email already exists"] } }, { status: 409 });
  }
  const [row] = await db.query(
    `INSERT INTO candidates (name,email,phone,role,skills,experience_years,source,notes,stage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLS}`,
    [c.name, c.email, c.phone, c.role, c.skills, c.experience_years, c.source, c.notes, c.stage],
  );
  await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage) VALUES ($1,NULL,$2)", [row.id, c.stage]);
  return NextResponse.json({ candidate: row }, { status: 201 });
}
