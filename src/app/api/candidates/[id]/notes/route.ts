import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const noteInput = z.object({ body: z.string().trim().min(1, "Write something first").max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = noteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const db = await getDb();
  if (!Number.isInteger(id) || !(await db.query("SELECT 1 FROM candidates WHERE id = $1", [id])).length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [note] = await db.query("INSERT INTO candidate_notes (candidate_id, body) VALUES ($1,$2) RETURNING id, body, created_at", [id, parsed.data.body]);
  return NextResponse.json({ note }, { status: 201 });
}
