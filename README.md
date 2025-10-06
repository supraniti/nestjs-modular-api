# NestJS Modular API

A fully typed, modular NestJS backend exposing a single `/api` endpoint.

---

## 📘 Project Overview

This project provides a foundation for building modular APIs using **NestJS**, where each module defines its own actions under `/api/:module/:action`.  
Modules can expose both short and long-running actions, and can also invoke other modules internally.

All code follows strict typing and NestJS conventions, with linting, formatting, and CI verification on every change.

---

## 🏗️ Current State

✅ **Environment Setup Completed**

- NestJS scaffold verified with `pnpm build`, `pnpm test`, and `pnpm run test:e2e`
- `/api` global prefix and validation pipe configured in `main.ts`
- `/api/health` endpoint implemented (`HealthController`)
- `@nestjs/config` integrated with `.env`, `.env.example`, `.env.test`
- Shared utilities added in `src/lib/`:
  - `isDefined()` helper
  - `JsonValue` type
  - `AppError` class
- TS path alias `@lib/*` configured
- ESLint + Prettier harmony established
- GitHub Actions CI workflow:
  - Installs pnpm
  - Lints, builds, and runs unit + e2e tests
  - `DOCKER_E2E=0` by default
- All tests and CI workflows are green

---

## ⚙️ Environment Details

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

## 📁 Project Structure

src/
├─ app.controller.ts
├─ app.service.ts
├─ app.module.ts
├─ health.controller.ts
├─ lib/
│ ├─ utils/isDefined.ts
│ ├─ types/json.ts
│ ├─ errors/AppError.ts
│ └─ index.ts
└─ main.ts
test/
├─ app.e2e-spec.ts
└─ helpers/docker.ts

---

## 🚀 Next Steps

- Begin adding new modules under `src/modules/`
- Each module exposes one or more `/api/:module/:action` routes
- Each module includes:
  - Controller
  - Service
  - DTOs (if needed)
  - Tests under `src/modules/<module>/tests/`
- After every completed module:
  - The README is updated with a **“Modules Implemented”** section describing new functionality.

---

## 🧪 Commands

```bash
pnpm run lint
pnpm run format:check
pnpm run build
pnpm test
pnpm run test:e2e
```

✅ CI Workflow

Every push triggers the GitHub Actions pipeline:

Install dependencies

Lint

Build

Run unit tests

Run e2e tests

CI runs with DOCKER_E2E=0 by default to skip Docker-dependent specs.

🧩 Future Modules
Module Description Status
Example: users Manage user CRUD operations and internal identity checks ⬜ Planned
🧑‍💻 Author

Maintained by Yair Levy (@supraniti)
Contributions follow the step-by-step modular protocol documented below.

---

──────────────────────────────

## Added Module: Health

**Date:** 2025-10-06  
**Description:** Basic liveness and environment status endpoints.

**Routes**

- GET /api/health/ping  
  → Returns `{ ok: true, timestamp, epochMs, uptimeSec }`  
  → DTO: PingResponseDto
- GET /api/health/info  
  → Returns `{ status: 'ok', timestamp, uptimeSec, pid, node, env, version }`  
  → DTO: InfoResponseDto

**Files**

- src/modules/health/health.module.ts
- src/modules/health/health.controller.ts
- src/modules/health/health.service.ts
- src/modules/health/dto/Ping.response.dto.ts
- src/modules/health/dto/Info.response.dto.ts
- src/modules/health/tests/health.controller.spec.ts
- src/modules/health/tests/health.service.spec.ts
- test/modules/health.e2e-spec.ts

**Status:** ✅ All lint/build/unit/e2e tests passed locally and in CI.
──────────────────────────────

Docker Module (internal-only)

Summary:
Internal Nest module that manages Docker containers by name with no HTTP routes. Other modules inject DockerService and call it directly. All managed containers are labeled and mount a per-container persistent host folder under ApplicationData/containers/<name> (mounted inside the container at /data). Uses the Docker SDK (dockerode). Real Docker e2e tests are gated and do not run in CI.

Capabilities:

runContainer(options): create and start a container from an image. Pulls the image if needed but is a no-op if the image already exists locally.

getState(name): returns normalized container status including id, status, ports, labels, timestamps.

stop(name), restart(name), remove(name): lifecycle operations by container name only.

Applies label com.modular-api.managed=true to every container for safe filtering.

Persistent data paths:
Host path: <repo-root>/ApplicationData/containers/<name>
Container path: /data

HTTP Exposure:
None. This module is internal only and exposes no /api routes.

Environment and Testing:

DOCKER_E2E=1 enables real Docker e2e locally. Default is off. CI runs with this off.

When DOCKER_E2E is not 1, the docker e2e suite is marked as skipped.

Docker host detection:
Windows uses npipe:////./pipe/docker_engine
Linux and macOS use /var/run/docker.sock

Dependencies:

Runtime dependency: dockerode

Type definitions: @types/dockerode

Key Files:

src/modules/docker/docker.module.ts: module wiring and export of DockerService

src/modules/docker/docker.service.ts: high-level service API for other modules

src/modules/docker/internal/docker.client.ts: typed Docker wrapper with timeouts, labeling, and persistent volume enforcement

src/modules/docker/internal/docker.types.ts: strict types and defaults

src/modules/docker/internal/path.util.ts: ApplicationData path helpers and env/port utilities

src/modules/docker/internal/docker.error.ts: DockerError and error wrapper

Tests:
Unit: src/modules/docker/tests/docker.service.spec.ts
E2E (gated): test/modules/docker.e2e-spec.ts (uses mongo:latest and the persistent volume)

Usage (internal example):
Inject DockerService in another module or service and call:
await dockerService.runContainer({
name: 'modapi-mongo-e2e',
image: 'mongo:latest',
env: { MONGO_INITDB_ROOT_USERNAME: 'root', MONGO_INITDB_ROOT_PASSWORD: 'pass' },
ports: [{ host: 27017, container: 27017 }]
});

Conventions:
When adding any third-party SDK, also add its @types package (if separate) to keep typing strict and ESLint clean.

—
