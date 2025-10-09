# NestJS Modular API

A strongly typed, task‑friendly NestJS backend scaffolded for rapid module delivery.

This README is the primary onboarding doc. It helps you spin up the environment, understand the architecture, and ship new features safely. A companion Vue‑based endpoint explorer lives under `apps/frontend` for local‑only QA.

---

## TL;DR

1. Install deps (root):
   ```bash
   pnpm install
   ```
2. Run quality gates:
   ```bash
   pnpm lint
   pnpm build
   pnpm test
   pnpm test:e2e   # optional locally; gated in CI
   ```
3. Launch API for manual testing:
   ```bash
   pnpm start:dev
   # Health: http://localhost:3000/health and /api/health/ping
   ```
4. Update docs when you add features (this README + module docs).
5. Prefer strict typing, thin controllers, deterministic tests.

---

## Table of Contents

- Platform Snapshot
- Repository Map
- Runtime & Tooling
- Configuration & Environment
- Key NPM Scripts
- Architecture Overview
- Module & Endpoint Catalog
- Testing & Quality Strategy
- Development Playbook
- Mongo & Docker Infrastructure
- CI Pipeline Expectations
- Appendix: DTO/Domain Guidelines

---

## Platform Snapshot

| Area            | Details |
| --------------- | ------- |
| Runtime         | Node.js 20.x |
| Framework       | NestJS 11.x (REST controllers with DTO validation) |
| Package manager | pnpm |
| Language        | TypeScript (strict) |
| Lint/Format     | ESLint 9 + Prettier 3 |
| Testing         | Jest 30 (unit + e2e) |
| Data            | MongoDB (`mongodb` driver; Docker bootstrap helpers) |
| Container       | Docker integration via `dockerode` |

---

## Repository Map

```
.
├─ src/
│  ├─ main.ts                 # App entry (global prefix/pipes)
│  ├─ app.module.ts           # Root module wiring
│  ├─ health.controller.ts    # Legacy simple health endpoint
│  ├─ lib/                    # Shared helpers (errors, utils, types)
│  ├─ infra/                  # Infrastructure (Mongo bootstrap, config)
│  └─ modules/                # Feature modules
│     ├─ health/              # /api/health
│     ├─ fields/              # Field registry CRUD
│     ├─ datatypes/           # Datatype schema registry & lifecycle
│     ├─ discovery/           # Schema/relations discovery
│     ├─ entities/            # Entity CRUD + query/validate
│     ├─ hooks/               # Hook engine + manifest
│     ├─ docker/              # Docker client abstractions
│     └─ mongodb/             # Mongo bridge & collections
├─ apps/
│  └─ frontend/               # Vue 3 + Vite endpoint explorer (local)
├─ test/                      # Jest config + e2e helpers/tests
├─ .env*, .env.example        # Runtime configuration examples
├─ eslint.config.mjs          # ESLint config
├─ nest-cli.json, tsconfig*.json
└─ package.json               # Scripts & dependency manifest
```

Use this structure when adding new modules—mirror existing patterns and co‑locate tests next to implementation where feasible.

---

## Runtime & Tooling

- Use `pnpm nest <command>` for scaffolding if helpful; manual file creation keeps barrel files tidy.
- TypeScript path aliases live in `tsconfig.json` (e.g., `@lib/*`). Prefer them over long relative paths.
- Validation: All incoming DTOs use `class-validator`; a global `ValidationPipe` is configured in `main.ts`.

---

## Configuration & Environment

1. Copy `.env.example` to `.env` and adjust values as needed.
2. `.env.test` or inline `process.env` values seed deterministic tests when necessary.
3. Important variables:
   - `PORT` (default `3000`)
   - Mongo infra (see `src/infra/mongo/mongo.config.ts`):
     - `MONGO_AUTO_START` (default `true`) — auto‑run local Mongo in Docker
     - `MONGO_IMAGE` (default `mongo:7`)
     - `MONGO_CONTAINER_NAME` (default `app-mongo`)
     - `MONGO_HOST` (default `127.0.0.1`)
     - `MONGO_PORT` (default `27017`)
     - `MONGO_ROOT_USERNAME` (default `modapi_root`)
     - `MONGO_ROOT_PASSWORD` (default `modapi_root_dev`)
   - Datatype bootstrap:
     - `DATATYPES_BOOTSTRAP` (default `1`) — set `0`/`false` to skip; always skipped when `CI=1`
     - `DATATYPES_SEEDS_DIR` — optional path for filesystem datatype seeds (JSON files) to augment/override `src/Data/*.seeds.json`
   - Test helpers:
     - `DOCKER_E2E` — enable Docker‑dependent e2e helpers when set

Configuration is loaded via `@nestjs/config` where applicable; inject `ConfigService` for typed settings.

---

## Key NPM Scripts

| Command             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `pnpm lint`         | ESLint with auto‑fix                     |
| `pnpm build`        | Compile TypeScript (`nest build`)        |
| `pnpm start:dev`    | Start API in watch mode                  |
| `pnpm start`        | Start API once                           |
| `pnpm start:prod`   | Run compiled app (`node dist/main`)      |
| `pnpm test`         | Unit tests                               |
| `pnpm test:watch`   | Unit tests in watch mode                 |
| `pnpm test:cov`     | Coverage                                 |
| `pnpm test:e2e`     | e2e tests (`test/jest-e2e.json`)         |
| `pnpm format`       | Prettier write                           |
| `pnpm format:check` | Prettier check                           |

---

## Architecture Overview

- Thin controllers, typed DTOs, and services encapsulate logic.
- Shared types/utilities live under `src/lib` with small, composable helpers.
- Infrastructure for Mongo (Docker auto‑start, readiness checks) lives under `src/infra/mongo`.
- Feature modules in `src/modules/*` provide clear ownership and test seams.

---

## Module & Endpoint Catalog

- Health
  - `GET /health` (legacy simple check)
  - `GET /api/health/ping`, `GET /api/health/info`
- Datatypes (`/datatypes`)
  - `GET /list`, `GET /get`
  - `POST /create`, `POST /add-field`, `POST /update-field`, `POST /remove-field`
  - `POST /publish`, `POST /unpublish`
- Fields (`/fields`)
  - `GET /list`, `GET /get`
  - `POST /create`, `POST /update`, `POST /delete`
- Entities
  - `GET /entities/:type/datatype`, `GET /entities/:type/list`, `GET /entities/:type/get`
  - `POST /entities/:type/create`, `POST /entities/:type/update`, `POST /entities/:type/delete`
  - `GET /entities/query`, `POST /entities/validate`
- Discovery (`/discovery`)
  - `GET /manifest`, `GET /entities/:type/schema`, `GET /entities/:type/relations`
- Hooks (`/hooks`)
  - `GET /manifest`

See controllers in `src/modules/**` for exact DTOs and responses.

---

## Testing & Quality Strategy

- Unit tests with Jest target services and utilities.
- e2e tests run against the Nest app; some suites require Docker and Mongo.
- Linting and formatting are enforced via ESLint/Prettier.

---

## Development Playbook

- Add modules under `src/modules/<name>` with `*.module.ts`, controller(s), service(s), and `dto/`, `tests/` folders.
- Keep controllers slim; push business logic into services.
- Validate all inputs with DTOs + `class-validator`.
- Extend shared types/utilities thoughtfully; avoid large helpers.

---

## Mongo & Docker Infrastructure

- When `MONGO_AUTO_START` is enabled, the app orchestrates a local Mongo container using `dockerode` with sane defaults (`mongo:7`, container `app-mongo`).
- Readiness checks ensure the port is available before consumers use the DB.
- `DATATYPES_BOOTSTRAP` seeds baseline datatypes and indexes on startup (skipped in CI or when disabled by env). `DATATYPES_SEEDS_DIR` can provide filesystem seeds for local workflows.

---

## CI Pipeline Expectations

- Lint, build, unit tests, and e2e must pass.
- Do not commit secrets; use CI secrets or local `.env` only.
- Update this README and relevant module docs as part of feature work.

---

## Appendix: DTO/Domain Guidelines

- Prefer explicit DTOs with decorators over implicit shapes.
- Keep domain types in `src/lib/types` when cross‑module reuse is intended.
- Strive for deterministic tests (fixed seeds, stable IDs, no time flakiness).

---

## Frontend Explorer

For a local endpoint explorer, see `apps/frontend/README.md`. It runs against your local API and is not meant for deployment.

