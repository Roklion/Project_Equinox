# Project Equinox

Equinox is a personal investment and wealth tracker for desktop and iPhone. It tracks dated values, cash flows, performance and composition for one household using Next.js, React, TypeScript and PostgreSQL.

## Documentation

Each document owns a distinct contract; other documentation links to it rather than restating it.

- [Product specification](docs/product-spec.md): scope and supported workflows.
- [Data model](docs/data-model.md): canonical entities and financial invariants.
- [Metrics](docs/metrics.md): calculations, reporting scopes and result states.
- [Design system](docs/design-system.md): presentation, forms, navigation and chart interactions.
- [Architecture](docs/architecture.md): code boundaries, persistence, authentication and caching.
- [Product regression validation](docs/product-validation.md): automated coverage and validation commands.
- [Installable app validation](docs/pwa-validation.md): browser and physical-device installation checks.
- [Hosted deployment](docs/hosted-deployment.md): release setup and verification.
- [Backup and restore](docs/backup-and-restore.md): private dumps, retention and disposable restore checks.
- [Migration and portability](docs/migration-and-portability.md): local XLSX mapping, preflight/import, reconciliation and canonical export.
- [Agent guidance](AGENTS.md): repository safety and engineering/review practices.

## Current capabilities

The app includes password authentication, first-run household setup, Settings for owners/classifications, investment management, financial entry/correction/history, household and scoped Overview analytics, historical charts and valuation maintenance. Investment creation is separate from the four financial Add actions. The installable experience is online-only.

Local migration libraries support XLSX parsing, preflight, atomic import and reconciliation; a separate command exports canonical JSON. The composed private migration CLI and operator runbook remain [#68](https://github.com/Roklion/Project_Equinox/issues/68)/[#70](https://github.com/Roklion/Project_Equinox/issues/70) work, not commands available in this checkout.

## Local setup

Install the Node.js version in `.nvmrc` and npm version declared in `package.json`, then run:

```sh
npm ci
```

Configure [local PostgreSQL](#local-postgresql) and [authentication](#authentication), then start the app:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000), sign in, and complete household setup. Create an investment; optional classifications may remain empty. Settings maintains household/owner names and classification choices without SQL or demo seeding. Unit tests and production builds need no database. [Environment configuration](docs/architecture.md#environment-configuration) covers variable loading and LAN phone testing.

## Project commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Build / serve the production application |
| `npm run lint` | Run ESLint and dependency-boundary rules |
| `npm run typecheck` | Generate route types and run TypeScript checks |
| `npm test` / `npm run test:watch` | Run / watch unit tests |
| `npm run check` | Run lint, type checks, units and production build |
| `npm run test:db` | Run PostgreSQL integration tests in disposable databases |
| `npm run test:presentation` | Check synthetic layouts and chart interactions in Chromium |
| `npm run test:e2e` | Run desktop/phone workflows, including clean bootstrap |
| `npm run test:bootstrap` | Run clean-household setup workflows separately |
| `npm run db:up` / `npm run db:down` | Start / stop Compose PostgreSQL, retaining its volume |
| `npm run db:generate -- --name=description` | Generate versioned SQL and schema snapshots |
| `npm run db:migrate` | Apply committed migrations to `DATABASE_URL` |
| `npm run db:seed` | Seed an empty local household database with synthetic records |
| `npm run db:verify` | Check connectivity with a temporary synthetic read/write |
| `npm run db:reset` | **Delete the Compose volume**, restart and migrate |
| `npm run data:export -- …` | Export/validate private canonical JSON; [usage](docs/migration-and-portability.md#private-local-command) |

## Local PostgreSQL

Install Docker with Compose v2 support. Copy `.env.example` to ignored `.env.local` and fill:

```dotenv
POSTGRES_PASSWORD=<choose-a-local-password>
DATABASE_URL=postgresql://equinox:<URL-encoded-local-password>@127.0.0.1:5433/equinox
```

Replace placeholders privately; a generated hexadecimal password avoids escaping problems. Port 5433 must be free. Compose binds only to loopback and stores data in a Docker-managed volume.

```sh
npm run db:up
npm run db:migrate
```

Stop with `npm run db:down`; data survives. The password initializes a new volume, so changing the environment file does not change an existing database password. An existing standard PostgreSQL service is also supported: set its `DATABASE_URL` and run migrations. Hosted TLS requirements belong in the connection URL; the adapter does not disable certificate verification.

Normal first use needs no seed. For invented development data, run `npm run db:seed` after migrations. It accepts only a loopback host and an empty household database; repeating it reports the existing demo. For an intentional **destructive rebuild of disposable local data**, run `npm run db:reset`, then seed if wanted. Reset deletes the `equinox-local` Compose volume. Verify the target first; never use it for shared or production data.

## Authentication

Generate a password hash with `node scripts/auth-secrets.mjs hash` (the prompt does not echo it), and an independent signing secret with `node scripts/auth-secrets.mjs secret`. Store them in ignored `.env.local`:

```dotenv
APP_PASSWORD_HASH=scrypt\$16384\$8\$1\$<salt>\$<digest>
SESSION_SECRET=<locally-generated-hex-secret>
```

Next.js expands dollar-sign references in environment files: escape each dollar sign in the generated hash as `\$` in `.env.local`. Enter the unescaped hash in Vercel. Never publish the raw password, hash, signing secret or database URL, or place them in `NEXT_PUBLIC_` variables.

Apply database migrations before signing in. [Architecture](docs/architecture.md#authentication-boundary) owns session, throttling and failure behavior. [Hosted deployment](docs/hosted-deployment.md) owns production configuration and sign-in verification before real data entry.

## Changing the schema

Edit `src/persistence/schema.ts`, then run:

```sh
npm run db:generate -- --name=describe_the_change
npm run db:migrate
npm run test:db
```

Review and commit SQL, snapshots and journal under `drizzle/` with the schema change. Never edit an applied migration; add a forward migration. Production/shared environments apply committed migrations explicitly with `db:migrate`, not schema push. The migration environment needs CLI dependencies and `drizzle/`; no migration runs during builds or rendering.

## Validation setup

For database and browser tests, create ignored `.env.test.local` or set a process-local maintenance connection:

```dotenv
TEST_DATABASE_URL=postgresql://equinox:<URL-encoded-local-password>@127.0.0.1:5433/postgres
```

The role needs `CREATEDB`. Tests create and remove uniquely named databases, never reset the application or maintenance database. Browser runners accept only loopback hosts and use synthetic data. Install Chromium with `npx playwright install chromium`; `E2E_PORT` can override default port 3100. Interrupted runs may leave generated test databases for manual cleanup. Tests do not load `.env.local` or fall back to `DATABASE_URL`.

[Product regression validation](docs/product-validation.md#commands-and-ci) lists applicable checks and their coverage. GitHub Actions runs unit/build/database and browser validation against ephemeral PostgreSQL services without hosted credentials.

## Data safety

This repository is public. Use generic names and synthetic values in all checked-in artifacts. Real financial data, private account/institution details and anything copied or derived from a private workbook stay outside public checkouts. See [repository safety](AGENTS.md#repository-safety) and [private artifact handling](docs/migration-and-portability.md#private-local-command).
