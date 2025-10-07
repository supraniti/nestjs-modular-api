# NestJS Modular API

A strongly typed, task-friendly NestJS backend scaffolded for rapid module delivery.
This README doubles as the onboarding prompt for automation agents: follow it to
spin up the environment, understand the architecture, and ship new features safely.

---

## 📌 TL;DR (Agents Start Here)

1. **Install deps:** `pnpm install`
2. **Run quality gates (CI parity):**
   ```bash
   pnpm lint
   pnpm build
   pnpm test
   pnpm run test:e2e   # optional locally; gated in CI
   ```
3. **Launch API for manual testing:** `pnpm start:dev` → http://localhost:3000/api/health
4. **Update docs:** Any feature work must append to this README and relevant module docs.
5. **When in doubt:** prefer strict typing, thin controllers, and deterministic tests.

---

## Table of Contents

- [Platform Snapshot](#platform-snapshot)
- [Repository Map](#repository-map)
- [Runtime & Tooling](#runtime--tooling)
- [Configuration & Environment](#configuration--environment)
- [Key NPM Scripts](#key-npm-scripts)
- [Architecture Overview](#architecture-overview)
- [Module & Endpoint Catalog](#module--endpoint-catalog)
- [Testing & Quality Strategy](#testing--quality-strategy)
- [Development Playbook](#development-playbook)
- [Mongo & Docker Infrastructure](#mongo--docker-infrastructure)
- [CI Pipeline Expectations](#ci-pipeline-expectations)
- [Appendix: DTO/Domain Guidelines](#appendix-dtodomain-guidelines)

---

## Platform Snapshot

| Area            | Details |
| --------------- | ------- |
| Runtime         | Node.js 20.x
| Framework       | NestJS 11.x (REST controllers with DTO validation)
| Package manager | pnpm (workspace locked by `pnpm-lock.yaml`)
| Language        | TypeScript (strict mode)
| Lint/Format     | ESLint 9 + Prettier 3 (see `eslint.config.mjs`)
| Testing         | Jest 30 (unit + e2e suites)
| Data            | MongoDB (via `mongodb` driver; Docker bootstrap helpers)
| Container       | Docker integration through `dockerode`

---

## Repository Map

```
.
├─ src/
│  ├─ main.ts                 # Application entry point (global prefix + pipes)
│  ├─ app.module.ts           # Root module wiring feature modules
│  ├─ health.controller.ts    # Legacy simple health endpoint (pre-modular)
│  ├─ lib/                    # Shared helpers (errors, utils, types)
│  ├─ infra/                  # Infrastructure helpers (e.g., Mongo bootstrap)
│  └─ modules/                # Feature modules (HTTP + internal services)
│     ├─ health/              # /api/health status endpoint
│     ├─ fields/              # Field definition registry (CRUD)
│     ├─ datatypes/           # Datatype schema registry & lifecycle
│     ├─ docker/              # Internal Docker client abstractions
│     └─ mongodb/             # Internal MongoDB bridge + collections
├─ test/
│  ├─ helpers/                # Shared e2e utilities (Docker, Mongo spin-up)
│  └─ modules/                # Module-focused e2e suites (Mongo gated)
├─ .env*, .env.example        # Runtime configuration templates
├─ eslint.config.mjs          # Centralized ESLint configuration
├─ nest-cli.json, tsconfig.json
└─ package.json               # Scripts & dependency manifest
```

Use this structure when adding new modules—mirror existing folder patterns and
co-locate tests next to implementation when feasible.

---

## Runtime & Tooling

- **Nest CLI** is available through `pnpm nest <command>` for scaffolding, though
  manual file creation keeps imports and barrel files tidy.
- **TypeScript path aliases** live in `tsconfig.json` (e.g., `@lib/*`). Leverage
  them instead of relative imports when referencing shared utilities.
- **Validation**: All incoming DTOs must use `class-validator` decorators and
  rely on the global `ValidationPipe` configured in `main.ts`.

---

## Configuration & Environment

1. Copy `.env.example` → `.env` and adjust Mongo/Docker variables as needed.
2. `.env.test` seeds deterministic values for Jest.
3. Important variables:
   - `PORT` (default 3000)
   - `MONGO_URL`, `MONGO_DB`, `MONGO_AUTO_START` (infra bootstrap)
   - Docker auth variables if the Docker module needs registry access
4. Never commit secrets—use `.env.local` or CI secrets for sensitive data.

Environment config is loaded via `@nestjs/config`; inject `ConfigService` inside
modules to access typed settings.

---

## Key NPM Scripts

| Command              | Purpose |
| -------------------- | ------- |
| `pnpm lint`          | ESLint with auto-fix (CI runs without `--fix`)
| `pnpm build`         | `nest build` → emits compiled output to `dist/`
| `pnpm start`         | Production start (compiled JS)
| `pnpm start:dev`     | Watch mode with hot reload
| `pnpm test`          | Jest unit/integration suites
| `pnpm test:e2e`      | E2E tests (expects Mongo/Docker; gated in CI)
| `pnpm format`        | Prettier write across TypeScript/JSON/MD
| `pnpm format:check`  | Formatting verification only

Always run at least `lint`, `build`, and `test` before submitting work.

---

## Architecture Overview

- **Modular by design**: each domain lives inside `src/modules/<name>` with its
  own controller(s), service(s), DTOs, and internal helpers.
- **Controllers stay thin**: translate DTOs ↔ domain models, delegate to services.
- **Services own business logic**: enforce invariants, interact with infra layers.
- **Infra adapters** (`src/infra`) encapsulate external systems (Mongo, Docker) so
  services stay testable via mocked interfaces.
- **Shared utilities** (`src/lib`) provide error types (`AppError`), JSON helpers,
  and type guards used across modules.
- **Global API prefix**: `main.ts` sets `/api`—route definitions inside modules
  append to that prefix (`@Controller('datatypes')` → `/api/datatypes/*`).

---

## Module & Endpoint Catalog

| Module      | Responsibility | Key Endpoints |
| ----------- | -------------- | ------------- |
| **health**  | Basic service status | `GET /api/health` → `{ status: 'ok' }`
| **fields**  | Canonical field definitions used by datatypes |<ul><li>`GET /api/fields/list`</li><li>`GET /api/fields/get?key=`</li><li>`POST /api/fields/create`</li><li>`POST /api/fields/update`</li><li>`POST /api/fields/delete`</li></ul>
| **datatypes** | Datatype schema registry with publish lifecycle |<ul><li>`GET /api/datatypes/list`</li><li>`GET /api/datatypes/get?key=`</li><li>`POST /api/datatypes/create` (201)</li><li>`POST /api/datatypes/add-field`</li><li>`POST /api/datatypes/update-field`</li><li>`POST /api/datatypes/remove-field`</li><li>`POST /api/datatypes/publish`</li><li>`POST /api/datatypes/unpublish`</li></ul>
| **docker** (internal) | Typed wrapper around `dockerode` for other modules; no direct HTTP exposure |
| **mongodb** (internal) | Mongo client, collections, and bootstrap utilities for modules |

When introducing a new module, follow the same layout: DTOs under `dto/`, domain
helpers under `internal/`, and tests under `tests/`.

---

## Testing & Quality Strategy

- **Unit tests** live alongside modules (`src/modules/**/tests`). They should run
  in isolation without Docker/Mongo.
- **E2E tests** under `test/modules` spin up the Nest app and, when necessary,
  connect to real Docker/Mongo instances. CI sets guards to skip heavy suites unless
  explicitly enabled.
- **Error handling**: domain errors extend `AppError` and controllers translate
  them into predictable HTTP responses (usually 400).
- **Linting/Formatting**: keep files clean before committing. CI treats lint or
  format drift as failures.
- **Type safety**: avoid `any`/`unknown`; prefer explicit interfaces and DTOs.

Tip: run `pnpm test -- --runTestsByPath <file>` for focused unit debugging.

---

## Development Playbook

1. **Plan** the module/feature: define routes, DTOs, and domain logic.
2. **Scaffold** files mirroring existing modules (controller, service, DTOs, tests).
3. **Implement services first** (business logic + integration with infra).
4. **Add DTO validation** and controller mapping.
5. **Write unit tests** next to the code; prefer deterministic, fast tests.
6. **Add/Update e2e tests** if HTTP surface changes.
7. **Document** the new endpoints here (Module Catalog) and in inline comments.
8. **Run quality gates** (`lint`, `build`, `test`, optional `test:e2e`).
9. **Update CHANGELOG/README** for consumer visibility (this file is the source of truth).

Automation agents should follow these steps sequentially to minimize merge pain.

---

## Mongo & Docker Infrastructure

- Local development can auto-start a Mongo container if `MONGO_AUTO_START=1` and
  Docker is available. See helpers under `src/infra/mongo` and `test/helpers`.
- Publishing datatypes ensures per-type collections and unique indexes when
  storage mode is `perType`.
- Docker module encapsulates container interactions—keep networking credentials
  inside infra layer, not controllers.

When running e2e tests locally, confirm Docker Desktop (or daemon) is running.

---

## CI Pipeline Expectations

GitHub Actions execute, in order:

1. `pnpm lint`
2. `pnpm build`
3. `pnpm test`
4. Optional gated `pnpm run test:e2e` (skipped unless explicitly enabled)

A PR is mergeable only when these stages pass. Keep tests deterministic and
ensure README updates reflect any new behaviors.

---

## Appendix: DTO/Domain Guidelines

- **DTOs** should expose ISO timestamps, stringified ObjectIds, and normalized
  booleans. Examine `fields` and `datatypes` controllers for patterns.
- **Domain errors** (`AppError` subclasses) should include user-friendly messages
  and are surfaced as HTTP 400s.
- **Index naming**: unique indexes created during datatype publish follow the
  format `uniq_<typeKeyLower>_<fieldKey>`.
- **Storage modes**: datatypes support `single` vs `perType`; publishing handles
  collection creation accordingly.

Use these conventions to ensure new modules integrate smoothly with existing data
flows and automation.

---

Happy building! Keep this README in sync with the codebase—it is the control
plane for both humans and agents.
