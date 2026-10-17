import { z } from "zod";

export const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"] as const;
export type Stage = (typeof STAGES)[number];

export type Candidate = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  skills: string[];
  experience_years: number;
  source: string;
  notes: string;
  stage: Stage;
  created_at: string;
  updated_at: string;
};

export const candidateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(30).default(""),
  role: z.string().trim().min(1, "Role is required").max(100),
  skills: z.array(z.string().trim().min(1)).max(20).default([]),
  experience_years: z.coerce.number().min(0).max(60).default(0),
  source: z.string().trim().max(50).default("Direct"),
  notes: z.string().trim().max(2000).default(""),
  stage: z.enum(STAGES).default("Applied"),
});

export const candidatePatch = candidateInput.partial();

/** Forward moves plus rejection; reopening a rejected candidate goes back to Applied/Screening only. */
export function canMove(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  if (from === "Hired") return false;
  if (from === "Rejected") return to === "Applied" || to === "Screening";
  return true;
}

export const parseSkills = (s: string) =>
  Array.from(new Set(s.split(",").map((x) => x.trim()).filter(Boolean)));
