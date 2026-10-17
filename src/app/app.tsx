"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canMove, type Candidate, type Job, type Stage } from "@/lib/ats";
import { api } from "@/lib/client";
import CandidateForm from "@/components/CandidateForm";
import CandidatesTable, { EMPTY_FILTERS, type Filters } from "@/components/CandidatesTable";
import Dashboard, { type Metrics } from "@/components/Dashboard";
import Detail from "@/components/Detail";
import ImportDialog from "@/components/ImportDialog";
import Jobs from "@/components/Jobs";
import Pipeline from "@/components/Pipeline";
import { Skeleton, btnPrimary } from "@/components/ui";

type Tab = "dashboard" | "pipeline" | "candidates" | "jobs";
const TABS: Tab[] = ["dashboard", "pipeline", "candidates", "jobs"];
type Toast = { msg: string; undo?: () => void };
const UNDO_MS = 4000;

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const tab = (TABS as string[]).includes(p.get("tab") ?? "") ? (p.get("tab") as Tab) : "dashboard";
  const filters: Filters = {
    q: p.get("q") ?? "", stage: p.get("stage") ?? "", source: p.get("source") ?? "", min_rating: p.get("min_rating") ?? "",
    sort: p.get("sort") ?? "newest", skill: p.get("skill") ?? "", stale: p.get("stale") === "1", interviews: p.get("interviews") === "1",
    page: Math.max(1, Number(p.get("page")) || 1),
  };
  return { tab, job: p.get("job") ?? "", filters };
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [jobId, setJobId] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [board, setBoard] = useState<Candidate[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Candidate | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pending = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; to: Stage; from: Stage }>());

  const flash = useCallback((msg: string, undo?: () => void, ms = 3200) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // URL <-> state, so any view or filtered list can be shared or reloaded.
  useEffect(() => {
    const u = readUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from the URL; window is unavailable during SSR
    setTab(u.tab); setJobId(u.job); setFilters(u.filters); setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (tab !== "dashboard") p.set("tab", tab);
    if (jobId) p.set("job", jobId);
    if (tab === "candidates") {
      if (filters.q) p.set("q", filters.q);
      if (filters.stage) p.set("stage", filters.stage);
      if (filters.source) p.set("source", filters.source);
      if (filters.min_rating) p.set("min_rating", filters.min_rating);
      if (filters.skill) p.set("skill", filters.skill);
      if (filters.stale) p.set("stale", "1");
      if (filters.interviews) p.set("interviews", "1");
      if (filters.sort !== "newest") p.set("sort", filters.sort);
      if (filters.page > 1) p.set("page", String(filters.page));
    }
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [hydrated, tab, jobId, filters]);

  const refresh = useCallback(async () => {
    const jq = jobId ? `job_id=${jobId}` : "";
    try {
      const [b, m, j] = await Promise.all([
        api<{ candidates: Candidate[] }>(`/api/candidates?pageSize=500&sort=newest&${jq}`),
        api<Metrics>(`/api/metrics?${jq}`),
        api<{ jobs: Job[] }>("/api/jobs"),
      ]);
      setBoard(b.candidates); setMetrics(m); setJobs(j.jobs); setLoadError(false);
    } catch { setLoadError(true); }
    setLoaded(true);
    setVersion((v) => v + 1);
  }, [jobId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and when the job filter changes
  useEffect(() => { if (hydrated) refresh(); }, [hydrated, refresh]);

  // --- stage moves: board and dropdown moves are optimistic and undoable for a few seconds ---
  const commit = useCallback(async (id: number) => {
    const p = pending.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.current.delete(id);
    try { await api(`/api/candidates/${id}`, { method: "PATCH", body: JSON.stringify({ stage: p.to }) }); }
    catch (e) { flash((e as Error).message); }
    refresh();
  }, [flash, refresh]);

  const move = useCallback((c: Candidate, to: Stage, opts?: { immediate?: boolean }) => {
    const existing = pending.current.get(c.id);
    const from = existing?.from ?? c.stage;
    if (existing) { clearTimeout(existing.timer); pending.current.delete(c.id); }
    if (!canMove(from, to)) return;
    setBoard((b) => b.map((x) => (x.id === c.id ? { ...x, stage: to, stage_changed_at: new Date().toISOString() } : x)));
    if (opts?.immediate) {
      pending.current.set(c.id, { timer: setTimeout(() => {}, 0), to, from });
      commit(c.id).then(() => flash(`${c.name} moved to ${to}`));
      return;
    }
    const timer = setTimeout(() => commit(c.id), UNDO_MS);
    pending.current.set(c.id, { timer, to, from });
    flash(`${c.name} moved to ${to}`, () => {
      clearTimeout(timer);
      pending.current.delete(c.id);
      setBoard((b) => b.map((x) => (x.id === c.id ? { ...x, stage: from, stage_changed_at: c.stage_changed_at } : x)));
      setToast(null);
    }, UNDO_MS);
  }, [commit, flash]);

  // Don't lose a move if the tab closes inside the undo window.
  useEffect(() => {
    const h = () => {
      for (const [id, p] of pending.current) {
        fetch(`/api/candidates/${id}`, { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: p.to }) });
      }
    };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, []);

  async function remove(c: Candidate) {
    if (!window.confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    await api(`/api/candidates/${c.id}`, { method: "DELETE" });
    setDetailId(null); flash("Candidate deleted"); refresh();
  }

  // Keyboard shortcuts: / search, n new, 1-4 switch tabs.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (editing || importing || detailId !== null) return;
      if (e.key === "/") { e.preventDefault(); setTab("candidates"); setTimeout(() => searchRef.current?.focus(), 50); }
      else if (e.key === "n") { e.preventDefault(); setEditing("new"); }
      else if ("1234".includes(e.key) && e.key) setTab(TABS[Number(e.key) - 1]);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [editing, importing, detailId]);

  const showStale = () => { setFilters({ ...EMPTY_FILTERS, stale: true, sort: "stale" }); setTab("candidates"); };
  const showInterviews = () => { setFilters({ ...EMPTY_FILTERS, interviews: true }); setTab("candidates"); };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mini ATS</h1>
          <p className="text-sm text-slate-500">Track candidates from application to offer.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={jobId} onChange={(e) => { setJobId(e.target.value); setFilters((f) => ({ ...f, page: 1 })); }} aria-label="Filter everything by job" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All jobs</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.status === "Closed" ? " (closed)" : ""}</option>)}
          </select>
          <button onClick={() => setEditing("new")} className={btnPrimary}>+ Add candidate <kbd className="ml-1 hidden rounded bg-indigo-500 px-1 text-xs sm:inline">n</kbd></button>
        </div>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Views">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t}<span className="ml-1 hidden text-xs text-slate-300 sm:inline">{i + 1}</span>
          </button>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Could not reach the server. <button onClick={refresh} className="font-medium underline">Retry</button>
        </p>
      )}

      {!loaded ? (
        <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>
      ) : (
        <>
          {tab === "dashboard" && metrics && <Dashboard m={metrics} onOpen={setDetailId} onShowStale={showStale} onShowInterviews={showInterviews} />}
          {tab === "pipeline" && <Pipeline all={board} onMove={move} onOpen={(c) => setDetailId(c.id)} />}
          {tab === "candidates" && (
            <CandidatesTable jobId={jobId} filters={filters} setFilters={setFilters} version={version} searchRef={searchRef}
              onOpen={(c) => setDetailId(c.id)} onChanged={(m) => { flash(m); refresh(); }} onImport={() => setImporting(true)} />
          )}
          {tab === "jobs" && <Jobs jobs={jobs} onChanged={(m) => { flash(m); refresh(); }} onViewCandidates={(id) => { setJobId(String(id)); setFilters(EMPTY_FILTERS); setTab("candidates"); }} />}
        </>
      )}

      {detailId !== null && (
        <Detail id={detailId} version={version} onClose={() => setDetailId(null)}
          onMove={(c, to) => move(c, to, { immediate: true })}
          onEdit={(c) => { setEditing(c); setDetailId(null); }} onDelete={remove}
          onChanged={(m) => { if (m) flash(m); refresh(); }} />
      )}
      {editing && (
        <CandidateForm initial={editing === "new" ? null : editing} jobs={jobs} defaultJobId={jobId} onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); flash(m); refresh(); }} />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={(m) => { setImporting(false); flash(m); refresh(); }} />}

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          <span>{toast.msg}</span>
          {toast.undo && <button onClick={toast.undo} className="font-semibold text-indigo-300 hover:text-indigo-200">Undo</button>}
        </div>
      )}
    </div>
  );
}
