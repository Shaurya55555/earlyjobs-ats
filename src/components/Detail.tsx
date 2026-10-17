"use client";

import { useCallback, useEffect, useState } from "react";
import { INTERVIEW_TYPES, STAGES, STALE_DAYS, canMove, daysSince, isActive, type Candidate, type Stage } from "@/lib/ats";
import { api, fmtDate, fmtDateTime, fromLocalInput, relativeDay, toLocalInput } from "@/lib/client";
import { Avatar, Modal, STAGE_COLOR, Stars, StageBadge, btnGhost, btnPrimary, inputCls } from "./ui";

type History = { from_stage: string | null; to_stage: string; changed_at: string };
type Note = { id: number; body: string; created_at: string };

export default function Detail({ id, version, onClose, onMove, onEdit, onDelete, onChanged }: {
  id: number; version: number; onClose: () => void; onMove: (c: Candidate, to: Stage) => void;
  onEdit: (c: Candidate) => void; onDelete: (c: Candidate) => void; onChanged: (msg?: string) => void;
}) {
  const [c, setC] = useState<Candidate | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const [kind, setKind] = useState("Technical");

  const load = useCallback(async () => {
    const r = await api<{ candidate: Candidate; history: History[]; notes: Note[] }>(`/api/candidates/${id}`);
    setC(r.candidate); setHistory(r.history); setNotes(r.notes);
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the candidate when the dialog opens or data changes
  useEffect(() => { load().catch(onClose); }, [load, version, onClose]);

  if (!c) return <Modal title="Loading..." onClose={onClose}><div className="h-40" /></Modal>;

  async function patch(body: object, msg?: string) {
    await api(`/api/candidates/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await load();
    onChanged(msg);
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setNoteErr("");
    try {
      await api(`/api/candidates/${id}/notes`, { method: "POST", body: JSON.stringify({ body: draft }) });
      setDraft(""); await load(); onChanged();
    } catch (err) { setNoteErr((err as { fields?: Record<string, string[]> }).fields?.body?.[0] ?? (err as Error).message); }
  }
  async function removeNote(n: Note) {
    await api(`/api/candidates/${id}/notes/${n.id}`, { method: "DELETE" });
    await load(); onChanged();
  }

  const idle = isActive(c.stage) ? daysSince(c.stage_changed_at) : 0;
  const moves = STAGES.filter((s) => canMove(c.stage, s));

  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={c.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><StageBadge stage={c.stage} /><span className="text-slate-500">{c.role}</span></div>
            <div className="mt-1"><Stars value={c.rating} label="Rating" onChange={(n) => patch({ rating: n })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onEdit(c)} className={btnGhost}>Edit</button>
            <button onClick={() => onDelete(c)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50">Delete</button>
          </div>
        </div>

        {idle >= STALE_DAYS && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">⚠ In {c.stage} for {idle} days with no movement. Move them forward or reject to keep the pipeline honest.</p>
        )}

        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
          <dt className="text-slate-500">Email</dt><dd><a href={`mailto:${c.email}`} className="text-indigo-700 hover:underline">{c.email}</a></dd>
          <dt className="text-slate-500">Phone</dt><dd>{c.phone || "-"}</dd>
          <dt className="text-slate-500">Experience</dt><dd>{c.experience_years} yr</dd>
          <dt className="text-slate-500">Source</dt><dd>{c.source}</dd>
          <dt className="text-slate-500">Applied</dt><dd>{fmtDate(c.created_at)}</dd>
          <dt className="text-slate-500">Skills</dt><dd className="flex flex-wrap gap-1">{c.skills.length ? c.skills.map((s) => <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s}</span>) : "-"}</dd>
        </dl>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-slate-500">Interview</div>
            {!scheduling && <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => { setScheduling(true); setWhen(toLocalInput(c.interview_at)); setKind(c.interview_type || "Technical"); }}>{c.interview_at ? "Reschedule" : "Schedule"}</button>}
          </div>
          {scheduling ? (
            <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); await patch({ interview_at: fromLocalInput(when), interview_type: when ? kind : "" }, "Interview saved"); setScheduling(false); }}>
              <label className="text-xs text-slate-600">Type<select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>{INTERVIEW_TYPES.filter(Boolean).map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="text-xs text-slate-600">When<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></label>
              <button className={btnPrimary}>Save</button>
              {c.interview_at && <button type="button" className="px-2 py-2 text-sm text-rose-600 hover:underline" onClick={async () => { await patch({ interview_at: null, interview_type: "" }, "Interview cleared"); setScheduling(false); }}>Clear</button>}
              <button type="button" className="px-2 py-2 text-sm text-slate-500 hover:underline" onClick={() => setScheduling(false)}>Cancel</button>
            </form>
          ) : c.interview_at ? (
            <p className="mt-1">{c.interview_type || "Interview"} · <b>{fmtDateTime(c.interview_at)}</b> <span className="text-slate-500">({relativeDay(c.interview_at)})</span></p>
          ) : <p className="mt-1 text-slate-500">Nothing scheduled.</p>}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Move to stage</div>
          <div className="flex flex-wrap gap-2">
            {moves.map((s) => <button key={s} onClick={() => onMove(c, s)} className={`rounded-full border px-3 py-1 text-xs font-medium ${STAGE_COLOR[s]}`}>{s}</button>)}
            {!moves.length && <span className="text-slate-500">No further moves.</span>}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Notes ({notes.length})</div>
          <form onSubmit={addNote} className="mb-3 flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a note: feedback, follow-ups, context..." aria-label="New note" className={`${inputCls} mt-0`} />
            <button className={btnPrimary} disabled={!draft.trim()}>Add</button>
          </form>
          {noteErr && <p className="mb-2 text-xs text-rose-600">{noteErr}</p>}
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="group rounded-lg bg-slate-50 px-3 py-2">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{fmtDate(n.created_at)}</span>
                  <button onClick={() => removeNote(n)} className="opacity-0 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100">Delete</button>
                </div>
              </li>
            ))}
            {!notes.length && <li className="text-slate-500">No notes yet.</li>}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Stage history</div>
          <ol className="space-y-1 border-l border-slate-200 pl-3">
            {history.map((h, i) => <li key={i} className="text-xs text-slate-600">{h.from_stage ? `${h.from_stage} → ` : "Added as "}<b>{h.to_stage}</b> · {fmtDate(h.changed_at)}</li>)}
          </ol>
        </div>
      </div>
    </Modal>
  );
}
