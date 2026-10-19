import { z } from "zod";

export const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"] as const;
export type Stage = (typeof STAGES)[number];
export const SOURCES = ["Direct", "LinkedIn", "Referral", "Job Board", "Campus", "Other"] as const;
export const INTERVIEW_TYPES = ["", "Phone screen", "Technical", "System design", "HR", "Final"] as const;
export const STALE_DAYS = 7;

export type Candidate = {
  id: number;
  name: string;
  email: string;
  phone: string;
  job_id: number;
  role: string;
  skills: string[];
  experience_years: number;
  source: string;
  rating: number;
  interview_at: string | null;
  interview_type: string;
  stage: Stage;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
  note_count: number;
};

export type Job = { id: number; title: string; department: string; location: string; status: "Open" | "Closed"; candidates: number };

export const candidateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(30).default(""),
  job_id: z.coerce.number().int().positive("Pick a job"),
  skills: z.array(z.string().trim().min(1)).max(20).default([]),
  experience_years: z.coerce.number().min(0).max(60).default(0),
  source: z.string().trim().max(50).default("Direct"),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  interview_at: z.string().datetime({ offset: true }).nullable().default(null),
  interview_type: z.enum(INTERVIEW_TYPES).default(""),
  stage: z.enum(STAGES).default("Applied"),
});
// A patch only changes what it names. Zod keeps defaults through .partial(), which would
// reset omitted fields (skills, rating, phone...) to their defaults, so strip them first.
const shape = candidateInput.shape;
export const candidatePatch = z.object({
  ...shape,
  phone: shape.phone.removeDefault(),
  skills: shape.skills.removeDefault(),
  experience_years: shape.experience_years.removeDefault(),
  source: shape.source.removeDefault(),
  rating: shape.rating.removeDefault(),
  interview_at: shape.interview_at.removeDefault(),
  interview_type: shape.interview_type.removeDefault(),
  stage: shape.stage.removeDefault(),
}).partial();

export const jobInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  department: z.string().trim().min(1).max(60).default("Engineering"),
  location: z.string().trim().min(1).max(60).default("Bengaluru"),
});

/** Anything can move forward or to Rejected. Hired is final. A rejected candidate can only be reopened early in the funnel. */
export function canMove(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  if (from === "Hired") return false;
  if (from === "Rejected") return to === "Applied" || to === "Screening";
  return true;
}

export const isActive = (s: Stage) => s !== "Hired" && s !== "Rejected";

export const parseSkills = (s: string) => Array.from(new Set(s.split(",").map((x) => x.trim()).filter(Boolean)));

export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

// CSV helpers (RFC 4180 subset: quotes, escaped quotes, commas and newlines inside quotes).
export function toCsv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    let s = v === null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  endRow();
  return rows;
}
