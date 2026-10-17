"use client";

import { useEffect, useRef, useState } from "react";
import { SOURCES, STAGES, STALE_DAYS, daysSince, isActive, type Candidate, type Stage } from "@/lib/ats";
import { api, fmtDate } from "@/lib/client";
import { Avatar, Skeleton, Stars, StageBadge, btnGhost } from "./ui";

export type Filters = {
  q: string; stage: string; source: string; min_rating: string; sort: string; skill: string; stale: boolean; interviews: boolean; page: number;
};
export const EMPTY_FILTERS: Filters = { q: "", stage: "", source: "", min_rating: "", sort: "newest", skill: "", stale: false, interviews: false, page: 1 };
const PAGE_SIZE = 25;

export function filtersToParams(f: Filters, jobId: string): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.stage) p.set("stage", f.stage);
  if (f.source) p.set("source", f.source);
  if (f.min_rating) p.set("min_rating", f.min_rating);
  if (f.skill) p.set("skill", f.skill);
  if (f.stale) p.set("stale", "1");
  if (f.interviews) p.set("interviews", "1");
  if (jobId) p.set("job_id", jobId);
  p.set("sort", f.sort);
  return p;
}

const selectCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export default function CandidatesTable({ jobId, filters, setFilters, version, searchRef, onOpen, onChanged, onImport }: {
  jobId: string; filters: Filters; setFilters: (f: Filters) => void; version: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onOpen: (c: Candidate) => void; onChanged: (msg: string) => void; onImport: () => void;
}) {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(filters.q);
  const lastReq = useRef(0);
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, page: 1, ...patch });

  // Debounce typing, but keep the URL/filter state as the source of truth.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the search box in sync with URL-driven filters
  useEffect(() => { setQ(filters.q); }, [filters.q]);
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => setFilters({ ...filters, q, page: 1 }), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const paramString = filtersToParams(filters, jobId).toString();
  useEffect(() => {
    const id = ++lastReq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mark the list as loading when a new request starts
    setLoading(true);
    api<{ candidates: Candidate[]; total: number }>(`/api/candidates?${paramString}&page=${filters.page}&pageSize=${PAGE_SIZE}`)
      .then((r) => {
        if (id !== lastReq.current) return; // ignore out-of-order responses
        setRows(r.candidates); setTotal(r.total); setLoading(false);
        setSelected((s) => new Set([...s].filter((x) => r.candidates.some((c) => c.id === x))));
      })
      .catch(() => id === lastReq.current && setLoading(false));
  }, [paramString, filters.page, version]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hasFilters = !!(filters.q || filters.stage || filters.source || filters.min_rating || filters.skill || filters.stale || filters.interviews);

  async function bulk(body: object, msg: (r: { updated: number; skipped: number }) => string) {
    setBusy(true);
    try {
      const r = await api<{ updated: number; skipped: number }>("/api/candidates/bulk", { method: "POST", body: JSON.stringify({ ids: [...selected], ...body }) });
      setSelected(new Set());
      onChanged(msg(r));
    } catch (e) { onChanged((e as Error).message); }
    setBusy(false);
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap gap-2">
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, role, skill, notes  ( / )" aria-label="Search candidates" className={`${selectCls} min-w-64 flex-1`} />
        <select value={filters.stage} onChange={(e) => set({ stage: e.target.value })} aria-label="Filter by stage" className={selectCls}>
          <option value="">All stages</option><option value="active">Active only</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.source} onChange={(e) => set({ source: e.target.value })} aria-label="Filter by source" className={selectCls}>
          <option value="">All sources</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.min_rating} onChange={(e) => set({ min_rating: e.target.value })} aria-label="Minimum rating" className={selectCls}>
          <option value="">Any rating</option>{[4, 3, 2].map((n) => <option key={n} value={n}>{n}+ stars</option>)}<option value="5">5 stars</option>
        </select>
        <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort" className={selectCls}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option>
          <option value="experience">Experience</option><option value="rating">Rating</option><option value="stale">Longest idle</option>
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => set({ stale: !filters.stale })} aria-pressed={filters.stale} className={`rounded-full border px-3 py-1 ${filters.stale ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-300 bg-white text-slate-600"}`}>⚠ Idle {STALE_DAYS}+ days</button>
        <button onClick={() => set({ interviews: !filters.interviews })} aria-pressed={filters.interviews} className={`rounded-full border px-3 py-1 ${filters.interviews ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-300 bg-white text-slate-600"}`}>📅 Interview scheduled</button>
        {filters.skill && <button onClick={() => set({ skill: "" })} className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-indigo-700">Skill: {filters.skill} ✕</button>}
        {hasFilters && <button onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} className="text-slate-500 underline">Clear filters</button>}
        <span className="ml-auto flex gap-2">
          <button onClick={onImport} className={btnGhost}>Import CSV</button>
          <a href={`/api/candidates/export?${paramString}`} download className={btnGhost}>Export CSV</a>
        </span>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm">
          <b>{selected.size} selected</b>
          <select aria-label="Move selected to" disabled={busy} value="" onChange={(e) => e.target.value && bulk({ action: "move", stage: e.target.value as Stage }, (r) => `Moved ${r.updated} to ${e.target.value}${r.skipped ? `, skipped ${r.skipped}` : ""}`)} className={selectCls}>
            <option value="">Move to...</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button disabled={busy} onClick={() => window.confirm(`Delete ${selected.size} candidate(s)? This cannot be undone.`) && bulk({ action: "delete" }, (r) => `Deleted ${r.updated}`)} className="text-rose-600 hover:underline">Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-slate-600 underline">Clear</button>
        </div>
      )}

      <p className="mb-2 text-sm text-slate-500">{loading ? "Loading..." : `${total} candidate${total === 1 ? "" : "s"}`}</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Skills</th>
              <th className="px-4 py-3">Rating</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Applied</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length && [0, 1, 2, 3, 4].map((i) => <tr key={i} className="border-t border-slate-100"><td colSpan={7} className="px-4 py-3"><Skeleton className="h-8" /></td></tr>)}
            {rows.map((c) => {
              const idle = isActive(c.stage) ? daysSince(c.stage_changed_at) : 0;
              return (
                <tr key={c.id} className={`border-t border-slate-100 hover:bg-slate-50 ${selected.has(c.id) ? "bg-indigo-50/50" : ""}`}>
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="cursor-pointer px-4 py-3" onClick={() => onOpen(c)}>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <div className="min-w-0"><div className="font-medium">{c.name}{c.note_count > 0 && <span className="ml-2 text-xs font-normal text-slate-400" title={`${c.note_count} notes`}>💬 {c.note_count}</span>}</div><div className="truncate text-xs text-slate-500">{c.email}</div></div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{c.role}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{c.skills.slice(0, 3).map((s) => <button key={s} onClick={() => set({ skill: s.toLowerCase() })} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs hover:bg-indigo-100" title={`Filter by ${s}`}>{s}</button>)}{c.skills.length > 3 && <span className="text-xs text-slate-400">+{c.skills.length - 3}</span>}</div></td>
                  <td className="px-4 py-3">{c.rating ? <Stars value={c.rating} label="Rating" /> : <span className="text-xs text-slate-400">Unrated</span>}</td>
                  <td className="px-4 py-3"><StageBadge stage={c.stage} />{idle >= STALE_DAYS && <span className="ml-2 text-xs font-medium text-rose-600">{idle}d idle</span>}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(c.created_at)}</td>
                </tr>
              );
            })}
            {!loading && !rows.length && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                {hasFilters ? "No candidates match these filters." : "No candidates yet."}
                {hasFilters && <button onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} className="ml-2 text-indigo-600 underline">Clear filters</button>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">Page {filters.page} of {pages}</span>
          <span className="flex gap-2">
            <button disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} className={btnGhost}>Previous</button>
            <button disabled={filters.page >= pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} className={btnGhost}>Next</button>
          </span>
        </div>
      )}
    </section>
  );
}
