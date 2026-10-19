# Mini ATS

An applicant tracking system for small hiring teams: job openings, candidates, a drag and drop hiring pipeline, search, notes, interview scheduling, CSV import and export, and a metrics dashboard. Built for the EarlyJobs.ai Full Stack Developer Intern assignment.

- Live app: https://earlyjobs-ats-five.vercel.app
- Repository: https://github.com/Shaurya55555/earlyjobs-ats
- Demo video: REPLACE-ME

## Features

**Hiring pipeline**
- Six stages: Applied, Screening, Interview, Offer, Hired, Rejected. Move candidates by drag and drop, the "Move to" dropdown, the detail dialog, or in bulk.
- Stage rules are enforced in both UI and API: Hired is final, and a rejected candidate can only be reopened to Applied or Screening.
- Board moves are optimistic with a 4 second **Undo**, and are flushed if you close the tab inside that window.
- Every move is written to a stage history. Cards show how long a candidate has sat in a stage and flag anyone idle for 7+ days.

**Candidates**
- Add, edit, delete, with per-field validation errors and unique emails.
- 1 to 5 star rating (click to rate), skills, source, experience.
- Notes timeline per candidate, add and delete.
- Interview scheduling (type and date/time) with upcoming interviews on the dashboard.
- Click a skill chip to filter the list by that skill.

**Search, filter, organise**
- Full text search across name, email, phone, role, skills and note text, run in SQL. `%` and `_` are escaped so they search literally.
- Filters: stage (or "active only"), source, minimum rating, skill, idle 7+ days, interview scheduled. Sorting and pagination (25 per page).
- Filters, tab and job selection live in the URL, so a filtered view can be shared or reloaded.
- Select rows for **bulk move** or bulk delete.
- **CSV export** of exactly what the current filters match. **CSV import** with a template, row-level validation and a report of skipped rows and why. Exported cells that start with `=`, `+`, `-` or `@` are neutralised against spreadsheet formula injection.

**Jobs**
- Create jobs, close or reopen them, delete empty ones. Closed jobs cannot receive new candidates, and a job with candidates cannot be deleted. A header selector scopes the whole app (board, list, dashboard) to one job.

**Dashboard**
- Total, active, new this week, hire rate, average days to hire, and a "needs attention" count.
- Applications per day (last 14 days), funnel built from stage history, average time in each stage, by stage, by source, by role.
- Idle candidates and upcoming interviews, each clickable.

**Keyboard**: `/` search, `n` new candidate, `1` to `4` switch tabs, `Esc` closes dialogs.

## Stack

Next.js (App Router, TypeScript), Tailwind CSS, Postgres, Zod.

The data layer picks its database from the environment: with `DATABASE_URL` it uses `pg` against any Postgres (Neon in production). Without it, it runs an embedded Postgres (PGlite), so `npm run dev` needs no setup. Both run the same SQL. The schema is created and seeded with 12 candidates, 5 jobs, notes and history on first start.

## Run locally

```bash
npm install --legacy-peer-deps
npm run dev        # http://localhost:3000
npm test           # 25 tests: stage rules, validation, CSV, and the full API against a real Postgres
```

To use your own database: `DATABASE_URL=postgres://... npm run dev`.

## API

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/candidates` | `q, stage, job_id, skill, min_rating, source, stale, interviews, sort, page, pageSize` |
| POST | `/api/candidates` | 400 with per-field errors, 409 on duplicate email |
| GET, PATCH, DELETE | `/api/candidates/:id` | GET also returns history and notes. PATCH validates stage moves (422 if not allowed) |
| POST, DELETE | `/api/candidates/:id/notes[/:noteId]` | notes timeline |
| POST | `/api/candidates/bulk` | `{ action: "move" or "delete", ids, stage? }`, reports updated and skipped |
| POST | `/api/candidates/import` | `{ rows }`, per-row validation, reports skipped rows |
| GET | `/api/candidates/export` | CSV, same filters as the list |
| GET, POST | `/api/jobs` | |
| PATCH, DELETE | `/api/jobs/:id` | open or close; delete blocked while candidates exist |
| GET | `/api/metrics?job_id=` | dashboard numbers |

## Design notes

- Stage rules live in one pure function (`canMove` in `src/lib/ats.ts`) shared by UI and API, and unit tested.
- One filter builder (`src/lib/queries.ts`) powers the list, the CSV export and the counts, so what you see is what you export.
- The edit form never changes stage. Stage changes go through one path so history and "time in stage" stay correct.
- Funnel and time-in-stage come from `stage_history`, so moving someone forward never shrinks earlier bars and the numbers stay consistent.
- The list ignores out-of-order responses, so fast typing cannot show stale results.
- API tests call the real route handlers against an embedded Postgres, so they cover SQL, validation and status codes without mocks.

## AI usage

I used an AI coding assistant for scaffolding and boilerplate. I reviewed the generated code, made the stage rules and data model decisions, ran the test suite, and exercised the UI by hand before shipping. The API behaviour (validation, duplicate emails, blocked stage moves, search, filters, bulk, import, export) is covered by the test suite.

## What I would add next

Auth and per-recruiter ownership, resume file upload, email reminders for upcoming interviews, an audit log of who changed what, and Playwright end to end tests in CI.
