"use client";

import { useState } from "react";
import { parseCsv } from "@/lib/ats";
import { api } from "@/lib/client";
import { Modal, btnGhost, btnPrimary } from "./ui";

const TEMPLATE = "name,email,role,phone,skills,experience_years,source,stage\nJane Doe,jane@example.com,Frontend Engineer,+91 98000 00000,React; TypeScript,2,LinkedIn,Applied\n";

export default function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: { row: number; reason: string }[] } | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(""); setRows(null); setResult(null); setFileName(file.name);
    if (file.size > 1_000_000) return setError("File is too large (limit 1 MB).");
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) return setError("The file needs a header row and at least one candidate.");
    const header = parsed[0].map((h) => h.trim().toLowerCase());
    for (const need of ["name", "email", "role"]) if (!header.includes(need)) return setError(`Missing required column: ${need}`);
    const objs = parsed.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
    if (objs.length > 500) return setError("Import at most 500 rows at a time.");
    setRows(objs);
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; skipped: { row: number; reason: string }[] }>("/api/candidates/import", { method: "POST", body: JSON.stringify({ rows }) });
      setResult(r);
      if (!r.skipped.length) onDone(`Imported ${r.created} candidates`);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <Modal title="Import candidates from CSV" onClose={() => (result?.created ? onDone(`Imported ${result.created} candidates`) : onClose())}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">Required columns: <code>name</code>, <code>email</code>, <code>role</code> (must match an open job title). Optional: phone, skills (separate with ;), experience_years, source, stage.
          {" "}<a className="text-indigo-600 underline" download="candidates-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}>Download template</a></p>
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm" />
        {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}
        {rows && !result && <p>{fileName}: <b>{rows.length}</b> row{rows.length === 1 ? "" : "s"} ready to import. Invalid rows are skipped and listed afterwards.</p>}
        {result && (
          <div>
            <p className="font-medium text-emerald-700">Imported {result.created} candidate{result.created === 1 ? "" : "s"}.</p>
            {result.skipped.length > 0 && (
              <>
                <p className="mt-2 font-medium text-amber-700">Skipped {result.skipped.length}:</p>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-slate-600">{result.skipped.map((s) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}</ul>
              </>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={() => (result?.created ? onDone(`Imported ${result.created} candidates`) : onClose())}>{result ? "Done" : "Cancel"}</button>
          {!result && <button className={btnPrimary} disabled={!rows || busy} onClick={run}>{busy ? "Importing..." : "Import"}</button>}
        </div>
      </div>
    </Modal>
  );
}
