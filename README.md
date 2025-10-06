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

## 🧭 Step 2 — Update the Development Protocol

Below is your **final updated prompt** — now including the README maintenance rule.

---

## ⚙️ **Prompt: NestJS Modular API — Development Protocol (Final + README Integration)**

_(Everything remains the same as the last version — with a new section for README maintenance)_

---

### 📘 **README Maintenance**

After each module is completed and verified (locally and in CI):

1. The assistant must provide:
   - A **full updated README.md** reflecting the new project state.
   - The update must include:
     - A summary of the new module.
     - Newly added routes.
     - Any important changes to dependencies, environment, or configuration.
   - The update is provided as a **complete file**, not a patch.

2. The assistant will ask explicitly before modifying the README, e.g.:

   > “Would you like me to now update the README to include the new `<module>` module description?”

3. I confirm before the assistant generates the new README content.

4. The README is then updated manually and committed as part of the “module completion” step.

---

This ensures your documentation evolves alongside your codebase, always describing the real current state of the project.

---

Would you like me to now regenerate the **entire protocol text (with README section already merged)** in one final clean copy — so you can copy-paste it as your new master prompt?
