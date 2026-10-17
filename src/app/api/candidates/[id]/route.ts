import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { candidatePatch, canMove, type Stage } from "@/lib/ats";
import { CAND_SELECT } from "@/lib/queries";

type Ctx = { params: Promise<{ id: string }> };

async function load(idStr: string) {
  const id = Number(idStr);
  if (!Number.isInteger(id)) return null;
  const db = await getDb();
  const rows = await db.query<Record<string, unknown> & { id: number; stage: Stage; email: string }>(`${CAND_SELECT} WHERE c.id = $1`, [id]);
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
  const notes = await db.query("SELECT id,body,created_at FROM candidate_notes WHERE candidate_id = $1 ORDER BY created_at DESC, id DESC", [row.id]);
  return NextResponse.json({ candidate: row, history, notes });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const current = await load((await params).id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = candidatePatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const patch = parsed.data;
  const stageChanged = patch.stage !== undefined && patch.stage !== current.stage;
  if (stageChanged && !canMove(current.stage, patch.stage as Stage)) {
    return NextResponse.json({ error: `Cannot move a ${current.stage} candidate to ${patch.stage}` }, { status: 422 });
  }
  const db = await getDb();
  if (patch.email && patch.email !== current.email) {
    const dup = await db.query("SELECT 1 FROM candidates WHERE email = $1 AND id <> $2", [patch.email, current.id]);
    if (dup.length) {
      return NextResponse.json({ error: "Validation failed", fields: { email: ["A candidate with this email already exists"] } }, { status: 409 });
    }
  }
  if (patch.job_id !== undefined) {
    const [job] = await db.query("SELECT 1 FROM jobs WHERE id = $1", [patch.job_id]);
    if (!job) return NextResponse.json({ error: "Validation failed", fields: { job_id: ["Job not found"] } }, { status: 400 });
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    vals.push(v);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) return NextResponse.json({ candidate: current });
  if (stageChanged) sets.push("stage_changed_at = now()");
  vals.push(current.id);
  await db.query(`UPDATE candidates SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`, vals);
  if (stageChanged) {
    await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage) VALUES ($1,$2,$3)", [current.id, current.stage, patch.stage]);
  }
  return NextResponse.json({ candidate: await load(String(current.id)) });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const current = await load((await params).id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  await db.query("DELETE FROM candidates WHERE id = $1", [current.id]);
  return NextResponse.json({ ok: true });
}
