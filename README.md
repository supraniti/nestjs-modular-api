# NestJS Modular API

A fully typed, modular NestJS backend exposing a single \`/api\` prefix.
Focus: strict typing, modular growth, clean CI, and Windows-friendly dev.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Current State](#current-state)
- [Environment](#environment)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Commands](#commands)
- [CI Pipeline](#ci-pipeline)
- [Modules Implemented](#modules-implemented)
- [Health (HTTP)](#health-http)
- [Docker (Internal Only)](#docker-internal-only)
- [Mongo Infra (Local Bootstrap)](#mongo-infra-local-bootstrap)
- [MongoDB Module (Internal)](#mongodb-module-internal)
- [Fields Module (HTTP)](#fields-module-http)
- [Notes & Next Steps](#notes--next-steps)
- [Author](#author)

---

## Project Overview

Each module exposes one or more actions under \`/api/:module/:action\`.
Actions may be immediate or long-running (with polling). Modules can also
call each other internally via typed service APIs.

**Design principles**

- Strict typing everywhere (no \`any\` / \`unknown\` escapes).
- Shared logic in \`src/lib/_\`, infra in \`src/infra/_\`.
- Controllers thin; Services own business logic.
- DTOs validate inputs (\`class-validator\`) and return **typed** responses.
- E2E that touch Docker/Mongo are **gated** and skipped on CI by default.

---

## Current State

- \`/api\` global prefix & validation pipe configured.
- \`/api/health\` implemented and tested.
- Config: \`.env\`, \`.env.example\`, \`.env.test\` via \`@nestjs/config\`.
- Shared utilities in \`src/lib/\`:
- \`utils/isDefined.ts\`
- \`types/json.ts\`
- \`errors/AppError.ts\`
- Path alias: \`@lib/\_\`.
- ESLint + Prettier clean.
- GitHub Actions: lint → build → unit → e2e; heavy e2e gated (see CI).

---

## Environment

| Tool            | Version / Notes                      |
| --------------- | ------------------------------------ |
| Node.js         | 20.x                                 |
| Package Manager | pnpm                                 |
| Framework       | NestJS 10.x                          |
| Testing         | Jest (unit + e2e)                    |
| CI              | GitHub Actions                       |
| Linting         | ESLint + Prettier                    |
| OS              | Windows / PowerShell (LF normalized) |

---

## Project Structure

\`\`\`
src/
├─ app.controller.ts
├─ app.service.ts
├─ app.module.ts
├─ main.ts
├─ lib/
│ ├─ utils/isDefined.ts
│ ├─ types/json.ts
│ ├─ errors/AppError.ts
│ └─ index.ts
├─ infra/
│ └─ mongo/ # local bootstrap (Docker-managed Mongo)
└─ modules/
├─ health/ # HTTP health endpoints
├─ docker/ # internal Docker client/service
├─ mongodb/ # internal thin MongoDB bridge
└─ fields/ # HTTP: field registry (Stage 1)
test/
├─ app.e2e-spec.ts
├─ modules/
│ ├─ health.e2e-spec.ts
│ ├─ docker.e2e-spec.ts
│ └─ fields.e2e-spec.ts
└─ helpers/
└─ docker.ts
\`\`\`

---

## Development Workflow

We grow the API one module at a time:

1. **Scaffold** module (\`src/modules/<name>\`): controller, service, dto, tests.
2. Implement **service** (strict, reusable API), then controller (thin).
3. Add **unit tests** next to code; **e2e** under \`test/modules/\`.
4. Run locally:
   \`\`\`bash
   pnpm run lint
   pnpm run build
   pnpm test
   pnpm run test:e2e
   \`\`\`
5. Commit & push — CI must be fully green.
6. **README update** after each module (this file).

---

## Commands

\`\`\`bash
pnpm run lint
pnpm run format:check
pnpm run build
pnpm test
pnpm run test:e2e
\`\`\`

---

## CI Pipeline

Every push triggers:

1. **Install deps** (pnpm)
2. **Lint**
3. **Build**
4. **Unit tests**
5. **E2E tests**

Defaults:

- \`DOCKER_E2E=0\` on CI to skip Docker-dependent specs.
- Mongo Infra auto-bootstrap is skipped on CI; local dev can enable it.

---

## Modules Implemented

### Health (HTTP)

**Date:** 2025-10-06
**Description:** Basic liveness & environment endpoints.

**Routes**

- \`GET /api/health/ping\` → \`{ ok, timestamp, epochMs, uptimeSec }\`
- \`GET /api/health/info\` → \`{ status, timestamp, uptimeSec, pid, node, env, version }\`

**Files**

- \`src/modules/health/health.module.ts\`
- \`src/modules/health/health.controller.ts\`
- \`src/modules/health/health.service.ts\`
- \`src/modules/health/dto/Ping.response.dto.ts\`
- \`src/modules/health/dto/Info.response.dto.ts\`
- \`src/modules/health/tests/health.controller.spec.ts\`
- \`src/modules/health/tests/health.service.spec.ts\`
- \`test/modules/health.e2e-spec.ts\`

**Status:** ✅ Green in CI & local.

---

### Docker (Internal Only)

**Summary:** Internal module to manage containers via **dockerode**. No HTTP.
All managed containers are labeled \`com.modular-api.managed=true\` and mount
persistent host folders under \`ApplicationData/containers/<name>\` → container \`/data\`.

**Capabilities**

- \`runContainer(options)\`
- \`getState(name)\`
- \`stop(name)\`, \`restart(name)\`, \`remove(name)\`

**Persistence**

- Host: \`<repo-root>/ApplicationData/containers/<name>\`
- Container: \`/data\`

**Testing**

- Real Docker e2e gated by \`DOCKER_E2E=1\` (default off, CI off).
- Unit tests under \`src/modules/docker/tests/\_\`.

**Deps**

- \`dockerode\` (+ \`@types/dockerode\`)

---

### Mongo Infra (Local Bootstrap)

**Summary:** On app start (local), ensure a **MongoDB** container exists/runs:

- Name: \`app-mongo\`, Image: \`mongo:7\`
- Publishes \`127.0.0.1:27017\` (container 27017)
- Restart: \`unless-stopped\`
- Persistent data: \`<repo-root>/ApplicationData/containers/app-mongo\` → \`/data\` (Mongo uses \`/data/db\`)

**Env (dev defaults)**

- \`MONGO_AUTO_START=1\` (CI sets 0 implicitly)
- \`MONGO_IMAGE=mongo:7\`
- \`MONGO_CONTAINER_NAME=app-mongo\`
- \`MONGO_HOST=127.0.0.1\`
- \`MONGO_PORT=27017\`
- \`MONGO_ROOT_USERNAME=modapi_root\`
- \`MONGO_ROOT_PASSWORD=modapi_root_dev\`

**Testing:** Unit-only (no Docker on CI). Docker e2e is separate/gated.

---

### MongoDB Module (Internal)

**Path:** \`src/modules/mongodb\`
**Purpose:** Thin, strictly-typed bridge to the official MongoDB Node driver. No API re-invention.

**Public API (via DI)**

- \`getDb(dbName?: string): Promise<Db>\`
- \`getCollection<T = Document>(name: string, dbName?: string): Promise<Collection<T>>\`
- \`runCommand(command: Record<string, unknown>, dbName?: string): Promise<Record<string, unknown>>\`
- \`getClient(): Promise<MongoClient>\` (lifecycle managed)

**Internals**

- Lazy singleton client; connects on first use; closes on module destroy.
- Error wrapping via \`MongoActionError\` (extends \`AppError\`).

**Local Integration Tests**

- \`src/modules/mongodb/tests/mongodb.service.spec.ts\`
- Connects to live \`app-mongo\`, performs CRUD, cleans up.
- Auto-skipped on CI.

---

### Fields Module (HTTP)

**Path:** \`src/modules/fields\`
**Purpose:** Manage canonical **field types** (Stage 1 of DB-driven schema). Other datatypes will compose these fields.

**Behavior**

- HTTP under \`/api/fields/\*\`
- Seeds baseline, **locked** field types on local start:
- \`string\`, \`number\`, \`boolean\`, \`date\`, \`enum\`
- Locked fields: **cannot delete**, only \`label\` is mutable
- Custom fields: create / update / delete
- Unique index on \`keyLower\` (case-insensitive uniqueness)

**Bootstrap**

- \`FieldsBootstrap\` ensures index + seeds
- Gated: runs locally; **skips on CI**
- \`FIELDS_BOOTSTRAP=0\` → disable locally

**Endpoints**

- \`GET /api/fields/list\`
- \`GET /api/fields/get?key=<kebab-case>\`
- \`POST /api/fields/create\`
- \`POST /api/fields/update\`
- \`POST /api/fields/delete\`

**Kinds (Stage 1)**

- \`string\`: \`{ minLength?, maxLength?, pattern? }\`
- \`number\`: \`{ min?, max?, integer? }\`
- \`boolean\`: none
- \`date\`: none
- \`enum\`: \`{ values?, caseInsensitive? }\` (seed allows no values)

**Errors**

- Service throws \`MongoActionError\` (extends \`AppError\`)
- Controller maps any \`AppError\` → **HTTP 400**

**Testing**

- Unit (CI-safe):
- \`src/modules/fields/tests/fields.service.spec.ts\` (typed in-memory collection)
- \`src/modules/fields/tests/fields.controller.spec.ts\`
- E2E (local, real Mongo):
- \`test/modules/fields.e2e-spec.ts\` (create → get → update → locked delete reject → delete custom)

**Quick Usage**
\`\`\`http
POST /api/fields/create
{
\"key\": \"summary\",
\"label\": \"Summary\",
\"kind\": { \"type\": \"string\", \"constraints\": { \"minLength\": 1, \"maxLength\": 4000 } }"
}
\`\`\`

---

## Notes & Next Steps

- Proceed to **Datatypes**: compose fields into typed definitions (stored in DB).
- Enforce richer validation and relationships at the generic layer.
- (Optional) Add backups via \`mongodump --gzip\` through the Docker module.

---

## Author

Maintained by **Yair Levy (@supraniti)**
Contributions follow the step-by-step modular protocol described above.

────────────────────────────────────────────────────────
Added Module: Datatypes
────────────────────────────────────────────────────────
Date: 2025-10-07
Description: Generic, DB-driven entity type definitions. Stage 2A implements “draft” datatypes with composition management (add/update/remove fields) and storage mode selection. No publish lifecycle yet (planned for Stage 2B).

Scope
• HTTP-exposed under /api/datatypes/\*
• Backed by the native Mongo driver via our internal MongodbModule
• Composes from canonical Fields (keys must exist in /api/fields)
• Drafts only in this stage; composition changes allowed only for drafts

Storage Modes (Stage 2A)
• single — placeholder for future unified “data” collection (indexes deferred to Stage 3)
• perType — creates a backing collection per datatype: data\_<key>
– Automatically creates/drops unique indexes for fields with { unique: true, array: false }

Composition Rules (Stage 2A)
• Field key must be kebab-case
• A field cannot be both unique and array
• Referenced field keys must exist in the Fields collection (seeded or custom)

Routes
• GET /api/datatypes/list
→ Returns an array of datatype definitions (drafts included)
• GET /api/datatypes/get?key=<kebab>
→ Returns one datatype or null
• POST /api/datatypes/create
Body: { key, label, storage?: { mode: 'single'|'perType' }, fields?: [ { fieldKey, required, array, unique?, constraints?, order? } ], indexes?: [{ keys, options? }] }
→ Creates a draft definition; for perType ensures backing collection and unique indexes
• POST /api/datatypes/add-field
Body: { key, field: { fieldKey, required, array, unique?, constraints?, order? } }
• POST /api/datatypes/update-field
Body: { key, fieldKey, patch: { required?, array?, unique?, constraints?, order? } }
Note: Renaming fieldKey is not supported in this stage
• POST /api/datatypes/remove-field
Body: { key, fieldKey }
Note: For perType, drops relevant unique index if it exists

Files
• src/modules/datatypes/datatypes.module.ts
• src/modules/datatypes/datatypes.controller.ts
• src/modules/datatypes/datatypes.service.ts
• src/modules/datatypes/internal/index.ts (shared types & helpers)
• src/modules/datatypes/dto/
– ListDatatypes.request.dto.ts
– GetDatatype.request.dto.ts
– CreateDatatype.request.dto.ts
– AddField.request.dto.ts
– UpdateField.request.dto.ts
– RemoveField.request.dto.ts
– ListDatatypes.response.dto.ts (canonical wire DTOs)
– type-only re-exports: GetDatatype.response.dto.ts, CreateDatatype.response.dto.ts, AddField.response.dto.ts, UpdateField.response.dto.ts, RemoveField.response.dto.ts
• Unit tests (CI-safe):
– src/modules/datatypes/tests/datatypes.service.spec.ts (typed in-memory DB & collection)
– src/modules/datatypes/tests/datatypes.controller.spec.ts
• E2E (local, gated):
– test/modules/datatypes.e2e-spec.ts (skips when CI=1)

Environment & Gating
• Requires local Mongo infra (MONGO_AUTO_START=1 default locally)
• E2E runs only locally; CI skips via describe.skip when CI=1
• Fields seeds must exist (Fields bootstrap runs locally; can be disabled with FIELDS_BOOTSTRAP=0)

Quick Examples
Create (perType):
POST /api/datatypes/create
{
"key": "article",
"label": "Article",
"storage": { "mode": "perType" },
"fields": [
{ "fieldKey": "string", "required": true, "array": false, "unique": true, "order": 0 }
]
}

Add field:
POST /api/datatypes/add-field
{ "key": "article", "field": { "fieldKey": "number", "required": false, "array": false, "unique": false } }

Update field (toggle unique):
POST /api/datatypes/update-field
{ "key": "article", "fieldKey": "number", "patch": { "unique": true } }

Remove field:
POST /api/datatypes/remove-field
{ "key": "article", "fieldKey": "string" }
