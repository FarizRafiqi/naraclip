# NaraClip

> Turn a simple idea into a polished vertical explainer video.

NaraClip adalah platform yang membantu mengubah prompt menjadi video explainer vertikal berbasis
asset visual. Aplikasi ini menggabungkan story planning, asset generation, caption, dan rendering
deterministik dalam satu alur kerja yang dapat dikembangkan secara bertahap.

<p>
  <a href="https://github.com/FarizRafiqi/naraclip">Repository</a> ·
  <a href="https://github.com/FarizRafiqi/naraclip/issues">Issues</a>
</p>

## What NaraClip does

```text
Prompt
  ↓
Story brief & scene plan
  ↓
Visual assets + narration + captions
  ↓
HyperFrames composition
  ↓
Vertical explainer video (9:16)
```

Fondasinya sudah mencakup autentikasi, project ownership, database terstruktur, object storage,
shared contracts, dan renderer pipeline. Fitur-fitur berikutnya dapat dibangun di atas kontrak dan
boundary yang sama tanpa memecah aplikasi menjadi beberapa frontend terpisah.

## Architecture

NaraClip menggunakan satu aplikasi **AdonisJS v7** sebagai backend sekaligus web server. **Inertia
React** menangani halaman interaktif di browser, sementara HyperFrames tetap berada di workspace
terpisah karena bertanggung jawab atas komposisi dan rendering video.

```text
┌──────────────────────────────────────────────────────────────┐
│                        NaraClip app                          │
│  AdonisJS routes · auth · API · Lucid · Inertia shell       │
│                         │                                    │
│                    Inertia React                            │
└─────────────────────────┼────────────────────────────────────┘
                          │ shared contracts
             ┌────────────┴────────────┐
             │                         │
      packages/contracts          renderer/
      Zod schemas & fixtures      HyperFrames 0.8.4
```

## Tech stack

| Area              | Technology                                              |
| ----------------- | ------------------------------------------------------- |
| Application       | AdonisJS 7.4, Lucid 22, VineJS                          |
| Frontend          | Inertia React, React 19, Vite 8                         |
| UI                | Tailwind CSS 4, Framer Motion                           |
| Database          | PostgreSQL for production, SQLite for local smoke tests |
| Object storage    | MinIO (self-hosted, S3-compatible) through the S3 SDK   |
| Image generation  | ComfyUI (local), 9Router/OpenAI-compatible, SVG fallback |
| Video composition | HyperFrames 0.8.4                                       |
| Workspace         | pnpm 10 with `renderer/` and `packages/contracts/`      |

## Project structure

```text
app/                 controllers, models, middleware, and services
bin/                 AdonisJS entrypoints
config/              application, database, auth, Inertia, and Vite config
database/            Lucid migrations, seeders, and generated schema
inertia/             React pages, layouts, and frontend entrypoints
packages/contracts/  versioned SceneSpec, RenderSpec, and provider contracts
renderer/            HyperFrames workspace and per-video projects in content/<slug>/
docs/                 product notes, specifications, and the video-production playbook
resources/           Inertia HTML shell
start/               routes, environment, and application kernel
tests/               Japa functional/unit tests and contract fixtures
```

## Requirements

- Node.js 24.x
- npm 11.x
- pnpm 10.x
- PostgreSQL when using `DB_CONNECTION=pg`
- Docker (optional) for the bundled PostgreSQL, Redis, and MinIO services

## Getting started

```bash
pnpm install
cp .env.example .env
node ace migration:run
node ace db:seed
pnpm dev
```

The development seed creates an admin account and one example project:

```text
Email:    demo@naraclip.local
Password: password
```

Set `DEFAULT_USER_PASSWORD` before seeding to use a different local password. The seeders are
idempotent and can be run repeatedly during development.

### Run with Docker Compose

`docker-compose.yml` brings up the app together with its dependencies:

| Service    | Purpose                                | Port               |
| ---------- | -------------------------------------- | ------------------ |
| `app`      | NaraClip (production Dockerfile)       | 3333               |
| `postgres` | PostgreSQL 17                          | 5432               |
| `redis`    | Job queue                              | 6379               |
| `minio`    | S3-compatible object storage + console | 9000 (API), 9001   |

```bash
cp .env.example .env
node ace generate:key   # copy the printed APP_KEY into .env
docker compose up -d
```

The `MINIO_*` values in `.env.example` are development defaults. Change the access and secret keys
before exposing MinIO outside your machine.

`pnpm dev` also starts the `minio` service on demand (when Docker is available), then launches the
app on <http://localhost:3333> and the HyperFrames Studio on <http://localhost:3002>. Use
`pnpm dev:app` to run only the AdonisJS app.

### Run with SQLite

For a local smoke test without PostgreSQL, set `DB_CONNECTION=sqlite`, then run:

```bash
TMPDIR=/tmp node ace migration:fresh
pnpm test
pnpm test:contracts
```

### Run the renderer

Start the HyperFrames workspace separately when working on compositions:

```bash
pnpm dev:renderer
```

Follow the [video production playbook](docs/video-production-playbook.md) when creating or revising video content.

## Useful commands

| Command               | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `pnpm dev`            | Start MinIO (if needed), AdonisJS, and the HyperFrames Studio |
| `pnpm dev:app`        | Start only AdonisJS with hot reload      |
| `pnpm migrate`        | Run database migrations (`migrate:rollback`, `migrate:status` also available) |
| `pnpm dev:renderer`   | Start the HyperFrames renderer workspace |
| `pnpm build`          | Build the production application         |
| `pnpm typecheck`      | Check backend and Inertia TypeScript     |
| `pnpm test`           | Run AdonisJS unit and functional tests   |
| `pnpm test:contracts` | Run shared contract tests                |
| `pnpm lint`           | Run ESLint                               |
| `pnpm check`          | Run the complete local quality gate      |

## Image providers

Image generation goes through `resolveImageProvider()` and the `provider_configs` / `provider_routes`
tables, so the active provider can change without touching the pipeline. The seeders register:

| Provider ID   | Backend                                                         | Configuration                                  |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `svg-local`   | Deterministic SVG placeholder (default route, no dependencies)  | none                                           |
| `comfyui`     | Local ComfyUI API                                               | `COMFYUI_ENDPOINT`                             |
| `9router`     | OpenAI-compatible `/images/generations` gateway                 | `NINEROUTER_ENDPOINT`, `NINEROUTER_API_KEY`    |

Point a capability's primary route at `comfyui` or `9router` to use them. Secrets stay on the server.

## Data and security foundations

- Relational data is split into normalized tables with foreign keys, constraints, and operational
  indexes.
- JSONB is reserved for immutable provider/config snapshots and asset metadata.
- Project reads are scoped to the authenticated owner.
- MinIO objects use safe scoped keys and private-bucket access through signed URLs.
- Provider secrets are loaded from environment variables and are never sent to the frontend.

See the [database normalization notes](docs/database-normalization.md) for the schema decisions.

## Current focus

The next development areas are the generation pipeline, provider routing, image assets, narration,
HyperFrames compilation, and the user-facing project flow. Follow the [GitHub issues](https://github.com/FarizRafiqi/naraclip/issues)
for implementation progress and technical decisions.

## License

This project is currently private and intended for internal development.
