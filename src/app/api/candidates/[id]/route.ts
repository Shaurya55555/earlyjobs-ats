import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { candidatePatch, canMove, type Stage } from "@/lib/ats";

const COLS = "id,name,email,phone,role,skills,experience_years::float AS experience_years,source,notes,stage,created_at,updated_at";

type Ctx = { params: Promise<{ id: string }> };

async function load(idStr: string) {
  const id = Number(idStr);
  if (!Number.isInteger(id)) return null;
  const db = await getDb();
  const rows = await db.query(`SELECT ${COLS} FROM candidates WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function GET(_: Request, { params }: Ctx) {
  const row = await load((await params).id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  const history = await db.query(
    "SELECT from_stage,to_stage,changed_at FROM stage_history WHERE candidate_id = $1 ORDER BY changed_at, id",
    [row.id],
  );
  return NextResponse.json({ candidate: row, history });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const current = await load((await params).id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = candidatePatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const patch = parsed.data;
  if (patch.stage && patch.stage !== current.stage && !canMove(current.stage as Stage, patch.stage)) {
    return NextResponse.json({ error: `Cannot move a ${current.stage} candidate to ${patch.stage}` }, { status: 422 });
  }
  const db = await getDb();
  if (patch.email && patch.email !== current.email) {
    const dup = await db.query("SELECT 1 FROM candidates WHERE email = $1 AND id <> $2", [patch.email, current.id]);
    if (dup.length) {
      return NextResponse.json({ error: "Validation failed", fields: { email: ["A candidate with this email already exists"] } }, { status: 409 });
    }
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    vals.push(v);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) return NextResponse.json({ candidate: current });
  vals.push(current.id);
  const [row] = await db.query(
    `UPDATE candidates SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING ${COLS}`,
    vals,
  );
  if (patch.stage && patch.stage !== current.stage) {
    await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage) VALUES ($1,$2,$3)", [
      current.id,
      current.stage,
      patch.stage,
    ]);
  }
  return NextResponse.json({ candidate: row });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const current = await load((await params).id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  await db.query("DELETE FROM candidates WHERE id = $1", [current.id]);
  return NextResponse.json({ ok: true });
}
