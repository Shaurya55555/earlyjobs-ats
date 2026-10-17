"use client";

import { useState } from "react";
import type { Job } from "@/lib/ats";
import { api, type ApiError } from "@/lib/client";
import { btnPrimary, inputCls } from "./ui";

export default function Jobs({ jobs, onChanged, onViewCandidates }: {
  jobs: Job[]; onChanged: (msg: string) => void; onViewCandidates: (jobId: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [location, setLocation] = useState("Bengaluru");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await api("/api/jobs", { method: "POST", body: JSON.stringify({ title, department, location }) });
      setTitle(""); onChanged("Job created");
    } catch (err) { setErrors((err as ApiError).fields ?? { title: [(err as Error).message] }); }
  }
  async function setStatus(j: Job, status: "Open" | "Closed") {
    await api(`/api/jobs/${j.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    onChanged(`${j.title} ${status === "Open" ? "reopened" : "closed"}`);
  }
  async function remove(j: Job) {
    if (!window.confirm(`Delete the job "${j.title}"?`)) return;
    try { await api(`/api/jobs/${j.id}`, { method: "DELETE" }); onChanged("Job deleted"); }
    catch (err) { onChanged((err as Error).message); }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4" noValidate>
        <label className="min-w-48 flex-1 text-sm"><span className="text-slate-600">New job title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} className={inputCls} placeholder="e.g. DevOps Engineer" />
          {errors.title && <span className="text-xs text-rose-600">{errors.title[0]}</span>}</label>
        <label className="text-sm"><span className="text-slate-600">Department</span><input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls} /></label>
        <label className="text-sm"><span className="text-slate-600">Location</span><input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} /></label>
        <button className={btnPrimary}>Create job</button>
      </form>

      <ul className="grid gap-3 md:grid-cols-2">
        {jobs.map((j) => (
          <li key={j.id} className={`rounded-xl border bg-white p-4 ${j.status === "Closed" ? "border-slate-200 opacity-70" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{j.title}</div><div className="text-xs text-slate-500">{j.department} · {j.location}</div></div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${j.status === "Open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{j.status}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <button onClick={() => onViewCandidates(j.id)} className="text-indigo-600 hover:underline">{j.candidates} candidate{j.candidates === 1 ? "" : "s"}</button>
              <span className="flex gap-3 text-xs">
                <button onClick={() => setStatus(j, j.status === "Open" ? "Closed" : "Open")} className="text-slate-600 hover:underline">{j.status === "Open" ? "Close" : "Reopen"}</button>
                <button onClick={() => remove(j)} className="text-rose-600 hover:underline">Delete</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
