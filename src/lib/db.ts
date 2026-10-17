import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

export type Row = Record<string, unknown>;
export type Db = { query: <T = Row>(sql: string, params?: unknown[]) => Promise<T[]> };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL DEFAULT 'Engineering',
  location TEXT NOT NULL DEFAULT 'Bengaluru',
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  job_id INT NOT NULL REFERENCES jobs(id),
  skills TEXT[] NOT NULL DEFAULT '{}',
  experience_years NUMERIC(3,1) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'Direct',
  rating INT NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  interview_at TIMESTAMPTZ,
  interview_type TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'Applied',
  stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stage_history (
  id SERIAL PRIMARY KEY,
  candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_notes (
  id SERIAL PRIMARY KEY,
  candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_candidates_stage ON candidates(stage);
CREATE INDEX IF NOT EXISTS idx_candidates_job ON candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_history_candidate ON stage_history(candidate_id);
`;

const JOBS: [string, string, string][] = [
  ["Frontend Engineer", "Engineering", "Bengaluru"],
  ["Backend Engineer", "Engineering", "Bengaluru"],
  ["Full Stack Developer", "Engineering", "Remote"],
  ["Data Analyst", "Analytics", "Bengaluru"],
  ["Product Designer", "Design", "Remote"],
];

// name, email, job index, skills, exp, source, rating, final stage, days ago applied, notes
const SEED: [string, string, number, string[], number, string, number, string, number, string[]][] = [
  ["Aarav Mehta", "aarav.mehta@example.com", 0, ["React", "TypeScript", "Tailwind"], 2, "LinkedIn", 4, "Interview", 12, ["Strong portfolio. Walked through a design system he built.", "Phone screen went well, good system design instincts."]],
  ["Diya Nair", "diya.nair@example.com", 1, ["Node.js", "PostgreSQL", "Docker"], 3, "Referral", 5, "Offer", 20, ["Referred by a current engineer.", "Aced the SQL round. Offer drafted."]],
  ["Kabir Singh", "kabir.singh@example.com", 2, ["Next.js", "Node.js", "MongoDB"], 1, "Job Board", 3, "Screening", 3, ["Shipped two side projects, needs a deeper backend check."]],
  ["Meera Iyer", "meera.iyer@example.com", 3, ["Python", "SQL", "Tableau"], 4, "LinkedIn", 4, "Screening", 9, ["Available after 30 day notice."]],
  ["Rohan Gupta", "rohan.gupta@example.com", 2, ["React", "Express.js", "PostgreSQL"], 0.5, "Campus", 5, "Hired", 28, ["Final year, internship experience.", "Accepted the offer, joins next month."]],
  ["Sneha Kapoor", "sneha.kapoor@example.com", 4, ["Figma", "Prototyping"], 3, "Direct", 0, "Applied", 1, []],
  ["Vikram Rao", "vikram.rao@example.com", 1, ["Java", "Spring", "Kafka"], 5, "Referral", 2, "Rejected", 16, ["Strong Java, but the role is Node.js first.", "Asked for a remote option we cannot offer."]],
  ["Ananya Das", "ananya.das@example.com", 0, ["React", "Next.js", "Jest"], 1.5, "Job Board", 3, "Interview", 10, ["Good testing habits."]],
  ["Ishaan Verma", "ishaan.verma@example.com", 0, ["Vue", "JavaScript", "CSS"], 2, "LinkedIn", 2, "Applied", 9, []],
  ["Tara Menon", "tara.menon@example.com", 1, ["Go", "PostgreSQL", "Redis"], 4, "Referral", 4, "Interview", 6, ["Great systems background."]],
  ["Neil Joshi", "neil.joshi@example.com", 2, ["React", "Node.js", "AWS"], 2.5, "Direct", 4, "Screening", 8, []],
  ["Priya Shah", "priya.shah@example.com", 3, ["SQL", "Power BI", "Excel"], 2, "Job Board", 3, "Applied", 2, []],
];
const PATH = ["Applied", "Screening", "Interview", "Offer", "Hired"];

let ready: Promise<Db> | null = null;

async function init(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: { rejectUnauthorized: false } });
    db = { query: async <T,>(sql: string, params?: unknown[]) => (await pool.query(sql, params as unknown[])).rows as T[] };
  } else {
    // Zero-setup embedded Postgres (WASM): persisted to disk in dev, in-memory otherwise.
    const lite = new PGlite(process.env.NODE_ENV === "development" ? "./.data/pglite" : undefined);
    db = { query: async <T,>(sql: string, params?: unknown[]) => (await lite.query(sql, params as unknown[])).rows as T[] };
  }
  for (const stmt of SCHEMA.split(";").filter((s) => s.trim())) await db.query(stmt);
  const [{ n }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM jobs");
  if (n === 0) await seed(db);
  return db;
}

async function seed(db: Db) {
  const jobIds: number[] = [];
  for (const [t, d, l] of JOBS) {
    const [r] = await db.query<{ id: number }>("INSERT INTO jobs (title,department,location) VALUES ($1,$2,$3) RETURNING id", [t, d, l]);
    jobIds.push(r.id);
  }
  for (let i = 0; i < SEED.length; i++) {
    const [name, email, ji, skills, exp, source, rating, target, days, notes] = SEED[i];
    const steps = target === "Rejected" ? ["Screening", "Rejected"] : PATH.slice(1, PATH.indexOf(target) + 1);
    // Stage changes are spread over the time since application so "time in stage" looks realistic.
    const lastChangeDaysAgo = steps.length ? Math.max(0, Math.round(days / (steps.length + 1))) : days;
    const interview = target === "Interview" ? `now() + interval '${(i % 4) + 1} days'` : "NULL";
    const [c] = await db.query<{ id: number }>(
      `INSERT INTO candidates (name,email,phone,job_id,skills,experience_years,source,rating,interview_at,interview_type,stage,stage_changed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${interview},$9,$10, now() - ($11 || ' days')::interval, now() - ($12 || ' days')::interval, now()) RETURNING id`,
      [name, email, `+91 90000 000${String(i).padStart(2, "0")}`, jobIds[ji], skills, exp, source, rating, target === "Interview" ? "Technical" : "", target, String(lastChangeDaysAgo), String(days)],
    );
    await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage,changed_at) VALUES ($1,NULL,'Applied', now() - ($2 || ' days')::interval)", [c.id, String(days)]);
    let prev = "Applied";
    for (let s = 0; s < steps.length; s++) {
      const ago = Math.round(days - ((s + 1) * (days - lastChangeDaysAgo)) / steps.length);
      await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage,changed_at) VALUES ($1,$2,$3, now() - ($4 || ' days')::interval)", [c.id, prev, steps[s], String(ago)]);
      prev = steps[s];
    }
    for (let k = 0; k < notes.length; k++) {
      await db.query("INSERT INTO candidate_notes (candidate_id,body,created_at) VALUES ($1,$2, now() - ($3 || ' days')::interval)", [c.id, notes[k], String(Math.max(0, days - k * 2 - 1))]);
    }
  }
}

export function getDb(): Promise<Db> {
  const g = globalThis as unknown as { __atsDb?: Promise<Db> };
  return (g.__atsDb ??= ready ??= init());
}
