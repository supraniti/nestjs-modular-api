# NestJS Modular API

A strongly typed, task-friendly NestJS backend scaffolded for rapid module delivery.
This README doubles as the onboarding prompt for automation agents: follow it to
spin up the environment, understand the architecture, and ship new features safely. A
companion Vue-based endpoint explorer lives under `apps/frontend` for local-only QA.

---

## 📌 TL;DR (Agents Start Here)

1. **Install deps:** `pnpm install` (workspace-aware; pulls backend + frontend dependencies)
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
├─ apps/
│  └─ frontend/               # Vue 3 + Vite explorer for local endpoint QA
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
   - `DATATYPES_BOOTSTRAP` (default `1` locally) — set to `0`/`false` to skip datatype seed bootstrap; automatically disabled when `CI=1`.
   - `DATATYPES_SEEDS_DIR` — optional directory path containing filesystem datatype seed files (one JSON per datatype). When set, these seeds augment or override `src/Data/datatypes.seeds.json` during bootstrap.
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
| **entities** | Runtime CRUD for published datatypes (dynamic per type) |<ul><li>`GET /api/entities/:type/datatype`</li><li>`GET /api/entities/:type/list`</li><li>`GET /api/entities/:type/get?id=`</li><li>`POST /api/entities/:type/create` (201)</li><li>`POST /api/entities/:type/update` (200)</li><li>`POST /api/entities/:type/delete` (200)</li></ul>
| **discovery** | Explorer manifest for documenting runtime routes and JSON Schemas |<ul><li>`GET /api/discovery/manifest`</li><li>`GET /api/discovery/entities/:type/schema`</li></ul>
| **docker** (internal) | Typed wrapper around `dockerode` for other modules; no direct HTTP exposure |
| **mongodb** (internal) | Mongo client, collections, and bootstrap utilities for modules |

When introducing a new module, follow the same layout: DTOs under `dto/`, domain
helpers under `internal/`, and tests under `tests/`.

---

## Hooks Module (Internal)

- Location: `src/modules/hooks`
- Purpose: Define, register, and run ordered hook actions for CRUD phases.
- Phases: `before|after` + `Create/Get/Update/Delete/List`.

Quick start:
- Register an action
  - Create a class implementing `{ id, run(ctx) }` and provide it to Nest (or call `HookRegistry.register(action)` directly).
- Contribute steps
  - `HookStore.applyPatch({ typeKey, phases: { beforeCreate: [{ action: 'validate' }] } })`.
- Execute
  - `HookEngine.run({ typeKey, phase: 'beforeCreate', ctx })`.

Notes
- Built-ins: `validate`, `enrich` (no-op by default).
- Deterministic order: patches append; steps run sequentially.
- Engine injects `ctx.meta.stepArgs` from each step’s `args`.
- Errors: unknown action → `Unknown action: ...`; action failures are wrapped with `[phase/typeKey/action]`.

## Entities & Discovery Deep Dive

The Entities and Discovery modules provide runtime CRUD and self-documenting
metadata for any Datatype that has been published. All routes inherit the global
`/api` prefix.

### Base URLs & Module Summary

| Module | Purpose | Key Notes |
| ------ | ------- | --------- |
| **Entities** | Typed CRUD routes generated from the live Datatype definition stored in MongoDB. | Only published Datatypes are operable; validation updates instantly as definitions change. |
| **Discovery** | Programmatic manifest that powers the API Explorer and reflects live Datatype changes. | Manifest bundles static Field/Datatype endpoints plus dynamic per-entity schemas and examples. |

### Core Rules (Entities)

- Only **published** Datatypes are operable. Unknown versus unpublished types
  return distinct domain errors.
- Validation derives from the persisted Datatype definition, so schema changes
  take effect immediately—no rebuild required.
- Mongo `ObjectId` values are surfaced as `id` hex strings in responses.
- All domain errors map to HTTP 400 responses using Nest's standard
  `BadRequestException` payload.

### HTTP Status & Error Mapping

| Status | Trigger | Notes |
| ------ | ------- | ----- |
| `200 OK` | list/get/update/delete operations | Updates and deletes explicitly return 200. |
| `201 Created` | Successful create | |
| `400 Bad Request` | Domain-level errors | Standard body: `{ statusCode: 400, message, error: "Bad Request" }`. |

| Error | Meaning |
| ----- | ------- |
| `UnknownDatatypeError` | Referenced Datatype does not exist. |
| `UnpublishedDatatypeError` | Datatype exists but has not been published. |
| `ValidationError` | Payload violates Datatype rules. |
| `UniqueViolationError` | Unique field constraint breached. |
| `EntityNotFoundError` | Entity id not present in storage. |
| `CollectionResolutionError` | Storage resolution failure (rare). |

### Fields Module (Static)

- Endpoints: `GET /api/fields/list`, `GET /api/fields/get?key=`,
  `POST /api/fields/create`, `POST /api/fields/update`, `POST /api/fields/delete`.
- Baseline field types include string, number, boolean, date, and enum. Locked
  seed fields cannot be deleted.

### Datatypes Module (Static)

- Endpoints: `GET /api/datatypes/list`, `GET /api/datatypes/get?key=`,
  `POST /api/datatypes/create`, `POST /api/datatypes/add-field`,
  `POST /api/datatypes/update-field`, `POST /api/datatypes/remove-field`,
  `POST /api/datatypes/publish`, `POST /api/datatypes/unpublish`.
- Datatype status toggles between `draft` and `published`. Storage mode is either
  `single` or `perType`; publish-time provisioning handles unique indexes and
  per-type collections.

### Entities Module (Dynamic per Published Type)

Routes are parameterized by the Datatype key (`:type`).

- `GET /api/entities/:type/datatype` → Returns the published Datatype DTO so
  clients can build request payloads.
- `GET /api/entities/:type/list` → Pagination with simple equality filters.
- `GET /api/entities/:type/get?id=...` → Fetch an entity by 24-char hex `id`.
- `POST /api/entities/:type/create` → Create entity (201).
- `POST /api/entities/:type/update` → Update entity (200).
- `POST /api/entities/:type/delete` → Delete entity (200).

Storage resolution:

- `perType` → Collection `data_<keyLower>`.
- `single` → Shared `data_entities` collection with discriminator
  `__type = <keyLower>` (removed from responses).

Filtering, sorting, and pagination:

- Querystring equality filters map directly to field names; repeated keys (e.g.,
  `k=A&k=B`) become `$in` clauses.
- Defaults: `page=1`, `pageSize=20` (max `100`), `sortBy=_id`, `sortDir` in
  `{asc, desc}`.

Validation (derived from Datatype definition):

- Only Datatype-defined keys are evaluated; unknown keys are ignored.
- Create enforces required fields; update validates only provided keys.
- Arrays enforce scalar item types.
- Scalar constraints:
  - **string** → `minLength`, `maxLength`, `pattern`
  - **number** → `min`, `max`, `integer: true`
  - **boolean**
  - **date** → ISO strings (epoch/Date allowed server-side)
  - **enum** → `values[]`, optional `caseInsensitive`
- Unique scalar fields are pre-checked; duplicate key violations raise
  `UniqueViolationError`.

#### Hooks in seeds

- Datatype seeds may declare per-phase hook flows to be registered at bootstrap time (not executed yet).
- Supported phases: `beforeCreate`, `afterCreate`, `beforeGet`, `afterGet`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`, `beforeList`, `afterList`.
- Each step: `{ "action": string, "args"?: object }`.
- Example seed excerpt (works in both `src/Data/datatypes.seeds.json` and filesystem seeds via `DATATYPES_SEEDS_DIR`):

```
{
  "key": "post",
  "label": "Post",
  "status": "published",
  "version": 1,
  "storage": { "mode": "single" },
  "fields": [ ... ],
  "indexes": [],
  "hooks": {
    "beforeCreate": [
      { "action": "validate", "args": { "schema": "post.create" } }
    ],
    "afterGet": [
      { "action": "enrich", "args": { "with": ["author"] } }
    ]
  }
}
```

During bootstrap, flows are parsed and stored in memory via HookStore. A log entry summarizes: `Registered hooks for <n> types (total <m> steps).`

### Discovery Module (API Explorer Support)

- `GET /api/discovery/manifest` → Returns the Explorer manifest with static
  module endpoints, per-type routes, JSON Schemas (`create`, `update`,
  `listQuery`, `entityResponse`), and sample payloads.
- `GET /api/discovery/entities/:type/schema` → Returns schema + routes for a
  single type (lazy loading when users switch types).

Manifest (`ExplorerManifest`) structure:

- `version`: `1`
- `baseUrl`: `"/api"`
- `openapiUrl`: `"/api/openapi.json"` (placeholder until Swagger is enabled)
- `generatedAt`: ISO timestamp of manifest creation
- `modules.fields.endpoints[]`: `{ name, method, path, requestSchemaRef?, responseSchemaRef? }`
- `modules.datatypes.endpoints[]`: same shape as fields
- `modules.entities.types[]`: includes `key`, `label`, `storage`, `routes[]`,
  JSON Schemas, and `examples`
- `schemas.entityResponse` always includes `id` with 24-hex regex pattern

JSON Schema mapping rules:

- `string` → `{ type: "string", minLength?, maxLength?, pattern? }`
- `number` → `{ type: "number" }`; integers use `{ type: "integer", multipleOf: 1 }`
  plus `minimum`/`maximum` when specified.
- `boolean` → `{ type: "boolean" }`
- `date` → `{ type: "string", format: "date-time" }`
- `enum` → `{ type: "string", enum: [...] }` with `x-caseInsensitive` when needed.
- `array: true` → `{ type: "array", items: <scalar schema> }`
- `required: true` → Added to `create.required` (updates remain optional).
- `unique: true` → `{ "x-unique": true }` vendor extension.
- `listQuery` schemas include pagination/sort properties plus equality filters for
  each scalar field.

Frontend explorer consumption:

1. Load the manifest on startup to drive navigation and UI generation.
2. Render Fields/Datatypes endpoints directly (or via OpenAPI when available).
3. Auto-build create/update forms and list filters from the JSON Schemas; optional
   client-side validation can mirror backend rules.
4. Refresh the manifest after Datatype edits/publish actions to capture live
   schema updates.

Operational notes:

- Entities and Discovery E2E suites require local MongoDB; CI skips them by
  default.
- Unit tests cover controller error mapping and schema generation.
- TypeScript path alias `@lib/*` resolves to `src/lib/*`; `MongodbService`
  exposes thin driver helpers shared across these modules.
- `openapiUrl` in the manifest is reserved for future Swagger integration.

Future enhancements: enable Swagger at `/api/openapi.json`, expand filtering,
introduce RBAC/UBAC, push real-time manifest updates (SSE/WebSocket), and add
bulk operations with batch validation.

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
