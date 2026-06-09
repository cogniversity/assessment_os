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

Assessment OS is a full-stack **online assessment and testing platform** with three roles:

| Role | Purpose |
|------|---------|
| **Admin** | Question bank, blueprints, assignments, users, App ID directory, exports |
| **Capability Manager** | Assign assessments, review results, manage candidate profiles |
| **Candidate** | Take timed MCQ tests, view results, download certificates |

Admins define **reusable assessment blueprints** (skill + topics + difficulty mix + timer + pass mark + certificate rules), then assign snapshots to candidates. Each attempt records answers, scores, proctoring events, and webcam photos for review.

**Repository:** [github.com/cogniversity/assessment_os](https://github.com/cogniversity/assessment_os)

---

## Key features

### Assessment design & delivery

- **Question bank** — Categories, topics, skills, and per-skill roles (e.g. Developer, Senior Developer)
- **MCQ types** — Single-select and multi-select with configurable partial-credit scoring
- **Named blueprints** — Reusable templates: difficulty mix, time limit, pass mark, multi-topic pools
- **Dynamic papers** — Questions drawn from the union of selected topics at attempt start
- **Free navigation** — Candidates can move between questions during the test
- **Timers** — Per-assessment time limits with optional no-limit mode

### Online proctoring

- **Consent flow** — Candidates accept proctoring rules before starting (system defaults + per-blueprint instructions)
- **Webcam capture** — Start photo plus optional periodic photos (`proctoringPhotoIntervalMinutes`)
- **Live monitoring HUD** — Camera preview, violation banners, activity log during the test
- **Integrity controls** — Tab-switch detection, fullscreen enforcement, copy/paste/right-click blocking
- **Reviewer UI** — Admin and manager attempt detail pages with photo gallery and event timeline

### Certificates & results

- **PDF certificates** — Issued when score meets pass mark; optional proficiency band and expiry
- **Verification** — Auth-gated certificate verify endpoint with UUID
- **Results export** — CSV and PDF attempt reports
- **Analytics** — Dashboards for admins and capability managers
- **Reattempt requests** — Managers can request retakes; admins approve

### Candidate & workforce profiles

- Staffing fields (country, employee/project/customer, allocation → FTE)
- Admin-defined custom profile fields
- External certificates, remarks, proficiency overrides
- Full audit log on profile and proficiency changes

### Administration & integrations

- **IBM App ID OIDC** — Enterprise login with role mapping (`Admin`, `Capability_Manager`, `Candidate`)
- **Cloud Directory management** — List, search, create, and bulk-import App ID users from the admin UI
- **User provisioning** — Pre-create local candidate profiles before first IBM login
- **XLSX question import** — Offline authoring template with validation, preview, and commit
- **Dev mock auth** — Email-based login when OIDC is not configured

---

## Use cases

- **Technical hiring** — Screen developers with skill- and role-specific MCQ pools
- **Certification programs** — Issue timed, proctored exams with PDF credentials
- **Workforce competency tracking** — Map skills, topics, and proficiency across teams
- **Training providers** — Import questions via spreadsheet, assign blueprints at scale
- **Enterprise deployments** — Docker Compose stack with IBM App ID SSO

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| **Frontend** | React 19, Vite 6, Tailwind CSS 4, TanStack Query, Recharts |
| **Backend** | Node.js 22, Express 5, Prisma ORM, Zod (shared schemas) |
| **Database** | PostgreSQL 17 |
| **Auth** | IBM App ID (OIDC), express-session, role-based access control |
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

Open **http://localhost** (or the port set in `HTTP_PORT`).

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
3. Set in `.env` (and optionally `server/.env` for App ID keys):

   ```env
   OIDC_ISSUER=https://your-region.appid.cloud.ibm.com/oauth/v4/your-tenant-id
   OIDC_CLIENT_ID=your-client-id
   OIDC_CLIENT_SECRET=your-client-secret
   OIDC_CALLBACK_URL=http://localhost:5173/api/auth/callback
   DEV_AUTH_ENABLED=false
   ```

4. **Role mapping:** App ID roles map to app roles by default:
   - `Admin` → Admin
   - `Capability_Manager` → Capability Manager
   - `Candidate` → Candidate

   Override with `APPID_ROLE_ADMIN`, `APPID_ROLE_MANAGER`, `APPID_ROLE_CANDIDATE`. If IBM sends no roles, `ADMIN_EMAILS` and `CAPABILITY_MANAGER_EMAILS` are used as fallback.

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

**Keywords:** skills assessment platform, online proctoring, MCQ testing, technical screening, certification exams, talent evaluation, IBM App ID, React assessment app, PostgreSQL question bank, Docker self-hosted LMS alternative.
