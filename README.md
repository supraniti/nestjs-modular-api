# NestJS Modular API

A strongly typed, task‑friendly NestJS backend scaffolded for rapid module delivery.

This README is the primary onboarding doc. It helps you spin up the environment, understand the architecture, and ship new features safely. A companion Vue‑based endpoint explorer lives under `apps/frontend` for local‑only QA.

---

## TL;DR (Agents Start Here)

1. Install deps (root):
   ```bash
   pnpm install
   ```
2. Run quality gates (CI parity):
   ```bash
   pnpm lint
   pnpm build
   pnpm test
   pnpm run test:e2e   # optional locally; gated in CI
   ```
3. Launch API for manual testing:
   ```bash
   pnpm start:dev
   # Health checks:
   #  - http://localhost:3000/health (legacy)
   #  - http://localhost:3000/api/health/ping
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
- Hooks Module (Internal)
- Entities & Discovery Deep Dive
- Referential Integrity
- Discovery Relations
- Testing & Quality Strategy
- Development Playbook
- Mongo & Docker Infrastructure
- CI Pipeline Expectations
- Appendix: DTO/Domain Guidelines
- Runtime Flags
- Consumer Quick Guide
- Frontend Explorer

---

## Platform Snapshot

| Area            | Details |
| --------------- | ------- |
| Runtime         | Node.js 20.x |
| Framework       | NestJS 11.x (REST controllers with DTO validation) |
| Package manager | pnpm (workspace locked by `pnpm-lock.yaml`) |
| Language        | TypeScript (strict mode) |
| Lint/Format     | ESLint 9 + Prettier 3 (see `eslint.config.mjs`) |
| Testing         | Jest 30 (unit + e2e suites) |
| Data            | MongoDB (via `mongodb` driver; Docker bootstrap helpers) |
| Container       | Docker integration through `dockerode` |

---

## Repository Map

```
.
├─ src/
│  ├─ main.ts                 # Application entry (global prefix + pipes)
│  ├─ app.module.ts           # Root module wiring feature modules
│  ├─ health.controller.ts    # Legacy simple health endpoint (pre‑modular)
│  ├─ lib/                    # Shared helpers (errors, utils, types)
│  ├─ infra/                  # Infrastructure helpers (e.g., Mongo bootstrap)
│  └─ modules/                # Feature modules (HTTP + internal services)
│     ├─ health/              # /api/health status endpoint
│     ├─ fields/              # Field definition registry (CRUD)
│     ├─ datatypes/           # Datatype schema registry & lifecycle
│     ├─ discovery/           # Schema/relations discovery
│     ├─ entities/            # Entity CRUD + query/validate
│     ├─ hooks/               # Hook engine + manifest
│     ├─ docker/              # Internal Docker client abstractions
│     └─ mongodb/             # Internal MongoDB bridge + collections
├─ apps/
│  └─ frontend/               # Vue 3 + Vite explorer for local endpoint QA
├─ test/
│  ├─ helpers/                # Shared e2e utilities (Docker, Mongo spin‑up)
│  └─ modules/                # Module‑focused e2e suites (Mongo gated)
├─ .env*, .env.example        # Runtime configuration templates
├─ eslint.config.mjs          # Centralized ESLint configuration
├─ nest-cli.json, tsconfig*.json
└─ package.json               # Scripts & dependency manifest
```

Use this structure when adding new modules—mirror existing folder patterns and co‑locate tests next to implementation when feasible.

---

## Runtime & Tooling

- Nest CLI is available via `pnpm nest <command>`; manual file creation keeps imports and barrel files tidy.
- TypeScript path aliases live in `tsconfig.json` (e.g., `@lib/*`). Prefer them over long relative paths.
- Validation: All incoming DTOs use `class-validator`; the global `ValidationPipe` is configured in `main.ts`.
- Global API prefix: `main.ts` sets `/api`; module route decorators append (e.g., `@Controller('datatypes')` → `/api/datatypes/*`).

---

## Configuration & Environment

1. Copy `.env.example` → `.env` and adjust Mongo/Docker variables as needed.
2. `.env.test` seeds deterministic values for Jest.
3. Important variables:
   - Core
     - `PORT` (default `3000`)
   - Mongo infra (see `src/infra/mongo/mongo.config.ts`)
     - `MONGO_AUTO_START` (default `true`) — auto‑run local Mongo in Docker
     - `MONGO_IMAGE` (default `mongo:7`)
     - `MONGO_CONTAINER_NAME` (default `app-mongo`)
     - `MONGO_HOST` (default `127.0.0.1`)
     - `MONGO_PORT` (default `27017`)
     - `MONGO_ROOT_USERNAME` (default `modapi_root`)
     - `MONGO_ROOT_PASSWORD` (default `modapi_root_dev`)
   - Datatype bootstrap
     - `DATATYPES_BOOTSTRAP` (default `1`) — set `0`/`false` to skip; automatically skipped when `CI=1`
     - `DATATYPES_SEEDS_DIR` — optional directory path with filesystem datatype seed files (one JSON per datatype). When set, these seeds augment/override `src/Data/datatypes.seeds.json` during bootstrap.
   - Docker test helpers
     - `DOCKER_E2E` — enable Docker‑dependent e2e helpers
   - Legacy/consumer variables (if used by external clients)
     - `MONGO_URL`, `MONGO_DB` (for direct client connections)

Never commit secrets—use `.env.local` or CI secrets for sensitive data. Configuration is loaded via `@nestjs/config`; inject `ConfigService` inside modules to access typed settings.

---

## Key NPM Scripts

| Command             | Purpose |
| ------------------- | ------- |
| `pnpm lint`         | ESLint with auto‑fix (CI runs without `--fix`) |
| `pnpm build`        | `nest build` → emits compiled output to `dist/` |
| `pnpm start`        | Production start (compiled) |
| `pnpm start:dev`    | Watch mode with hot reload |
| `pnpm test`         | Jest unit/integration suites |
| `pnpm test:e2e`     | E2E tests (expects Mongo/Docker; gated in CI) |
| `pnpm format`       | Prettier write across TypeScript/JSON/MD |
| `pnpm format:check` | Formatting verification only |

Always run at least `lint`, `build`, and `test` before submitting work.

---

## Architecture Overview

- Modular by design: each domain lives inside `src/modules/<name>` with its own controller(s), service(s), DTOs, and internal helpers.
- Controllers stay thin: translate DTOs ↔ domain models; delegate to services.
- Services own business logic: enforce invariants; interact with infra adapters.
- Infra adapters (`src/infra`) encapsulate external systems (Mongo, Docker) so services stay testable via mocked interfaces.
- Shared utilities (`src/lib`) provide error types (`AppError`), JSON helpers, and type guards used across modules.

---

## Module & Endpoint Catalog

### Additional Entities APIs

- `GET /api/entities/query` — Cross‑type query with JSON filter and cursor fields.
  - Query params: `type` (required), `filter` (JSON string with whitelisted operators), `sort` (e.g., `-createdAt,title`), `limit` (1..100), `cursor` (opaque token), or `page`/`pageSize`.
  - Allowed operators in `filter`: `$eq`, `$ne`, `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$regex`, `$exists`.
  - Response: `{ items: object[], page: { nextCursor?, limit, count, hasMore }, meta: { type, sort? } }`.

- `POST /api/entities/validate` — Pre‑validate create/update payloads and simulate delete integrity.
  - Body: `{ type: string, mode: 'create'|'update'|'delete', payload?, identity?:{ _id?: string }, options?:{ enforceUnique?: boolean } }`.
  - Response: `{ ok: boolean, errors: { code, message, path? }[], warnings: [], effects?: { delete?: { restrictedBy?: [], wouldUnset?: [] } }, meta: { type, mode } }`.

| Module       | Responsibility | Key Endpoints |
| ------------ | -------------- | ------------- |
| health       | Basic service status | `GET /api/health` → `{ status: 'ok' }` |
| fields       | Canonical field definitions used by datatypes | `GET /api/fields/list`, `GET /api/fields/get?key=`, `POST /api/fields/create`, `POST /api/fields/update`, `POST /api/fields/delete` |
| datatypes    | Datatype schema registry with publish lifecycle | `GET /api/datatypes/list`, `GET /api/datatypes/get?key=`, `POST /api/datatypes/create`, `POST /api/datatypes/add-field`, `POST /api/datatypes/update-field`, `POST /api/datatypes/remove-field`, `POST /api/datatypes/publish`, `POST /api/datatypes/unpublish` |
| entities     | Runtime CRUD for published datatypes (dynamic per type) | `GET /api/entities/:type/datatype`, `GET /api/entities/:type/list`, `GET /api/entities/:type/get?id=`, `POST /api/entities/:type/create`, `POST /api/entities/:type/update`, `POST /api/entities/:type/delete` |
| discovery    | Explorer manifest, per‑type schemas, relations | `GET /api/discovery/manifest`, `GET /api/discovery/entities/:type/schema` |
| docker (int) | Typed wrapper around `dockerode` for modules | no direct HTTP exposure |
| mongodb (int)| Mongo client, collections, and bootstrap utilities | internal |

When introducing a new module, follow the same layout: DTOs under `dto/`, domain helpers under `internal/`, and tests under `tests/`.

---

## Hooks Module (Internal)

- Location: `src/modules/hooks`
- Purpose: Define, register, and run ordered hook actions for CRUD phases.
- Phases: `before|after` × `Create|Get|Update|Delete|List`.

Quick start:

- Register an action: Implement `{ id, run(ctx) }` and provide it to Nest (or call `HookRegistry.register(action)` directly).
- Contribute steps: `HookStore.applyPatch({ typeKey, phases: { beforeCreate: [{ action: 'validate' }] } })`.
- Execute: `HookEngine.run({ typeKey, phase: 'beforeCreate', ctx })`.

Notes

- Built‑ins: `validate`, `enrich` (no‑op by default).
- Deterministic order: patches append; steps run sequentially.
- Engine injects `ctx.meta.stepArgs` from each step’s `args`.
- Errors: unknown action → `Unknown action: ...`; action failures are wrapped with `[phase/typeKey/action]`.

---

## Entities & Discovery Deep Dive

The Entities and Discovery modules provide runtime CRUD and self‑documenting metadata for any Datatype that has been published. All routes inherit the global `/api` prefix.

### Base URLs & Module Summary

| Module    | Purpose | Key Notes |
| --------- | ------- | --------- |
| Entities  | Typed CRUD routes generated from the live Datatype definition stored in MongoDB. | Only published Datatypes are operable; validation updates instantly as definitions change. |
| Discovery | Programmatic manifest that powers the API Explorer and reflects live Datatype changes. | Manifest bundles static Field/Datatype endpoints plus dynamic per‑entity schemas and examples. |

### Core Rules (Entities)

- Only published Datatypes are operable. Unknown vs unpublished types return distinct domain errors.
- Validation derives from the persisted Datatype definition, so schema changes take effect immediately—no rebuild required.
- Mongo `ObjectId` values are surfaced as `id` hex strings in responses.
- Domain errors map to HTTP 400 using Nest’s standard `BadRequestException` shape.

### HTTP Status & Error Mapping

| Status | Trigger | Notes |
| ------ | ------- | ----- |
| `200 OK` | list/get/update/delete operations | Updates and deletes explicitly return 200. |
| `201 Created` | Successful create |  |
| `400 Bad Request` | Domain‑level errors | `{ statusCode: 400, message, error: "Bad Request" }` |

| Error | Meaning |
| ----- | ------- |
| `UnknownDatatypeError` | Referenced Datatype does not exist. |
| `UnpublishedDatatypeError` | Datatype exists but has not been published. |
| `ValidationError` | Payload violates Datatype rules. |
| `UniqueViolationError` | Unique field constraint breached. |
| `EntityNotFoundError` | Entity id not present in storage. |
| `CollectionResolutionError` | Storage resolution failure (rare). |

### Fields Module (Static)

- Endpoints: `GET /api/fields/list`, `GET /api/fields/get?key=`, `POST /api/fields/create`, `POST /api/fields/update`, `POST /api/fields/delete`.
- Baseline field types include string, number, boolean, date, and enum. Locked seed fields cannot be deleted.

### Datatypes Module (Static)

- Endpoints: `GET /api/datatypes/list`, `GET /api/datatypes/get?key=`, `POST /api/datatypes/create`, `POST /api/datatypes/add-field`, `POST /api/datatypes/update-field`, `POST /api/datatypes/remove-field`, `POST /api/datatypes/publish`, `POST /api/datatypes/unpublish`.
- Datatype status toggles between `draft` and `published`. Storage mode is either `single` or `perType`; publish‑time provisioning handles unique indexes and per‑type collections.

### Entities Module (Dynamic per Published Type)

Routes are parameterized by the Datatype key (`:type`).

- `GET /api/entities/:type/datatype` → Return the published Datatype DTO so clients can build request payloads.
- `GET /api/entities/:type/list` → Pagination with simple equality filters.
- `GET /api/entities/:type/get?id=...` → Fetch by 24‑char hex `id`.
- `POST /api/entities/:type/create` → Create entity (201).
- `POST /api/entities/:type/update` → Update entity (200).
- `POST /api/entities/:type/delete` → Delete entity (200).

Storage resolution:

- `perType` → Collection `data_<keyLower>`.
- `single` → Shared `data_entities` with discriminator `__type = <keyLower>` (removed from responses).

Filtering, sorting, pagination:

- Querystring equality filters map directly to field names; repeated keys (e.g., `k=A&k=B`) become `$in` clauses.
- Defaults: `page=1`, `pageSize=20` (max `100`), `sortBy=_id`, `sortDir` in `{asc, desc}`.

Validation (derived from Datatype definition):

- Only Datatype‑defined keys are evaluated; unknown keys are ignored.
- Create enforces required fields; update validates only provided keys.
- Arrays enforce scalar item types.
- Scalar constraints:
- string → `minLength`, `maxLength`, `pattern`
- number → `min`, `max`, `integer: true`
- boolean
- date → ISO strings (epoch/Date allowed server‑side)
- enum → `values[]`, optional `caseInsensitive`
- Unique scalar fields are pre‑checked; duplicate key violations raise `UniqueViolationError`.

#### Hooks in seeds

- Datatype seeds may declare per‑phase hook flows to be registered at bootstrap time (not executed yet).
- Supported phases: `beforeCreate`, `afterCreate`, `beforeGet`, `afterGet`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`, `beforeList`, `afterList`.
- Each step: `{ "action": string, "args"?: object }`.

Example seed excerpt (works in both `src/Data/datatypes.seeds.json` and filesystem seeds via `DATATYPES_SEEDS_DIR`):

```json
{
  "key": "post",
  "label": "Post",
  "status": "published",
  "version": 1,
  "storage": { "mode": "single" },
  "fields": [ /* ... */ ],
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

Contributions (cross‑type hooks)

- Seeds can also contribute steps to other types' flows using `contributes[]`.
- Shape: `contributes: [{ target: string, hooks: { <phase>: HookStep[] } }]`.
- `target` must be kebab‑case and is normalized to lower.
- Ordering is deterministic:
  - Seed order: JSON seeds in file order, then FS seeds in lexicographic filename order.
  - Patches apply in two passes: all own hooks first, then all contributions.
  - Phases use a fixed order and steps preserve listed order.
- Bootstrap resets the in‑memory HookStore each run to rebuild flows idempotently; repeated runs yield identical flows with no duplicates.

Example with contributions:

```json
{
  "key": "taxonomy",
  "label": "Taxonomy",
  "status": "published",
  "version": 1,
  "storage": { "mode": "single" },
  "fields": [{ "fieldKey": "name", "required": true, "array": false }],
  "indexes": [],
  "hooks": { "beforeCreate": [{ "action": "validate" }] },
  "contributes": [
    {
      "target": "post",
      "hooks": {
        "beforeCreate": [{ "action": "validate", "args": { "schema": "taxonomy.rules" } }],
        "afterGet": [{ "action": "enrich", "args": { "with": ["taxonomies"] } }]
      }
    }
  ]
}
```

Bootstrap summary log example: `HookStore: registered hooks for 2 own types (3 total affected) (3 own steps, 2 contributed steps)` and per‑contribution debug lines like `Contrib: taxonomy -> post.beforeCreate (+1 step)`.

### Discovery Module (API Explorer Support)

- `GET /api/discovery/manifest` → Returns the Explorer manifest with static module endpoints, per‑type routes, JSON Schemas (`create`, `update`, `listQuery`, `entityResponse`), and sample payloads.
- `GET /api/discovery/entities/:type/schema` → Returns schema + routes for a single type (lazy loading when users switch types).

Manifest (`ExplorerManifest`) structure:

- `version`: `1`
- `baseUrl`: `"/api"`
- `openapiUrl`: `"/api/openapi.json"` (placeholder until Swagger is enabled)
- `generatedAt`: ISO timestamp of manifest creation
- `modules.fields.endpoints[]`: `{ name, method, path, requestSchemaRef?, responseSchemaRef? }`
- `modules.datatypes.endpoints[]`: same shape as fields
- `modules.entities.types[]`: includes `key`, `label`, `storage`, `routes[]`, JSON Schemas, and `examples`
- `schemas.entityResponse` always includes `id` with 24‑hex regex pattern

JSON Schema mapping rules:

- string → `{ type: "string", minLength?, maxLength?, pattern? }`
- number → `{ type: "number" }`; integers use `{ type: "integer", multipleOf: 1 }` plus `minimum`/`maximum` when specified
- boolean → `{ type: "boolean" }`
- date → `{ type: "string", format: "date-time" }`
- enum → `{ type: "string", enum: [...] }` with `x-caseInsensitive` when needed
- `array: true` → `{ type: "array", items: <scalar schema> }`
- `required: true` → Added to `create.required` (updates remain optional)
- `unique: true` → `{ "x-unique": true }` vendor extension
- `listQuery` schemas include pagination/sort properties plus equality filters for each scalar field

Frontend explorer consumption:

1. Load the manifest on startup to drive navigation and UI generation.
2. Render Fields/Datatypes endpoints directly (or via OpenAPI when available).
3. Auto‑build create/update forms and list filters from the JSON Schemas; optional client‑side validation can mirror backend rules.
4. Refresh the manifest after Datatype edits/publish actions to capture live schema updates.

Operational notes:

- Entities and Discovery E2E suites require local MongoDB; CI skips them by default.
- Unit tests cover controller error mapping and schema generation.
- TypeScript path alias `@lib/*` resolves to `src/lib/*`; `MongodbService` exposes thin driver helpers shared across these modules.
- `openapiUrl` in the manifest is reserved for future Swagger integration.

Future enhancements: enable Swagger at `/api/openapi.json`, expand filtering, introduce RBAC/UBAC, push real‑time manifest updates (SSE/WebSocket), and add bulk operations with batch validation.

---

## Referential Integrity

Ref fields (fields with `kind.type === 'ref'`) participate in integrity rules:

- Write‑time checks (create/update):
  - one: when a non‑null value is present, referenced doc must exist; otherwise 400 with `{ code: 'RefMissing', field, target, missing: [ids] }`.
  - many: when a non‑empty array is present, all referenced IDs must exist; otherwise 400 with missing IDs.
  - Skips absent fields in partial updates and explicit `null` when not required.
  - Toggle via `DATATYPES_REF_CHECK` (default `1`).

- Delete‑time `onDelete` behaviors for incoming edges:
  - `restrict` (default): blocks delete with 409 when references exist, body includes `{ code: 'RefRestrict', type, field, count }`.
  - `setNull`: sets `one` refs to null; pulls deleted id from `many` arrays.
  - `cascade`: deletes referencing docs (one level only).
  - Toggle via `DATATYPES_ONDELETE` (default `1`).
  - Safety cap via `DATATYPES_ONDELETE_MAX` (default `1000`).

---

## Discovery Relations

The Discovery API exposes relations for UI agents:

- Manifest (`GET /api/discovery/manifest`) includes `relations: RelationEdgeDto[]` sorted by `from`, then `fieldKey`.
- Per‑type schema (`GET /api/discovery/entities/:type/schema`) includes `relations: { outgoing, incoming }`, each sorted by `fieldKey`.

```ts
type RelationCardinality = 'one' | 'many';
type OnDeleteMode = 'restrict' | 'setNull' | 'cascade';
interface RelationEdgeDto {
  from: string;
  to: string;
  fieldKey: string;
  cardinality: RelationCardinality;
  onDelete: OnDeleteMode;
}
```

---

## Testing & Quality Strategy

- Unit tests live alongside modules (`src/modules/**/tests`). They run in isolation without Docker/Mongo.
- E2E tests under `test/modules` spin up the Nest app and, when necessary, connect to real Docker/Mongo instances. CI sets guards to skip heavy suites unless explicitly enabled.
- Error handling: domain errors extend `AppError` and controllers translate them into predictable HTTP responses (usually 400).
- Linting/Formatting: keep files clean before committing. CI treats lint or format drift as failures.
- Type safety: avoid `any`/`unknown`; prefer explicit interfaces and DTOs.

Tip: run `pnpm test -- --runTestsByPath <file>` for focused unit debugging.

---

## Development Playbook

1. Plan the module/feature: define routes, DTOs, and domain logic.
2. Scaffold files mirroring existing modules (controller, service, DTOs, tests).
3. Implement services first (business logic + integration with infra).
4. Add DTO validation and controller mapping.
5. Write unit tests next to the code; prefer deterministic, fast tests.
6. Add/Update e2e tests if HTTP surface changes.
7. Document the new endpoints here (Module Catalog) and in inline comments.
8. Run quality gates (`lint`, `build`, `test`, optional `test:e2e`).
9. Update README for consumer visibility (this file is the source of truth).

Automation agents should follow these steps sequentially to minimize merge pain.

---

## Mongo & Docker Infrastructure

- Local development can auto‑start a Mongo container if `MONGO_AUTO_START=1` and Docker is available. See helpers under `src/infra/mongo` and `test/helpers`.
- Publishing datatypes ensures per‑type collections and unique indexes when storage mode is `perType`.
- Docker module encapsulates container interactions—keep networking credentials inside the infra layer, not controllers.

When running e2e tests locally, confirm Docker Desktop (or daemon) is running.

---

## CI Pipeline Expectations

GitHub Actions (or equivalent) should run, in order:

1. `pnpm lint`
2. `pnpm build`
3. `pnpm test`
4. Optional gated `pnpm run test:e2e` (skipped unless explicitly enabled)

A PR is mergeable only when these stages pass. Keep tests deterministic and ensure README updates reflect any new behaviors.

---

## Appendix: DTO/Domain Guidelines

- DTOs should expose ISO timestamps, stringified ObjectIds, and normalized booleans. Examine `fields` and `datatypes` controllers for patterns.
- Domain errors (`AppError` subclasses) should include user‑friendly messages and are surfaced as HTTP 400s.
- Index naming: unique indexes created during datatype publish follow the format `uniq_<typeKeyLower>_<fieldKey>`.
- Storage modes: datatypes support `single` vs `perType`; publishing handles collection creation accordingly.
- Keep domain types in `src/lib/types` when cross‑module reuse is intended.

Use these conventions to ensure new modules integrate smoothly with existing dataflows and automation.

---

## Runtime Flags

- `HOOKS_ENABLE` — `1|true` to enable hook execution (validation/enrichment), `0|false` to disable (useful for backward‑compat checks).
- `DATATYPES_REF_CHECK` — `1|true` to enforce referential existence checks on create/update (default on locally).
- `INTEGRITY_ENFORCE` — `1|true` to enforce delete integrity at runtime; when off, delete integrity is simulation‑only via `/api/entities/validate`.
- `DATATYPES_ONDELETE` — legacy toggle for onDelete behavior; prefer `INTEGRITY_ENFORCE`.
- `DATATYPES_ONDELETE_MAX` — safety cap for cascades and fan‑out.

---

## Consumer Quick Guide

- Create a datatype (draft):
  ```http
  POST /api/datatypes/create
  {
    "key":"post",
    "label":"Post",
    "storage": { "mode":"perType" },
    "fields": [
      { "fieldKey":"title", "required": true, "constraints": { "minLength": 1 } },
      { "fieldKey":"status", "constraints": { "enum": ["draft","published"] } }
    ]
  }
  ```

- Publish a datatype:
  ```http
  POST /api/datatypes/publish
  { "key":"post" }
  ```

- Add a reference field (restrict on delete):
  ```json
  {
    "fieldKey":"authorId",
    "constraints": { "ref": "author" },
    "kind": { "type":"ref", "target":"author", "cardinality":"one", "onDelete":"restrict" }
  }
  ```

- CRUD on entities:
  - Create: `POST /api/entities/:type/create` → `201 { id }`
  - Get: `GET /api/entities/:type/get?id=<hex>` → entity with `id`
  - Update: `POST /api/entities/:type/update` → `200`
  - Delete: `POST /api/entities/:type/delete` → `200`

- Query entities (sorting, filters, pagination):
  ```
  GET /api/entities/query?type=post&sort=-createdAt&limit=10&filter={...}
  ```
  Pass `filter` as a JSON string; allowed operators: `$eq,$ne,$in,$nin,$gt,$gte,$lt,$lte,$regex,$exists`.

- Pre‑validate before write (no DB changes):
  - Create/update: `POST /api/entities/validate` with `{ type, mode: 'create'|'update', payload, options?: { enforceUnique: true } }`.
  - Delete simulation: `POST /api/entities/validate` with `{ type, mode:'delete', identity:{ _id } }` for `restrictedBy`/`wouldUnset` insight.

- Hooks:
  - Enable via `HOOKS_ENABLE=1`.
  - Define flows in seeds under `hooks.{phase}[]` using built‑ins: `validate`, `enrich`.
  - Discover flows: `GET /api/hooks/manifest`.

---

## Frontend Explorer

For a local endpoint explorer, see `apps/frontend/README.md`. It runs against your local API and is not meant for deployment.

---

Happy building! Keep this README in sync with the codebase—it is the control plane for both humans and agents.

