import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const patch = z.object({ status: z.enum(["Open", "Closed"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const db = await getDb();
  const rows = await db.query("UPDATE jobs SET status = $1 WHERE id = $2 RETURNING id", [parsed.data.status, id]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// A job with candidates cannot be deleted (close it instead), so no one is orphaned.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await getDb();
  const [{ n }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM candidates WHERE job_id = $1", [id]);
  if (n > 0) return NextResponse.json({ error: `This job has ${n} candidate${n === 1 ? "" : "s"}. Close it instead of deleting.` }, { status: 409 });
  const rows = await db.query("DELETE FROM jobs WHERE id = $1 RETURNING id", [id]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
