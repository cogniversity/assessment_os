# Assessment OS

**Open-source skills assessment platform** for hiring, certification, and talent evaluation. Build named assessment blueprints, assign MCQ tests to candidates, enforce **online proctoring** with webcam capture, issue **PDF certificates**, and review results with analytics — backed by **React**, **Node.js**, **PostgreSQL**, and **Docker**.

Use it for technical screening, competency testing, training certification, or workforce skills tracking. Supports **IBM App ID** (OIDC) for enterprise SSO, or built-in dev login for local development.

[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![IBM App ID](https://img.shields.io/badge/Auth-IBM_App_ID_(OIDC)-052FAD?logo=ibm&logoColor=white)](https://www.ibm.com/products/app-id)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of contents

- [Overview](#overview)
- [Key features](#key-features)
- [Use cases](#use-cases)
- [Tech stack](#tech-stack)
- [Quick start (local development)](#quick-start-local-development)
- [Docker deployment](#docker-deployment)
- [IBM App ID setup](#ibm-app-id-setup)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Documentation](#documentation)

---

## Overview

Assessment OS is a full-stack **online assessment and testing platform** with three access roles:

| Role | Purpose |
|------|---------|
| **Admin** | Question bank, skills/concepts, blueprints, assignments, users, App ID directory, exports |
| **Capability Manager** | Assign assessments, review results, manage candidate profiles and proficiencies |
| **Candidate** | Take timed MCQ tests, view results, download certificates and capability reports |

Users may hold **multiple roles** (e.g. manager + candidate). A header **role switcher** sets the active context; the default is the highest privilege (`admin` → `capability_manager` → `candidate`).

Admins define **reusable assessment blueprints** (skill + topics + difficulty mix + timer + pass mark + certificate and capability-report rules), then assign snapshots to candidates. Each attempt records answers, scores, proctoring events, and webcam photos for review.

**Repository:** [github.com/cogniversity/assessment_os](https://github.com/cogniversity/assessment_os)

---

## Key features

### Assessment design & delivery

- **Question bank** — Categories, topics, skills, per-skill **roles** (e.g. Associate Developer, Senior Developer), and optional **concepts** per skill
- **Question tagging** — Tag questions with skill roles and concepts; inline edit, bulk assign, filter by concept, bulk publish/draft/delete
- **MCQ types** — Single-select and multi-select with configurable partial-credit scoring
- **Named blueprints** — Reusable templates: difficulty mix, time limit, pass mark, multi-topic pools, certificate and capability-report options
- **Dynamic papers** — Questions drawn from the union of selected topics at attempt start
- **Free navigation** — Candidates can move between questions during the test
- **Timers** — Per-assessment time limits with optional no-limit mode
- **XLSX question import** — Spreadsheet template with `skillRoleCodes` and optional `conceptCodes`; validate, preview, and commit

### Online proctoring

- **Consent flow** — Candidates accept proctoring rules before starting (system defaults + per-blueprint instructions)
- **Webcam capture** — Start photo plus optional periodic photos (`proctoringPhotoIntervalMinutes`)
- **Live monitoring HUD** — Camera preview, violation banners, activity log during the test
- **Integrity controls** — Tab-switch detection, fullscreen enforcement, copy/paste/right-click blocking
- **Reviewer UI** — Admin and manager attempt detail pages with photo gallery and event timeline

### Capability reports & proficiency

- **Concept-level reports** — When enabled on a blueprint/assignment, completed attempts generate a capability report classifying each tagged concept as **strength**, **neutral**, or **gap** (configurable thresholds)
- **In-app breakdown** — Attempt detail and candidate result pages show a concept table; PDF download for managers and candidates (when shared)
- **Skill proficiencies** — Per skill + role proficiency on candidate profiles, updated from passing attempts; managers can override with audit trail

### Certificates & results

- **PDF certificates** — Issued when score meets pass mark; optional proficiency band and expiry
- **Verification** — Auth-gated `/verify/:certNumber` page; PDF footer links use `CLIENT_URL` (not the API port)
- **Results export** — CSV (one row per attempt) and PDF attempt reports; separate **concept breakdown CSV** (one row per attempt × concept)
- **Analytics** — Pass rates by topic, skill role, and blueprint; blueprint summary; concept trends aggregated from capability reports
- **Reattempt requests** — Managers can request retakes; admins approve

### Candidate & workforce profiles

- Staffing fields (country, employee/project/customer, allocation → FTE)
- Admin-defined custom profile fields
- **Skill proficiencies** and shared **capability report** PDFs on the candidate profile
- External certificates, remarks, proficiency overrides
- Full audit log on profile and proficiency changes

### Administration & integrations

- **IBM App ID OIDC** — Enterprise login; App ID roles map to app `User.roles[]` (`Admin`, `Capability_Manager`, `Candidate`)
- **Multi-role RBAC** — Users with several roles switch active context in the header; admins assign multiple roles on the Users page
- **Cloud Directory management** — List, search, create, and bulk-import App ID users from the admin UI
- **User provisioning** — Pre-create local candidate profiles before first IBM login
- **Dev mock auth** — Email-based login when OIDC is not configured

---

## Use cases

- **Technical hiring** — Screen developers with skill- and role-specific MCQ pools
- **Certification programs** — Issue timed, proctored exams with PDF credentials
- **Workforce competency tracking** — Map skills, topics, concepts, proficiencies, and capability gaps across teams
- **Training providers** — Import questions via spreadsheet, assign blueprints at scale
- **Enterprise deployments** — Docker Compose stack with IBM App ID SSO

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| **Frontend** | React 19, Vite 6, Tailwind CSS 4, TanStack Query, Recharts |
| **Backend** | Node.js 22, Express 5, Prisma ORM, Zod (shared schemas) |
| **Database** | PostgreSQL 17 |
| **Auth** | IBM App ID (OIDC), express-session, multi-role RBAC with active-role switching |
| **Documents** | PDFKit (certificates, reports), XLSX import/export |
| **Deployment** | Docker Compose; pre-built images on Docker Hub (`cogniverse/assessment-os-api`, `cogniverse/assessment-os-web`) |

Monorepo layout: `client/` (SPA), `server/` (API), `packages/shared/` (types and validation).

---

## Quick start (local development)

### Prerequisites

- [Node.js 22 LTS](https://nodejs.org/)
- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL)

### Setup

```bash
# 1. Environment files
cp .env.example .env
cp compose.env.example compose.env

# 2. Start PostgreSQL
npm run db:up

# 3. Install dependencies
npm install

# 4. Build shared package
npm run build -w packages/shared

# 5. Migrate and seed the database
npm run db:migrate
npm run db:seed

# 6. Start API + SPA
npm run dev
```

| Service | URL |
|---------|-----|
| **Web app** | http://localhost:5173 |
| **API** | http://localhost:3001 |

### Dev login accounts

When `DEV_AUTH_ENABLED=true` (default in `.env.example`), use these seeded accounts:

| Email | Role |
|-------|------|
| admin@example.com | Admin |
| manager@example.com | Capability Manager |
| manager2@example.com | Capability Manager |
| candidate@example.com | Candidate |
| alice@example.com … david@example.com | Candidates |

---

## Docker deployment

Run the full stack (PostgreSQL, API, web) with pre-built images:

```bash
cp compose.env.example compose.env
# Edit compose.env — set SESSION_SECRET, passwords, OIDC credentials
npm run docker:up
```

Open **http://localhost** (or the port set in `HTTP_PORT`). If `CONTEXT_ROOT` is set (e.g. `growth`), open **http://localhost/growth/** instead.

### Subpath deployment (`CONTEXT_ROOT`)

When the app is served behind nginx under a subpath (e.g. `/growth/`):

```env
CONTEXT_ROOT=growth
CLIENT_URL=https://your-host
SERVER_URL=https://your-host
OIDC_CALLBACK_URL=https://your-host/growth/api/auth/callback
```

- `CLIENT_URL` / `SERVER_URL` stay **origin-only** (no path); code appends `CONTEXT_ROOT`.
- Rebuild the **web** image with the same `CONTEXT_ROOT` (`VITE_CONTEXT_ROOT` is baked in at build time).
- Register the full OIDC callback URL (including the subpath) in IBM App ID.

Local dev with subpath: `CONTEXT_ROOT=growth VITE_CONTEXT_ROOT=growth npm run dev`, then open `http://localhost:5173/growth/`.

| Task | Command |
|------|---------|
| Stop stack | `npm run docker:down` |
| Wipe data and re-seed | `npm run docker:reset` |
| Build images locally | `npm run docker:build` |

**Production overrides:** copy `docker-compose.override.example.yml` to `docker-compose.override.yml` for HTTPS URLs and secure cookies.

After the first successful start, set `RUN_DB_SEED=false` in `compose.env` so restarts do not re-seed.

Full details: **[docs/DOCKER_HUB.md](docs/DOCKER_HUB.md)**

Docker Hub images:

- `cogniverse/assessment-os-api`
- `cogniverse/assessment-os-web`

---

## IBM App ID setup

Assessment OS integrates with **IBM Cloud App ID** for OIDC single sign-on and Cloud Directory user management.

### OIDC login

1. Create an IBM Cloud App ID instance.
2. Add redirect URI:
   - **Local dev:** `http://localhost:5173/api/auth/callback` (must match the browser URL — Vite dev server)
   - **Docker/production:** `https://your-host/api/auth/callback`
   - **With `CONTEXT_ROOT=growth`:** `https://your-host/growth/api/auth/callback` (and `http://localhost:5173/growth/api/auth/callback` for local subpath dev)
3. Set in `.env` (and optionally `server/.env` for App ID keys):

   ```env
   OIDC_ISSUER=https://your-region.appid.cloud.ibm.com/oauth/v4/your-tenant-id
   OIDC_CLIENT_ID=your-client-id
   OIDC_CLIENT_SECRET=your-client-secret
   OIDC_CALLBACK_URL=http://localhost:5173/api/auth/callback
   DEV_AUTH_ENABLED=false
   ```

4. **Role mapping:** App ID roles merge into `User.roles[]` by default (users can hold more than one):
   - `Admin` → Admin
   - `Capability_Manager` → Capability Manager
   - `Candidate` → Candidate

   Override with `APPID_ROLE_ADMIN`, `APPID_ROLE_MANAGER`, `APPID_ROLE_CANDIDATE`. If IBM sends no roles, `ADMIN_EMAILS` and `CAPABILITY_MANAGER_EMAILS` are used as fallback. After login, use the header role switcher when multiple roles apply.

5. Optional: embed roles in OIDC tokens in App ID ([customizing tokens](https://cloud.ibm.com/docs/appid?topic=appid-customizing-tokens)).

### Cloud Directory (admin UI)

For the **App ID Users** admin page (list, search, create, bulk import):

```env
APPID_IAM_APIKEY=your-ibm-cloud-api-key
APPID_TENANT_ID=your-appid-tenant-id
```

The API key needs **Manager** access on the App ID instance (IBM Cloud → IAM → Access policies).

---

## Environment variables

| File | Used for |
|------|----------|
| `.env` | Local `npm run dev` (API loads root `.env` + `server/.env`) |
| `compose.env` | Docker Compose (`npm run docker:up`, `db:up`) |

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session signing (required in production) |
| `CLIENT_URL` | Public browser origin for user-facing links (OIDC redirects, certificate verify URLs on PDFs). Dev: `http://localhost:5173` |
| `SERVER_URL` | API origin for internal/server use — not used for links printed on PDFs. Dev: `http://localhost:3001` |
| `CONTEXT_ROOT` | Optional nginx subpath segment (e.g. `growth` → `/growth/`) |
| `OIDC_*` | IBM App ID / OIDC provider |
| `ADMIN_EMAILS`, `CAPABILITY_MANAGER_EMAILS` | RBAC email allowlists |
| `APPID_IAM_APIKEY`, `APPID_TENANT_ID` | Cloud Directory management API |
| `DEV_AUTH_ENABLED` | Mock email login (dev only) |
| `RUN_DB_SEED` | Seed database on Docker API start |
| `PHOTO_STORAGE_PATH` | Proctoring photo upload directory |

See `.env.example` and `compose.env.example` for the full list.

---

## Project structure

```
assessment_os/
├── client/              # React 19 SPA (Vite, Tailwind)
│   └── src/components/proctoring/   # Proctoring HUD, consent, hooks
├── server/              # Express 5 API + Prisma
│   ├── prisma/          # Schema, migrations, seed
│   └── src/services/    # Certificates, profiles, assignments, audit
├── packages/shared/     # Zod schemas, enums, proctoring constants
├── docs/
│   ├── PRODUCT_PLAN.md  # Data model, API reference, changelog
│   └── DOCKER_HUB.md    # Container deployment guide
├── docker-compose.yml
├── compose.env.example
├── docker-compose.override.example.yml
├── scripts/             # Docker build helpers
└── archive/             # Optional local-build compose file
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API (:3001) and SPA (:5173) |
| `npm run build` | Build shared, server, and client |
| `npm run db:up` | Start PostgreSQL container only |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed sample data |
| `npm run docker:up` | Start full Docker stack (Hub images) |
| `npm run docker:down` | Stop Docker stack |
| `npm run docker:reset` | Wipe `data/` volumes and restart fresh |
| `npm run docker:build` | Build API + web images locally |

---

## Documentation

| Document | Contents |
|----------|----------|
| **[docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md)** | Data model (category → topic → skill → blueprint), scoring rules, proctoring spec, API reference, implementation status, changelog |
| **[docs/DOCKER_HUB.md](docs/DOCKER_HUB.md)** | Docker Hub images, compose configuration, CI publish workflow |

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Cogniverse

---

**Keywords:** skills assessment platform, online proctoring, MCQ testing, technical screening, certification exams, talent evaluation, capability reports, skills gap analysis, IBM App ID, React assessment app, PostgreSQL question bank, Docker self-hosted LMS alternative.
