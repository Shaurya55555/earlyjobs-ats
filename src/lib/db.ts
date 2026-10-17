import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

type Row = Record<string, unknown>;
type Db = { query: (sql: string, params?: unknown[]) => Promise<Row[]> };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  experience_years NUMERIC(3,1) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'Direct',
  notes TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'Applied',
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
CREATE INDEX IF NOT EXISTS idx_candidates_stage ON candidates(stage);
`;

const SEED: [string, string, string, string[], number, string, string][] = [
  ["Aarav Mehta", "aarav.mehta@example.com", "Frontend Engineer", ["React", "TypeScript", "Tailwind"], 2, "LinkedIn", "Strong portfolio, good system design answers."],
  ["Diya Nair", "diya.nair@example.com", "Backend Engineer", ["Node.js", "PostgreSQL", "Docker"], 3, "Referral", "Referred by a current engineer."],
  ["Kabir Singh", "kabir.singh@example.com", "Full Stack Developer", ["Next.js", "Node.js", "MongoDB"], 1, "Job Board", ""],
  ["Meera Iyer", "meera.iyer@example.com", "Data Analyst", ["Python", "SQL", "Tableau"], 4, "LinkedIn", "Available after 30 day notice."],
  ["Rohan Gupta", "rohan.gupta@example.com", "Full Stack Developer", ["React", "Express.js", "PostgreSQL"], 0.5, "Campus", "Final year, internship experience."],
  ["Sneha Kapoor", "sneha.kapoor@example.com", "Product Designer", ["Figma", "Prototyping"], 3, "Direct", ""],
  ["Vikram Rao", "vikram.rao@example.com", "Backend Engineer", ["Java", "Spring", "Kafka"], 5, "Referral", "Asked for remote option."],
  ["Ananya Das", "ananya.das@example.com", "Frontend Engineer", ["React", "Next.js", "Jest"], 1.5, "Job Board", ""],
];
const SEED_STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Applied", "Rejected", "Interview"];

let ready: Promise<Db> | null = null;

async function init(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: { rejectUnauthorized: false } });
    db = { query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows };
  } else {
    // Local zero-setup Postgres (WASM). Persisted to disk in dev, in-memory elsewhere.
    const lite = new PGlite(process.env.NODE_ENV === "development" ? "./.data/pglite" : undefined);
    db = { query: async (sql, params) => (await lite.query(sql, params as unknown[])).rows as Row[] };
  }
  for (const stmt of SCHEMA.split(";").filter((s) => s.trim())) await db.query(stmt);
  const [{ n }] = (await db.query("SELECT COUNT(*)::int AS n FROM candidates")) as { n: number }[];
  if (n === 0) {
    for (let i = 0; i < SEED.length; i++) {
      const [name, email, role, skills, exp, source, notes] = SEED[i];
      const days = (SEED.length - i) * 2;
      const rows = (await db.query(
        `INSERT INTO candidates (name,email,phone,role,skills,experience_years,source,notes,stage,created_at,updated_at)
         VALUES ($1,$2,'+91 90000 0000'||$3,$4,$5,$6,$7,$8,$9, now() - ($10 || ' days')::interval, now()) RETURNING id`,
        [name, email, String(i), role, skills, exp, source, notes, SEED_STAGES[i], String(days)],
      )) as { id: number }[];
      await db.query(
        "INSERT INTO stage_history (candidate_id,from_stage,to_stage,changed_at) VALUES ($1,NULL,'Applied', now() - ($2 || ' days')::interval)",
        [rows[0].id, String(days)],
      );
      const path = ["Applied", "Screening", "Interview", "Offer", "Hired"];
      const target = SEED_STAGES[i];
      const steps = target === "Rejected" ? ["Screening", "Rejected"] : path.slice(1, path.indexOf(target) + 1);
      let prev = "Applied";
      for (const to of steps) {
        await db.query("INSERT INTO stage_history (candidate_id,from_stage,to_stage) VALUES ($1,$2,$3)", [rows[0].id, prev, to]);
        prev = to;
      }
    }
  }
  return db;
}

export function getDb(): Promise<Db> {
  const g = globalThis as unknown as { __atsDb?: Promise<Db> };
  return (g.__atsDb ??= ready ??= init());
}
