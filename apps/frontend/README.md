# Modular API Frontend Explorer

A lightweight Vue 3 + Vite playground that lives alongside the NestJS backend for local QA and endpoint discovery. The app is intentionally isolated from the backend build so it never blocks server-side CI.

## Getting started

```bash
pnpm install # installs dependencies for the whole workspace
pnpm --filter frontend dev
```

The frontend assumes the NestJS API is running on `http://localhost:3000`. Adjust the target base URL in a `.env` file copied from `.env.example`.

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

## Usage tips

- Edit the request path, method, and body to exercise different endpoints.
- Responses are formatted automatically when valid JSON is returned.
- Headers and bodies remain accessible even for non-JSON responses.

## Local-only tooling

The frontend ships with Vite dev tooling and optional lint/build commands, but **no CI hooks** are registered in the root project. Run the commands manually when needed:

```bash
pnpm --filter frontend build
```

When the toolset graduates to production, migrate it to a dedicated repository without impacting the backend pipeline.
