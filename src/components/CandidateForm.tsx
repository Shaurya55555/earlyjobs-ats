"use client";

import { useState } from "react";
import { INTERVIEW_TYPES, SOURCES, STAGES, parseSkills, type Candidate, type Job, type Stage } from "@/lib/ats";
import { api, fromLocalInput, toLocalInput, type ApiError } from "@/lib/client";
import { Modal, Stars, btnGhost, btnPrimary, inputCls } from "./ui";

export default function CandidateForm({ initial, jobs, defaultJobId, onClose, onSaved }: {
  initial: Candidate | null; jobs: Job[]; defaultJobId: string; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const openJobs = jobs.filter((j) => j.status === "Open" || j.id === initial?.job_id);
  const [f, setF] = useState({
    name: initial?.name ?? "", email: initial?.email ?? "", phone: initial?.phone ?? "",
    job_id: String(initial?.job_id ?? (defaultJobId || openJobs[0]?.id || "")),
    skills: initial?.skills.join(", ") ?? "", experience_years: String(initial?.experience_years ?? 0),
    source: initial?.source ?? "Direct", rating: initial?.rating ?? 0, stage: (initial?.stage ?? "Applied") as Stage,
    interview_at: toLocalInput(initial?.interview_at ?? null), interview_type: initial?.interview_type || "Technical",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({});
    const body: Record<string, unknown> = {
      name: f.name, email: f.email, phone: f.phone, job_id: Number(f.job_id), skills: parseSkills(f.skills),
      experience_years: Number(f.experience_years), source: f.source, rating: f.rating,
      interview_at: fromLocalInput(f.interview_at), interview_type: f.interview_at ? f.interview_type : "",
    };
    if (!initial) body.stage = f.stage; // stage changes go through the move flow so history stays correct
    try {
      await api(initial ? `/api/candidates/${initial.id}` : "/api/candidates", { method: initial ? "PATCH" : "POST", body: JSON.stringify(body) });
      onSaved(initial ? "Candidate updated" : "Candidate added");
    } catch (err) {
      setErrors((err as ApiError).fields ?? { form: [(err as Error).message] });
      setBusy(false);
    }
  }

  const field = (k: "name" | "email" | "phone" | "skills" | "experience_years", label: string, type = "text", req = false) => (
    <label className="block text-sm">
      <span className="text-slate-600">{label}{req && <span className="text-rose-500"> *</span>}</span>
      <input type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} step={type === "number" ? "0.5" : undefined} min={type === "number" ? 0 : undefined}
        aria-invalid={!!errors[k]} className={inputCls} />
      {errors[k] && <span className="text-xs text-rose-600">{errors[k][0]}</span>}
    </label>
  );

  return (
    <Modal title={initial ? "Edit candidate" : "Add candidate"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {errors.form && <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{errors.form[0]}</p>}
        <div className="grid gap-3 sm:grid-cols-2">{field("name", "Full name", "text", true)}{field("email", "Email", "email", true)}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("phone", "Phone")}
          <label className="block text-sm"><span className="text-slate-600">Role applied for<span className="text-rose-500"> *</span></span>
            <select value={f.job_id} onChange={(e) => set("job_id", e.target.value)} className={inputCls}>
              {openJobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.status === "Closed" ? " (closed)" : ""}</option>)}
            </select>
            {errors.job_id && <span className="text-xs text-rose-600">{errors.job_id[0]}</span>}
            {!openJobs.length && <span className="text-xs text-rose-600">Open a job in the Jobs tab first.</span>}
          </label>
        </div>
        {field("skills", "Skills (comma separated)")}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("experience_years", "Experience (years)", "number")}
          <label className="block text-sm"><span className="text-slate-600">Source</span>
            <select value={f.source} onChange={(e) => set("source", e.target.value)} className={inputCls}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div><div className="text-slate-600">Rating</div><Stars value={f.rating} label="Rating" onChange={(n) => set("rating", n)} /></div>
          {!initial && (
            <label className="block"><span className="text-slate-600">Starting stage</span>
              <select value={f.stage} onChange={(e) => set("stage", e.target.value)} className={inputCls}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="text-slate-600">Interview (optional)</span>
            <input type="datetime-local" value={f.interview_at} onChange={(e) => set("interview_at", e.target.value)} className={inputCls} />
            {errors.interview_at && <span className="text-xs text-rose-600">{errors.interview_at[0]}</span>}</label>
          <label className="block text-sm"><span className="text-slate-600">Interview type</span>
            <select value={f.interview_type} onChange={(e) => set("interview_type", e.target.value)} disabled={!f.interview_at} className={inputCls}>
              {INTERVIEW_TYPES.filter(Boolean).map((t) => <option key={t}>{t}</option>)}</select></label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button disabled={busy || !openJobs.length} className={btnPrimary}>{busy ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
