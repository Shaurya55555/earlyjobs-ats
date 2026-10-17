import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { candidateInput } from "@/lib/ats";

const MAX_ROWS = 500;

// POST { rows: [{ name, email, role, phone?, skills?, experience_years?, source?, stage? }] }
// Each row is validated on its own. Good rows are imported, bad rows are reported with a reason.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { rows?: Record<string, string>[] } | null;
  if (!body?.rows || !Array.isArray(body.rows)) return NextResponse.json({ error: "Expected { rows: [...] }" }, { status: 400 });
  if (body.rows.length > MAX_ROWS) return NextResponse.json({ error: `Import at most ${MAX_ROWS} rows at a time` }, { status: 400 });
  const db = await getDb();
  const jobs = await db.query<{ id: number; title: string; status: string }>("SELECT id,title,status FROM jobs");
  const byTitle = new Map(jobs.map((j) => [j.title.toLowerCase(), j]));
  const seen = new Set<string>();
  let created = 0;
  const skipped: { row: number; reason: string }[] = [];

  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i];
    const rowNo = i + 2; // +1 for header, +1 for 1-based
    const job = byTitle.get((r.role ?? "").trim().toLowerCase());
    if (!job) { skipped.push({ row: rowNo, reason: `Unknown role "${r.role ?? ""}"` }); continue; }
    if (job.status === "Closed") { skipped.push({ row: rowNo, reason: `Role "${job.title}" is closed` }); continue; }
    const parsed = candidateInput.safeParse({
      name: r.name, email: r.email, phone: r.phone ?? "", job_id: job.id,
      skills: (r.skills ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean),
      experience_years: r.experience_years || 0, source: r.source || "Other",
      rating: r.rating || 0, stage: r.stage || "Applied",
    });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      skipped.push({ row: rowNo, reason: Object.entries(f).map(([k, v]) => `${k}: ${v?.[0]}`).join(", ") });
      continue;
    }
    const c = parsed.data;
    if (seen.has(c.email)) { skipped.push({ row: rowNo, reason: "Duplicate email in file" }); continue; }
    seen.add(c.email);
    const inserted = await db.query<{ id: number }>(
      `INSERT INTO candidates (name,email,phone,job_id,skills,experience_years,source,rating,stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [c.name, c.email, c.phone, c.job_id, c.skills, c.experience_years, c.source, c.rating, c.stage],
    );
    if (!inserted.length) { skipped.push({ row: rowNo, reason: "Email already exists" }); continue; }
    await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage) VALUES ($1,NULL,$2)", [inserted[0].id, c.stage]);
    created++;
  }
  return NextResponse.json({ created, skipped });
}
