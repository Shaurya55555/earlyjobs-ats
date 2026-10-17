"use client";

import { useState } from "react";
import { STAGES, STALE_DAYS, canMove, daysSince, isActive, type Candidate, type Stage } from "@/lib/ats";
import { Avatar, Stars, StageBadge } from "./ui";

export default function Pipeline({ all, onMove, onOpen }: {
  all: Candidate[]; onMove: (c: Candidate, to: Stage) => void; onOpen: (c: Candidate) => void;
}) {
  const [over, setOver] = useState<Stage | null>(null);
  const [dragging, setDragging] = useState<Candidate | null>(null);
  return (
    <section className="grid gap-3 overflow-x-auto pb-2" style={{ gridAutoFlow: "column", gridAutoColumns: "minmax(230px, 1fr)" }}>
      {STAGES.map((s) => {
        const items = all.filter((c) => c.stage === s);
        const droppable = dragging ? canMove(dragging.stage, s) : false;
        return (
          <div
            key={s}
            onDragOver={(e) => { if (droppable) { e.preventDefault(); setOver(s); } }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const c = all.find((x) => x.id === Number(e.dataTransfer.getData("text/plain")));
              setDragging(null);
              if (c) onMove(c, s);
            }}
            className={`rounded-xl border p-3 transition ${over === s ? "border-indigo-400 bg-indigo-50" : dragging && !droppable && dragging.stage !== s ? "border-slate-200 bg-slate-50 opacity-50" : "border-slate-200 bg-slate-50"}`}
          >
            <div className="mb-3 flex items-center justify-between"><StageBadge stage={s} /><span className="text-xs text-slate-500">{items.length}</span></div>
            <div className="space-y-2">
              {items.map((c) => {
                const idle = isActive(c.stage) ? daysSince(c.stage_changed_at) : 0;
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(c.id)); setDragging(c); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-2">
                      <Avatar name={c.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <button onClick={() => onOpen(c)} className="block max-w-full truncate text-left text-sm font-medium hover:text-indigo-700">{c.name}</button>
                        <div className="truncate text-xs text-slate-500">{c.role}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      {c.rating > 0 ? <Stars value={c.rating} label="Rating" /> : <span className="text-slate-400">Unrated</span>}
                      {idle >= STALE_DAYS ? <span className="rounded bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700" title={`No movement for ${idle} days`}>{idle}d idle</span> : <span className="text-slate-400">{idle}d</span>}
                    </div>
                    {c.stage === "Interview" && c.interview_at && (
                      <div className="mt-1 text-xs text-violet-700">📅 {new Date(c.interview_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                    )}
                    <select aria-label={`Move ${c.name}`} value="" onChange={(e) => onMove(c, e.target.value as Stage)} className="mt-2 w-full rounded border border-slate-200 bg-white px-1 py-1 text-xs">
                      <option value="">Move to...</option>
                      {STAGES.filter((t) => canMove(c.stage, t)).map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                );
              })}
              {!items.length && <p className="py-4 text-center text-xs text-slate-400">Drop here</p>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
