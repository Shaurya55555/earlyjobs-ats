# Mini ATS

A small applicant tracking system: manage candidates, move them through hiring stages, search and filter, and see dashboard metrics. Built for the EarlyJobs.ai Full Stack Developer Intern assignment.

- Live app: https://REPLACE-ME.vercel.app
- Repository: https://github.com/Shaurya55555/earlyjobs-ats
- Demo video: REPLACE-ME

## Features

- **Candidates**: add, edit, delete. Fields: name, email (unique), phone, role, skills, experience, source, notes.
- **Hiring stages**: Applied, Screening, Interview, Offer, Hired, Rejected. Move candidates by drag and drop on the pipeline board, the "Move to" dropdown, or the detail dialog. Invalid moves (anything out of Hired, reopening a rejected candidate straight to Offer) are blocked in both the UI and the API.
- **Stage history**: every move is stored with a timestamp and shown per candidate.
- **Search and filters**: free text over name, email, role, skills and notes, plus stage and role filters and sorting. Done in SQL on the server (`ILIKE`, array `unnest`), not in the browser.
- **Dashboard**: total, active, new this week, hire rate, average experience, candidates by stage, a funnel built from stage history (who ever reached each stage), and breakdowns by source and role.

## Stack

Next.js (App Router, TypeScript), Tailwind CSS, Postgres, Zod for validation.

The data layer picks its database from the environment: with `DATABASE_URL` set it uses `pg` against any Postgres (Neon in production). With no `DATABASE_URL` it runs an embedded Postgres (PGlite), so `npm run dev` works with zero setup. Both run the same SQL. The schema is created and seeded with 8 sample candidates on first start.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests for validation and stage rules
```

To use a real database: `DATABASE_URL=postgres://... npm run dev`.

## API

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/candidates?q=&stage=&role=&skill=&sort=` | search, filter, sort |
| POST | `/api/candidates` | 400 with per-field errors, 409 on duplicate email |
| GET | `/api/candidates/:id` | candidate plus stage history |
| PATCH | `/api/candidates/:id` | partial update; stage changes validated and logged |
| DELETE | `/api/candidates/:id` | |
| GET | `/api/metrics` | dashboard numbers |

## Design notes

- Stage rules live in one pure function (`canMove` in `src/lib/ats.ts`) shared by the UI and the API, and unit tested.
- The edit form never changes stage; stage changes go through one path so history always stays correct.
- Drag and drop updates the board optimistically and rolls back if the API rejects the move.
- Funnel numbers come from `stage_history`, so moving someone forward never shrinks the earlier bars.

## AI usage

I used an AI coding assistant to speed up scaffolding and boilerplate. I reviewed the code, ran the unit tests, and exercised the API and UI by hand (validation errors, duplicate email, blocked stage moves, search and filters) before shipping.

## What I would add next

Auth and per-recruiter ownership, resume upload, pagination for large lists, interview notes and scheduling, and integration tests against a real Postgres in CI.
