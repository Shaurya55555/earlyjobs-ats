import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const { id, noteId } = await params;
  const db = await getDb();
  const gone = await db.query("DELETE FROM candidate_notes WHERE id = $1 AND candidate_id = $2 RETURNING id", [Number(noteId), Number(id)]);
  if (!gone.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
