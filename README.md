# NaraClip

NaraClip adalah platform untuk mengubah ide menjadi video explainer vertikal berbasis asset
visual. MVP memakai satu aplikasi AdonisJS v7 sebagai backend sekaligus web app melalui Inertia
React.

## Struktur inti

```text
app/                 controllers, models, middleware, services
bin/                 AdonisJS entrypoints
config/              konfigurasi AdonisJS, database, Inertia, dan Vite
database/            migration Lucid dan generated schema
inertia/             halaman React dan layout web
packages/contracts/  SceneSpec, RenderSpec, dan provider contracts
renderer/            HyperFrames composition untuk output 9:16
resources/           shell HTML Inertia
start/               routes, middleware kernel, environment
tests/               Japa tests
```

Frontend browser tidak dipisah menjadi aplikasi Next. AdonisJS menangani routing, auth, session,
API, dan rendering shell; Inertia React menangani halaman interaktif. HyperFrames tetap berada di
`renderer/` karena ia adalah pipeline render video, bukan frontend aplikasi.

## Stack MVP

- AdonisJS 7.4 + Lucid 22 + VineJS
- Inertia React + React 19 + Vite 8
- Tailwind CSS 4 + Framer Motion
- PostgreSQL untuk production; SQLite untuk smoke test lokal
- Cloudflare R2 melalui S3 SDK
- HyperFrames 0.8.4
- pnpm 10 workspace untuk `renderer/` dan `packages/contracts/`

## Local setup

Requirements: Node.js 24.x, npm 11.x, pnpm 10.x. PostgreSQL hanya diperlukan jika memakai
`DB_CONNECTION=pg`.

```bash
pnpm install
cp .env.example .env
node ace migration:run
node ace db:seed
pnpm dev
```

Development seed creates `demo@naraclip.local` as admin and one demo project. Set
`DEFAULT_USER_PASSWORD` before seeding to override its development password.

Untuk smoke test tanpa PostgreSQL, ubah `DB_CONNECTION=sqlite` lalu jalankan:

```bash
TMPDIR=/tmp node ace migration:fresh
pnpm test
pnpm test:contracts
```

Jalankan renderer secara terpisah dengan `pnpm dev:renderer`. Render video belum menjadi bagian
dari verifikasi otomatis MVP.

## Verification

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm --filter @naraclip/renderer check
```

Keputusan normalisasi database dan alasan snapshot JSONB ada di
[`docs/database-normalization.md`](docs/database-normalization.md).
