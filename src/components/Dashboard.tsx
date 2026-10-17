"use client";

import { STAGES, STALE_DAYS, type Stage } from "@/lib/ats";
import { fmtDateTime, relativeDay } from "@/lib/client";
import { Avatar, STAGE_BAR, StageBadge } from "./ui";

export type Metrics = {
  total: number; newThisWeek: number; avgExperience: number; avgRating: number; active: number;
  hireRate: number | null; avgDaysToHire: number | null;
  byStage: Record<string, number>;
  funnel: { stage: Stage; reached: number }[];
  timeInStage: { stage: Stage; days: number }[];
  perDay: { d: string; n: number }[];
  bySource: { source: string; n: number }[];
  byRole: { role: string; n: number }[];
  stuck: { id: number; name: string; role: string; stage: Stage; days: number }[];
  stuckCount: number;
  upcoming: { id: number; name: string; role: string; interview_at: string; interview_type: string }[];
};

function Card({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-xs text-slate-500">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

function Stat({ label, value, hint, onClick }: { label: string; value: string | number; hint?: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </>
  );
  const cls = "rounded-xl border border-slate-200 bg-white p-4 text-left";
  return onClick ? <button onClick={onClick} className={`${cls} hover:border-indigo-300 hover:shadow-sm`}>{body}</button> : <div className={cls}>{body}</div>;
}

function Bars({ rows }: { rows: { label: string; n: number; color?: string; suffix?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-slate-600" title={r.label}>{r.label}</span>
          <div className="h-3 flex-1 rounded bg-slate-100">
            <div className={`h-3 rounded ${r.color ?? "bg-indigo-500"}`} style={{ width: `${(r.n / max) * 100}%` }} />
          </div>
          <span className="w-14 text-right font-medium tabular-nums">{r.n}{r.suffix}</span>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({ data }: { data: { d: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((x) => x.n));
  const W = 560, H = 140, pad = 22, bw = (W - pad * 2) / data.length;
  const total = data.reduce((a, b) => a + b.n, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Applications per day for the last 14 days, ${total} in total`}>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={pad} x2={W - pad} y1={H - 24 - t * (H - 44)} y2={H - 24 - t * (H - 44)} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <text x={pad - 6} y={H - 24 - (H - 44) + 4} textAnchor="end" fontSize="10" fill="#64748b">{max}</text>
        <text x={pad - 6} y={H - 24 + 4} textAnchor="end" fontSize="10" fill="#64748b">0</text>
        {data.map((x, i) => {
          const h = (x.n / max) * (H - 44);
          const date = new Date(x.d + "T00:00:00");
          return (
            <g key={x.d}>
              <title>{`${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${x.n} application${x.n === 1 ? "" : "s"}`}</title>
              <rect x={pad + i * bw + 3} y={H - 24 - h} width={bw - 6} height={Math.max(h, x.n ? 2 : 0)} rx="3" fill="#6366f1" />
              {i % 2 === 0 && <text x={pad + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#64748b">{date.getDate()}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-slate-500">{total} application{total === 1 ? "" : "s"} in the last 14 days</figcaption>
    </figure>
  );
}

export default function Dashboard({ m, onOpen, onShowStale, onShowInterviews }: {
  m: Metrics; onOpen: (id: number) => void; onShowStale: () => void; onShowInterviews: () => void;
}) {
  const first = m.funnel[0]?.reached || 0;
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total candidates" value={m.total} />
        <Stat label="Active" value={m.active} hint="not hired or rejected" />
        <Stat label="New this week" value={m.newThisWeek} />
        <Stat label="Hire rate" value={m.hireRate === null ? "n/a" : `${m.hireRate}%`} hint="hired / (hired + rejected)" />
        <Stat label="Days to hire" value={m.avgDaysToHire === null ? "n/a" : m.avgDaysToHire} hint="application to hired, avg" />
        <Stat label="Needs attention" value={m.stuckCount} hint={`no movement for ${STALE_DAYS}+ days`} onClick={m.stuckCount ? onShowStale : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Applications, last 14 days"><DailyChart data={m.perDay} /></Card>
        <Card title="Funnel" hint="Candidates who ever reached each stage, and share of all applicants.">
          <Bars rows={m.funnel.map((f) => ({ label: `${f.stage} (${first ? Math.round((f.reached / first) * 100) : 0}%)`, n: f.reached, color: STAGE_BAR[f.stage] }))} />
        </Card>

        <Card title="Needs attention" hint={`Active candidates with no stage change for ${STALE_DAYS}+ days.`}>
          {m.stuck.length === 0 ? <p className="text-sm text-slate-500">Nobody is stuck. Nice.</p> : (
            <ul className="divide-y divide-slate-100">
              {m.stuck.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onOpen(c.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
                    <Avatar name={c.name} size={28} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span><span className="block truncate text-xs text-slate-500">{c.role}</span></span>
                    <StageBadge stage={c.stage} />
                    <span className="w-16 text-right text-xs font-medium text-rose-600">{c.days}d</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {m.stuckCount > m.stuck.length && <button onClick={onShowStale} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">View all {m.stuckCount}</button>}
        </Card>
        <Card title="Upcoming interviews" hint="Next scheduled interviews.">
          {m.upcoming.length === 0 ? <p className="text-sm text-slate-500">No interviews scheduled.</p> : (
            <ul className="divide-y divide-slate-100">
              {m.upcoming.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onOpen(c.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
                    <Avatar name={c.name} size={28} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span><span className="block truncate text-xs text-slate-500">{c.interview_type || "Interview"} · {c.role}</span></span>
                    <span className="text-right text-xs"><span className="block font-medium">{fmtDateTime(c.interview_at)}</span><span className="text-slate-500">{relativeDay(c.interview_at)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={onShowInterviews} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">See all scheduled</button>
        </Card>

        <Card title="Candidates by stage"><Bars rows={STAGES.map((s) => ({ label: s, n: m.byStage[s] ?? 0, color: STAGE_BAR[s] }))} /></Card>
        <Card title="Average time in stage" hint="Days candidates spent in a stage before moving on.">
          <Bars rows={m.timeInStage.map((t) => ({ label: t.stage, n: t.days, suffix: "d", color: STAGE_BAR[t.stage] }))} />
        </Card>
        <Card title="By source"><Bars rows={m.bySource.map((s) => ({ label: s.source, n: s.n }))} /></Card>
        <Card title="By role"><Bars rows={m.byRole.map((s) => ({ label: s.role, n: s.n }))} /></Card>
      </div>
    </section>
  );
}
