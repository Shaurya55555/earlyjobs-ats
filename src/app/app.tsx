"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STAGES, canMove, parseSkills, type Candidate, type Stage } from "@/lib/ats";

type Metrics = {
  total: number; newThisWeek: number; avgExperience: number; active: number; hireRate: number | null;
  byStage: Record<string, number>; funnel: { stage: string; reached: number }[];
  bySource: { source: string; n: number }[]; byRole: { role: string; n: number }[];
};
type History = { from_stage: string | null; to_stage: string; changed_at: string };
type Tab = "dashboard" | "pipeline" | "candidates";

const STAGE_COLOR: Record<Stage, string> = {
  Applied: "bg-slate-100 text-slate-700 border-slate-300",
  Screening: "bg-sky-100 text-sky-800 border-sky-300",
  Interview: "bg-violet-100 text-violet-800 border-violet-300",
  Offer: "bg-amber-100 text-amber-800 border-amber-300",
  Hired: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Rejected: "bg-rose-100 text-rose-800 border-rose-300",
};

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error ?? "Request failed"), { fields: body.fields as Record<string, string[]> | undefined });
  return body;
}

function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[stage]}`}>{stage}</span>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [all, setAll] = useState<Candidate[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Candidate | "new" | null>(null);
  const [detail, setDetail] = useState<Candidate | null>(null);

  // list filters
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState("newest");
  const [shown, setShown] = useState<Candidate[]>([]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const refresh = useCallback(async () => {
    const [c, m] = await Promise.all([api<{ candidates: Candidate[] }>("/api/candidates"), api<Metrics>("/api/metrics")]);
    setAll(c.candidates); setMetrics(m); setLoading(false);
  }, []);
  useEffect(() => { refresh().catch(() => setLoading(false)); }, [refresh]);

  // server-side search/filter, debounced
  useEffect(() => {
    const t = setTimeout(async () => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (stage) p.set("stage", stage);
      if (role) p.set("role", role);
      p.set("sort", sort);
      const r = await api<{ candidates: Candidate[] }>(`/api/candidates?${p}`);
      setShown(r.candidates);
    }, 200);
    return () => clearTimeout(t);
  }, [q, stage, role, sort, all]);

  const roles = useMemo(() => Array.from(new Set(all.map((c) => c.role))).sort(), [all]);

  async function move(c: Candidate, to: Stage) {
    if (!canMove(c.stage, to)) return;
    const prev = all;
    setAll(all.map((x) => (x.id === c.id ? { ...x, stage: to } : x))); // optimistic
    try {
      await api(`/api/candidates/${c.id}`, { method: "PATCH", body: JSON.stringify({ stage: to }) });
      flash(`${c.name} moved to ${to}`);
      refresh();
      setDetail((d) => (d && d.id === c.id ? { ...d, stage: to } : d));
    } catch (e) {
      setAll(prev);
      flash((e as Error).message);
    }
  }

  async function remove(c: Candidate) {
    if (!window.confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    await api(`/api/candidates/${c.id}`, { method: "DELETE" });
    setDetail(null); flash("Candidate deleted"); refresh();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mini ATS</h1>
          <p className="text-sm text-slate-500">Track candidates from application to offer.</p>
        </div>
        <button onClick={() => setEditing("new")} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + Add candidate
        </button>
      </header>

      <nav className="mb-6 flex gap-1 border-b border-slate-200" aria-label="Views">
        {(["dashboard", "pipeline", "candidates"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-current={tab === t}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t}
          </button>
        ))}
      </nav>

      {loading ? <p className="text-slate-500">Loading...</p> : (
        <>
          {tab === "dashboard" && metrics && <Dashboard m={metrics} />}
          {tab === "pipeline" && <Pipeline all={all} onMove={move} onOpen={setDetail} />}
          {tab === "candidates" && (
            <section>
              <div className="mb-4 flex flex-wrap gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, role, skill, notes"
                  aria-label="Search candidates" className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">All roles</option>{roles.map((r) => <option key={r}>{r}</option>)}
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="newest">Newest</option><option value="oldest">Oldest</option>
                  <option value="name">Name</option><option value="experience">Experience</option>
                </select>
              </div>
              <p className="mb-2 text-sm text-slate-500">{shown.length} of {all.length} candidates</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Skills</th>
                      <th className="px-4 py-3">Exp</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Applied</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <tr key={c.id} onClick={() => setDetail(c)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3"><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.email}</div></td>
                        <td className="px-4 py-3">{c.role}</td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{c.skills.slice(0, 3).map((s) => <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s}</span>)}</div></td>
                        <td className="px-4 py-3">{c.experience_years} yr</td>
                        <td className="px-4 py-3"><StageBadge stage={c.stage} /></td>
                        <td className="px-4 py-3 text-slate-500">{fmt(c.created_at)}</td>
                      </tr>
                    ))}
                    {!shown.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No candidates match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {detail && <Detail c={detail} onClose={() => setDetail(null)} onMove={move} onEdit={() => { setEditing(detail); setDetail(null); }} onDelete={() => remove(detail)} />}
      {editing && <Form initial={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={(m) => { setEditing(null); flash(m); refresh(); }} />}
      {toast && <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600">{r.label}</span>
          <div className="h-3 flex-1 rounded bg-slate-100"><div className="h-3 rounded bg-indigo-500" style={{ width: `${(r.n / max) * 100}%` }} /></div>
          <span className="w-8 text-right font-medium">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

function Dashboard({ m }: { m: Metrics }) {
  const first = m.funnel[0]?.reached || 0;
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total candidates" value={m.total} />
        <Stat label="Active in pipeline" value={m.active} />
        <Stat label="New this week" value={m.newThisWeek} />
        <Stat label="Hire rate" value={m.hireRate === null ? "n/a" : `${m.hireRate}%`} hint="hired / (hired + rejected)" />
        <Stat label="Avg experience" value={`${m.avgExperience} yr`} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold">Candidates by stage</h2>
          <Bars rows={STAGES.map((s) => ({ label: s, n: m.byStage[s] ?? 0 }))} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 font-semibold">Funnel</h2>
          <p className="mb-4 text-xs text-slate-500">Candidates who ever reached each stage, and % of all applicants.</p>
          <Bars rows={m.funnel.map((f) => ({ label: `${f.stage} (${first ? Math.round((f.reached / first) * 100) : 0}%)`, n: f.reached }))} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold">By source</h2>
          <Bars rows={m.bySource.map((s) => ({ label: s.source, n: s.n }))} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold">By role</h2>
          <Bars rows={m.byRole.map((s) => ({ label: s.role, n: s.n }))} />
        </div>
      </div>
    </section>
  );
}

function Pipeline({ all, onMove, onOpen }: { all: Candidate[]; onMove: (c: Candidate, to: Stage) => void; onOpen: (c: Candidate) => void }) {
  const [over, setOver] = useState<Stage | null>(null);
  return (
    <section className="grid gap-3 overflow-x-auto md:grid-cols-6" style={{ gridAutoFlow: "column", gridAutoColumns: "minmax(220px, 1fr)" }}>
      {STAGES.map((s) => {
        const items = all.filter((c) => c.stage === s);
        return (
          <div key={s} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault(); setOver(null);
              const c = all.find((x) => x.id === Number(e.dataTransfer.getData("text/plain")));
              if (c) onMove(c, s);
            }}
            className={`rounded-xl border bg-slate-50 p-3 ${over === s ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
            <div className="mb-3 flex items-center justify-between"><StageBadge stage={s} /><span className="text-xs text-slate-500">{items.length}</span></div>
            <div className="space-y-2">
              {items.map((c) => (
                <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(c.id))}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing">
                  <button onClick={() => onOpen(c)} className="text-left text-sm font-medium hover:text-indigo-700">{c.name}</button>
                  <div className="text-xs text-slate-500">{c.role}</div>
                  <select aria-label={`Move ${c.name}`} value="" onChange={(e) => onMove(c, e.target.value as Stage)}
                    className="mt-2 w-full rounded border border-slate-200 px-1 py-1 text-xs">
                    <option value="">Move to...</option>
                    {STAGES.filter((t) => canMove(c.stage, t)).map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              ))}
              {!items.length && <p className="py-4 text-center text-xs text-slate-400">Drop here</p>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function Detail({ c, onClose, onMove, onEdit, onDelete }: { c: Candidate; onClose: () => void; onMove: (c: Candidate, to: Stage) => void; onEdit: () => void; onDelete: () => void }) {
  const [history, setHistory] = useState<History[]>([]);
  useEffect(() => { api<{ history: History[] }>(`/api/candidates/${c.id}`).then((r) => setHistory(r.history)); }, [c.id, c.stage]);
  return (
    <Modal title={c.name} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2"><StageBadge stage={c.stage} /><span className="text-slate-500">{c.role}</span></div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1">
          <dt className="text-slate-500">Email</dt><dd>{c.email}</dd>
          <dt className="text-slate-500">Phone</dt><dd>{c.phone || "-"}</dd>
          <dt className="text-slate-500">Experience</dt><dd>{c.experience_years} yr</dd>
          <dt className="text-slate-500">Source</dt><dd>{c.source}</dd>
          <dt className="text-slate-500">Skills</dt><dd>{c.skills.join(", ") || "-"}</dd>
          <dt className="text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{c.notes || "-"}</dd>
        </dl>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Move to stage</div>
          <div className="flex flex-wrap gap-2">
            {STAGES.filter((s) => canMove(c.stage, s)).map((s) => (
              <button key={s} onClick={() => onMove(c, s)} className={`rounded-full border px-3 py-1 text-xs font-medium ${STAGE_COLOR[s]}`}>{s}</button>
            ))}
            {!STAGES.some((s) => canMove(c.stage, s)) && <span className="text-slate-500">No further moves.</span>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">History</div>
          <ol className="space-y-1 border-l border-slate-200 pl-3">
            {history.map((h, i) => <li key={i} className="text-xs text-slate-600">{h.from_stage ? `${h.from_stage} → ` : "Added as "}<b>{h.to_stage}</b> · {fmt(h.changed_at)}</li>)}
          </ol>
        </div>
        <div className="flex justify-between pt-2">
          <button onClick={onDelete} className="text-sm text-rose-600 hover:underline">Delete</button>
          <button onClick={onEdit} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Edit</button>
        </div>
      </div>
    </Modal>
  );
}

function Form({ initial, onClose, onSaved }: { initial: Candidate | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? "", email: initial?.email ?? "", phone: initial?.phone ?? "", role: initial?.role ?? "",
    skills: initial?.skills.join(", ") ?? "", experience_years: String(initial?.experience_years ?? 0),
    source: initial?.source ?? "Direct", notes: initial?.notes ?? "", stage: (initial?.stage ?? "Applied") as Stage,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErrors({});
    const body = { ...f, skills: parseSkills(f.skills), experience_years: Number(f.experience_years) };
    if (initial) delete (body as Partial<typeof body>).stage; // stage changes go through the move flow so history stays correct
    try {
      await api(initial ? `/api/candidates/${initial.id}` : "/api/candidates", { method: initial ? "PATCH" : "POST", body: JSON.stringify(body) });
      onSaved(initial ? "Candidate updated" : "Candidate added");
    } catch (err) {
      setErrors((err as { fields?: Record<string, string[]> }).fields ?? { form: [(err as Error).message] });
      setBusy(false);
    }
  }

  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} step={type === "number" ? "0.5" : undefined}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      {errors[k] && <span className="text-xs text-rose-600">{errors[k][0]}</span>}
    </label>
  );

  return (
    <Modal title={initial ? "Edit candidate" : "Add candidate"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {errors.form && <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{errors.form[0]}</p>}
        <div className="grid gap-3 sm:grid-cols-2">{field("name", "Full name")}{field("email", "Email", "email")}</div>
        <div className="grid gap-3 sm:grid-cols-2">{field("phone", "Phone")}{field("role", "Role applied for")}</div>
        {field("skills", "Skills (comma separated)")}
        <div className="grid gap-3 sm:grid-cols-2">{field("experience_years", "Experience (years)", "number")}
          <label className="block text-sm"><span className="text-slate-600">Source</span>
            <select value={f.source} onChange={(e) => set("source", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              {["Direct", "LinkedIn", "Referral", "Job Board", "Campus", "Other"].map((s) => <option key={s}>{s}</option>)}
            </select></label></div>
        {!initial && (
          <label className="block text-sm"><span className="text-slate-600">Starting stage</span>
            <select value={f.stage} onChange={(e) => set("stage", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              {STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
        )}
        <label className="block text-sm"><span className="text-slate-600">Notes</span>
          <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
