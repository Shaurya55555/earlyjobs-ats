import { describe, expect, it } from "vitest";
import * as list from "../src/app/api/candidates/route";
import * as one from "../src/app/api/candidates/[id]/route";
import * as notes from "../src/app/api/candidates/[id]/notes/route";
import * as bulk from "../src/app/api/candidates/bulk/route";
import * as imp from "../src/app/api/candidates/import/route";
import * as exp from "../src/app/api/candidates/export/route";
import * as jobsApi from "../src/app/api/jobs/route";
import * as jobApi from "../src/app/api/jobs/[id]/route";
import * as metrics from "../src/app/api/metrics/route";

// Runs against the embedded Postgres (no DATABASE_URL), seeded on first use.
const U = "http://t";
const json = (body: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const get = async (res: Response) => ({ status: res.status, body: await res.json() });
const firstJobId = async () => (await get(await jobsApi.GET())).body.jobs[0].id as number;

describe("candidates API", () => {
  it("lists seeded candidates with pagination and total", async () => {
    const { body } = await get(await list.GET(new Request(`${U}/api/candidates?pageSize=5&page=2`)));
    expect(body.total).toBeGreaterThanOrEqual(12);
    expect(body.candidates).toHaveLength(5);
  });

  it("searches across name, skills and notes", async () => {
    const byName = await get(await list.GET(new Request(`${U}/api/candidates?q=diya`)));
    expect(byName.body.candidates.map((c: { name: string }) => c.name)).toContain("Diya Nair");
    const bySkill = await get(await list.GET(new Request(`${U}/api/candidates?q=kafka`)));
    expect(bySkill.body.total).toBeGreaterThanOrEqual(1);
    const byNote = await get(await list.GET(new Request(`${U}/api/candidates?q=offer%20drafted`)));
    expect(byNote.body.candidates[0].name).toBe("Diya Nair");
  });

  it("treats % in search as a literal character", async () => {
    const { body } = await get(await list.GET(new Request(`${U}/api/candidates?q=%25`)));
    expect(body.total).toBe(0);
  });

  it("filters by stage, rating and stale", async () => {
    const hired = await get(await list.GET(new Request(`${U}/api/candidates?stage=Hired`)));
    expect(hired.body.candidates.every((c: { stage: string }) => c.stage === "Hired")).toBe(true);
    const top = await get(await list.GET(new Request(`${U}/api/candidates?min_rating=5`)));
    expect(top.body.candidates.every((c: { rating: number }) => c.rating === 5)).toBe(true);
    const stale = await get(await list.GET(new Request(`${U}/api/candidates?stale=1`)));
    expect(stale.body.candidates.every((c: { stage: string }) => c.stage !== "Hired" && c.stage !== "Rejected")).toBe(true);
  });

  it("creates, validates and rejects duplicates", async () => {
    const job = await firstJobId();
    const bad = await get(await list.POST(new Request(U, json({ name: "", email: "nope", job_id: job }))));
    expect(bad.status).toBe(400);
    expect(bad.body.fields.email).toBeDefined();
    const ok = await get(await list.POST(new Request(U, json({ name: "Test Person", email: "Test.Person@Example.com", job_id: job, skills: ["React"], rating: 4 }))));
    expect(ok.status).toBe(201);
    expect(ok.body.candidate.email).toBe("test.person@example.com");
    const dup = await get(await list.POST(new Request(U, json({ name: "Again", email: "test.person@example.com", job_id: job }))));
    expect(dup.status).toBe(409);
  });

  it("enforces stage rules and records history", async () => {
    const job = await firstJobId();
    const created = (await get(await list.POST(new Request(U, json({ name: "Flow", email: "flow@example.com", job_id: job }))))).body.candidate;
    const move = await get(await one.PATCH(new Request(U, json({ stage: "Interview" }, "PATCH")), ctx(created.id)));
    expect(move.body.candidate.stage).toBe("Interview");
    await one.PATCH(new Request(U, json({ stage: "Hired" }, "PATCH")), ctx(created.id));
    const blocked = await get(await one.PATCH(new Request(U, json({ stage: "Applied" }, "PATCH")), ctx(created.id)));
    expect(blocked.status).toBe(422);
    const detail = await get(await one.GET(new Request(U), ctx(created.id)));
    expect(detail.body.history.map((h: { to_stage: string }) => h.to_stage)).toEqual(["Applied", "Interview", "Hired"]);
  });

  it("adds notes and counts them", async () => {
    const job = await firstJobId();
    const c = (await get(await list.POST(new Request(U, json({ name: "Noted", email: "noted@example.com", job_id: job }))))).body.candidate;
    expect((await get(await notes.POST(new Request(U, json({ body: "  " })), ctx(c.id)))).status).toBe(400);
    expect((await get(await notes.POST(new Request(U, json({ body: "Great call" })), ctx(c.id)))).status).toBe(201);
    const detail = await get(await one.GET(new Request(U), ctx(c.id)));
    expect(detail.body.notes).toHaveLength(1);
    expect(detail.body.candidate.note_count).toBe(1);
  });

  it("returns 404 for unknown candidates", async () => {
    expect((await get(await one.GET(new Request(U), ctx(999999)))).status).toBe(404);
    expect((await get(await one.GET(new Request(U), ctx("abc")))).status).toBe(404);
  });
});

describe("bulk, import and export", () => {
  it("bulk moves only candidates that can move and reports skipped", async () => {
    const job = await firstJobId();
    const a = (await get(await list.POST(new Request(U, json({ name: "B1", email: "b1@example.com", job_id: job }))))).body.candidate;
    const b = (await get(await list.POST(new Request(U, json({ name: "B2", email: "b2@example.com", job_id: job, stage: "Hired" }))))).body.candidate;
    const r = await get(await bulk.POST(new Request(U, json({ action: "move", ids: [a.id, b.id], stage: "Screening" }))));
    expect(r.body).toEqual({ updated: 1, skipped: 1 });
    expect((await get(await bulk.POST(new Request(U, json({ action: "nope", ids: [1] }))))).status).toBe(400);
  });

  it("imports good rows and reports bad ones", async () => {
    const rows = [
      { name: "Imp One", email: "imp1@example.com", role: "Frontend Engineer", skills: "React; CSS" },
      { name: "Imp Two", email: "imp1@example.com", role: "Frontend Engineer" },
      { name: "Imp Three", email: "imp3@example.com", role: "Astronaut" },
      { name: "", email: "bad", role: "Frontend Engineer" },
    ];
    const r = await get(await imp.POST(new Request(U, json({ rows }))));
    expect(r.body.created).toBe(1);
    expect(r.body.skipped.map((s: { row: number }) => s.row)).toEqual([3, 4, 5]);
  });

  it("exports filtered CSV and neutralises formulas", async () => {
    const job = await firstJobId();
    await list.POST(new Request(U, json({ name: "=HYPERLINK(1)", email: "evil@example.com", job_id: job })));
    const res = await exp.GET(new Request(`${U}/api/candidates/export?q=evil@example.com`));
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\r\n")[0]).toContain("name,email");
    expect(text).toContain("'=HYPERLINK(1)");
  });
});

describe("jobs and metrics", () => {
  it("creates jobs, blocks duplicate titles, and protects jobs that have candidates", async () => {
    const created = await get(await jobsApi.POST(new Request(U, json({ title: "QA Engineer" }))));
    expect(created.status).toBe(201);
    expect((await get(await jobsApi.POST(new Request(U, json({ title: "QA Engineer" }))))).status).toBe(409);
    const jobs = created.body.jobs as { id: number; title: string; candidates: number }[];
    const withPeople = jobs.find((j) => j.candidates > 0)!;
    expect((await get(await jobApi.DELETE(new Request(U), ctx(withPeople.id)))).status).toBe(409);
    const qa = jobs.find((j) => j.title === "QA Engineer")!;
    expect((await get(await jobApi.DELETE(new Request(U), ctx(qa.id)))).status).toBe(200);
  });

  it("refuses new candidates for a closed job", async () => {
    const created = await get(await jobsApi.POST(new Request(U, json({ title: "Closed Role" }))));
    const job = created.body.jobs.find((j: { title: string }) => j.title === "Closed Role");
    await jobApi.PATCH(new Request(U, json({ status: "Closed" }, "PATCH")), ctx(job.id));
    const r = await get(await list.POST(new Request(U, json({ name: "X", email: "x@example.com", job_id: job.id }))));
    expect(r.status).toBe(400);
  });

  it("computes consistent metrics", async () => {
    const { body: m } = await get(await metrics.GET(new Request(`${U}/api/metrics`)));
    const stageTotal = Object.values(m.byStage as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(stageTotal).toBe(m.total);
    expect(m.perDay).toHaveLength(14);
    expect(m.funnel[0].reached).toBeGreaterThanOrEqual(m.funnel[1].reached);
    expect(m.funnel[1].reached).toBeGreaterThanOrEqual(m.funnel[2].reached);
    const scoped = await get(await metrics.GET(new Request(`${U}/api/metrics?job_id=1`)));
    expect(scoped.body.total).toBeLessThan(m.total);
  });
});
