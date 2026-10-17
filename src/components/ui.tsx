"use client";

import { useEffect } from "react";
import type { Stage } from "@/lib/ats";

export const STAGE_COLOR: Record<Stage, string> = {
  Applied: "bg-slate-100 text-slate-700 border-slate-300",
  Screening: "bg-sky-100 text-sky-800 border-sky-300",
  Interview: "bg-violet-100 text-violet-800 border-violet-300",
  Offer: "bg-amber-100 text-amber-800 border-amber-300",
  Hired: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Rejected: "bg-rose-100 text-rose-800 border-rose-300",
};

export const STAGE_BAR: Record<Stage, string> = {
  Applied: "bg-slate-400",
  Screening: "bg-sky-500",
  Interview: "bg-violet-500",
  Offer: "bg-amber-500",
  Hired: "bg-emerald-500",
  Rejected: "bg-rose-400",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[stage]}`}>{stage}</span>;
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${h} 55% 45%)` }}
    >
      {initials}
    </span>
  );
}

export function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label: string }) {
  return (
    <span role={onChange ? "radiogroup" : "img"} aria-label={`${label}: ${value} of 5`} className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <span className={n <= value ? "text-amber-400" : "text-slate-300"}>★</span>
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n === value ? 0 : n)}
            className="px-0.5 text-lg leading-none hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n} className="text-sm leading-none">{star}</span>
        );
      })}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export const inputCls = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
export const btnPrimary = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
