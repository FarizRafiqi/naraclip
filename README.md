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
| Object storage    | Cloudflare R2 through the S3 SDK                        |
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
renderer/            HyperFrames composition for 9:16 output
resources/           Inertia HTML shell
start/               routes, environment, and application kernel
tests/               Japa functional/unit tests and contract fixtures
```

## Requirements

- Node.js 24.x
- npm 11.x
- pnpm 10.x
- PostgreSQL when using `DB_CONNECTION=pg`

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

## Useful commands

| Command               | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `pnpm dev`            | Start AdonisJS with hot reload           |
| `pnpm dev:renderer`   | Start the HyperFrames renderer workspace |
| `pnpm build`          | Build the production application         |
| `pnpm typecheck`      | Check backend and Inertia TypeScript     |
| `pnpm test`           | Run AdonisJS unit and functional tests   |
| `pnpm test:contracts` | Run shared contract tests                |
| `pnpm lint`           | Run ESLint                               |
| `pnpm check`          | Run the complete local quality gate      |

## Data and security foundations

- Relational data is split into normalized tables with foreign keys, constraints, and operational
  indexes.
- JSONB is reserved for immutable provider/config snapshots and asset metadata.
- Project reads are scoped to the authenticated owner.
- R2 objects use safe scoped keys and private-bucket access through signed URLs.
- Provider secrets are loaded from environment variables and are never sent to the frontend.

See the [database normalization notes](docs/database-normalization.md) for the schema decisions.

## Current focus

The next development areas are the generation pipeline, provider routing, image assets, narration,
HyperFrames compilation, and the user-facing project flow. Follow the [GitHub issues](https://github.com/FarizRafiqi/naraclip/issues)
for implementation progress and technical decisions.

## License

This project is currently private and intended for internal development.
