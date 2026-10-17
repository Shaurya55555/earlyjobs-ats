import { STAGES } from "./ats";

export const CAND_SELECT = `
  SELECT c.id, c.name, c.email, c.phone, c.job_id, j.title AS role, c.skills,
         c.experience_years::float AS experience_years, c.source, c.rating,
         c.interview_at, c.interview_type, c.stage, c.stage_changed_at, c.created_at, c.updated_at,
         (SELECT COUNT(*)::int FROM candidate_notes n WHERE n.candidate_id = c.id) AS note_count
  FROM candidates c JOIN jobs j ON j.id = c.job_id`;

const SORTS: Record<string, string> = {
  newest: "c.created_at DESC",
  oldest: "c.created_at ASC",
  name: "c.name ASC",
  experience: "c.experience_years DESC",
  rating: "c.rating DESC",
  stale: "c.stage_changed_at ASC",
};

/** Build WHERE + ORDER BY from query params. Shared by list, CSV export and bulk actions. */
export function buildFilter(sp: URLSearchParams) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  const q = sp.get("q")?.trim();
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
    const i = params.length;
    where.push(
      `(c.name ILIKE $${i} OR c.email ILIKE $${i} OR j.title ILIKE $${i} OR c.phone ILIKE $${i} OR array_to_string(c.skills, ',') ILIKE $${i} OR EXISTS (SELECT 1 FROM candidate_notes n WHERE n.candidate_id = c.id AND n.body ILIKE $${i}))`,
    );
  }
  const stage = sp.get("stage");
  if (stage && (STAGES as readonly string[]).includes(stage)) add("c.stage = ?", stage);
  if (stage === "active") where.push("c.stage NOT IN ('Hired','Rejected')");
  const job = Number(sp.get("job_id"));
  if (Number.isInteger(job) && job > 0) add("c.job_id = ?", job);
  const skill = sp.get("skill")?.trim();
  if (skill) add("EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE lower(s) = ?)", skill.toLowerCase());
  const minRating = Number(sp.get("min_rating"));
  if (minRating >= 1 && minRating <= 5) add("c.rating >= ?", minRating);
  const source = sp.get("source");
  if (source) add("c.source = ?", source);
  if (sp.get("stale") === "1") where.push("c.stage NOT IN ('Hired','Rejected') AND c.stage_changed_at < now() - interval '7 days'");
  if (sp.get("interviews") === "1") where.push("c.interview_at IS NOT NULL AND c.interview_at >= now()");
  const order = SORTS[sp.get("sort") ?? ""] ?? SORTS.newest;
  return {
    whereSql: where.length ? "WHERE " + where.join(" AND ") : "",
    orderSql: `ORDER BY ${order}, c.id DESC`,
    params,
  };
}
