import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { STAGES, canMove, type Stage } from "@/lib/ats";

const bulkInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), ids: z.array(z.number().int()).min(1).max(500), stage: z.enum(STAGES) }),
  z.object({ action: z.literal("delete"), ids: z.array(z.number().int()).min(1).max(500) }),
]);

export async function POST(req: Request) {
  const parsed = bulkInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid bulk request" }, { status: 400 });
  const db = await getDb();
  const input = parsed.data;
  const rows = await db.query<{ id: number; stage: Stage }>("SELECT id, stage FROM candidates WHERE id = ANY($1::int[])", [input.ids]);

  if (input.action === "delete") {
    await db.query("DELETE FROM candidates WHERE id = ANY($1::int[])", [rows.map((r) => r.id)]);
    return NextResponse.json({ updated: rows.length, skipped: input.ids.length - rows.length });
  }
  let updated = 0;
  for (const r of rows) {
    if (!canMove(r.stage, input.stage)) continue; // skipped candidates are counted, not failed
    await db.query("UPDATE candidates SET stage = $1, stage_changed_at = now(), updated_at = now() WHERE id = $2", [input.stage, r.id]);
    await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage) VALUES ($1,$2,$3)", [r.id, r.stage, input.stage]);
    updated++;
  }
  return NextResponse.json({ updated, skipped: input.ids.length - updated });
}
