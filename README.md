# Project Equinox

Project Equinox is a personal investment and wealth tracker designed for desktop and iPhone. It gives a household a clear view of investment values, cash flows, performance, and composition without requiring security or tax-lot accounting.

The application foundation uses Next.js App Router, React, and TypeScript in one responsive web codebase, with Drizzle and standard PostgreSQL persistence tooling. Installable PWA metadata is implemented for online use; Apache ECharts renders historical value and composition charts. Python and FastAPI may be introduced later for specialized analytics or imports when that boundary is justified.

## Documentation

- [Product specification](docs/product-spec.md) defines users, scope, workflows, and product requirements.
- [Data model](docs/data-model.md) defines entities, canonical actions, and invariants.
- [Metrics](docs/metrics.md) defines financial measures and aggregation rules.
- [Design system](docs/design-system.md) defines interface and interaction direction.
- [Architecture](docs/architecture.md) defines technical boundaries and the initial platform direction.
- [Product regression validation](docs/product-validation.md) maps the desktop/iPhone journeys, accessibility and financial presentation checks.
- [Installable app validation](docs/pwa-validation.md) lists desktop and iPhone checks for the online-only experience.
- [Backup and restore](docs/backup-and-restore.md) covers portable PostgreSQL dumps, retention, NAS scheduling, and disposable restore checks.
- [Migration and portability](docs/migration-and-portability.md) defines source-neutral migration records, preflight findings, reconciliation expectations, and the private canonical export command/format.
- [Agent guidance](AGENTS.md) defines repository working practices.

## Status

The foundation includes a responsive shell, PostgreSQL tooling, password-only authentication, installable PWA metadata, canonical financial records, EPIC 2 entry/batch/history workflows, and authoritative EPIC 3 analytics. Responsive Investments/detail/management, household Overview summaries, and Update Center valuation maintenance consume those existing contracts. The four financial Add actions remain separate from investment creation. Overview integrates the merged interactive value-trend and composition charts, with a common reporting date and current asset-class composition. Offline financial-data behavior is intentionally deferred.

EPIC 5 now has source-neutral migration contracts and a private, versioned canonical export command. See [migration and portability](docs/migration-and-portability.md) for the format, validation, command usage and remaining import/reconciliation boundaries.

## Local setup

After household setup, **Settings** maintains household/owner names and the six classification/custom-group dimensions without demo seeding or SQL. Investment forms link to the relevant settings section. See [runtime administration](docs/product-spec.md#runtime-administration) for behavior and [canonical identity/removal rules](docs/data-model.md#runtime-administration).

Install Node.js 24.x (see `.nvmrc`) and npm 11.x. From a clean checkout:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Unit tests and the production build do not need a database. Signing in requires the database and authentication setup below. See [environment configuration](docs/architecture.md#environment-configuration); never put secrets in `NEXT_PUBLIC_` values.

## Project commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build locally after building |
| `npm run lint` | Run ESLint, including initial dependency-boundary rules |
| `npm run typecheck` | Generate Next.js route types and run strict TypeScript checks |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Watch unit tests during development |
| `npm run test:e2e` | Run focused desktop and iPhone-class browser workflows against a disposable PostgreSQL database |
| `npm run test:bootstrap` | Test clean-database household setup and first investment on desktop and iPhone |
| `npm run test:presentation` | Check shared financial layouts, dates, navigation, focus, and touch targets at desktop/iPhone widths without a database |
| `npm run check` | Run lint, type checks, tests, and production build in order |
| `npm run db:up` | Start local PostgreSQL with Docker Compose and wait for readiness |
| `npm run db:down` | Stop local PostgreSQL, retaining its data volume |
| `npm run db:generate -- --name=description` | Generate versioned SQL and snapshots from the Drizzle schema |
| `npm run db:migrate` | Apply pending committed migrations to `DATABASE_URL` |
| `npm run db:seed` | Seed an empty local database with the synthetic demo portfolio; safe to repeat |
| `npm run db:verify` | Exercise a server-side synthetic PostgreSQL write/read in a temporary table |
| `npm run db:reset` | **Delete the Compose database volume**, restart, and apply migrations |
| `npm run test:db` | Test migrations and connections in a newly created disposable database |

Run `npm run check` and `git diff --check` before handing off changes, plus `npm run test:db` when changing persistence or migrations. Unit tests use Vitest's Node environment and cover the active/closed entry policy and database configuration. Database tests are separate so everyday UI/domain development needs no database.

Browser workflow tests require a local PostgreSQL maintenance connection in `TEST_DATABASE_URL` (for example the disposable Compose service's `postgres` database) and `npx playwright install chromium`. Run `npm run test:e2e`. The runner accepts only a loopback database host, creates and removes its own uniquely named database, migrates it, and seeds synthetic demo records. It starts a local Next.js server with a test-only password and signing secret; no production credentials or private data are needed. Use E2E_PORT to select another local server port when a separate worktree already uses the default 3100.

The authenticated shell offers Overview, Investments, Update Center, Add entry, and secondary sign out on desktop and phone. Investments opens canonical record details and preselected history; Update Center reuses the existing batch and correction workflows. Overview and Update Center provide live household summaries and maintenance guidance; see [their presentation contract](docs/design-system.md#household-overview-and-valuation-maintenance). See [navigation and shared presentation](docs/design-system.md#navigation-and-shared-presentation-foundation). `npm run test:presentation` renders synthetic component fixtures with production CSS and checks them in Chromium; install Chromium with the same command above.

See [architecture](docs/architecture.md#responsibility-boundaries) for the source layout and dependency direction, and [personal-app scope](docs/architecture.md#personal-app-scope) for implementation tradeoffs.

## Local PostgreSQL

Install and start Docker with Compose v2 support (for example, Docker Desktop). Copy `.env.example` to `.env.local` and fill these keys:

```dotenv
POSTGRES_PASSWORD=<choose-a-local-password>
DATABASE_URL=postgresql://equinox:<URL-encoded-local-password>@127.0.0.1:5433/equinox
```

Replace the placeholders; a generated hexadecimal password avoids URL-encoding and environment-interpolation characters. Never commit local environment files. The Compose service uses a Docker-managed volume rather than a repository data directory. Its port is bound only to loopback; port 5433 must be free.

```sh
npm run db:up
npm run db:migrate
```

The baseline records migration history; authentication migrations create failed-login throttling and session tables without introducing financial domain tables. Stop with `npm run db:down`; data survives. The password initializes a new volume, so changing the environment file does not change an existing database password.

For an intentional **destructive rebuild of disposable local data**, run `npm run db:reset`. It removes the `equinox-local` Compose volume, starts a fresh database, and reapplies migrations. Verify `DATABASE_URL` points to this local database before running it. Do not use this workflow for shared or production data.

For normal first use, sign in and complete household setup in the app, then create the first investment. No demo seed or classification records are required. See [first-run setup](docs/product-spec.md#first-run-household-setup).

To populate that fresh local database with invented development records, run `npm run db:seed` after migrations. The command accepts only a loopback PostgreSQL host and an empty household database. A second run reports that the demo portfolio already exists. To rebuild disposable local data and seed again, run `npm run db:reset` followed by `npm run db:seed`. The seed includes example owners, classifications, five investment styles, a linked transfer, debt and negative equity, and a closed investment with retained history. It never runs automatically in production.

An existing standard PostgreSQL service is also supported: set `DATABASE_URL` to that database and run `npm run db:migrate`. Docker is only a development convenience, not a runtime/provider dependency. Configure hosted TLS requirements in the connection URL; certificate verification is not disabled by the adapter.

## Hosted deployment

See [hosted setup and verification](docs/hosted-deployment.md) for the Neon production branch, private Vercel configuration, migration order, synthetic connectivity check, and later migration roll-forward. Keep real financial data out of the hosted app until the authentication work in [Issue #17](https://github.com/Roklion/Project_Equinox/issues/17) is complete and verified.

## Changing the schema

Edit `src/persistence/schema.ts`, then run:

```sh
npm run db:generate -- --name=describe_the_change
npm run db:migrate
npm run test:db
```

Review and commit the generated SQL, snapshots, and journal under `drizzle/` together with the schema change. Never edit an already-applied migration; add a new one. Production and shared environments must apply committed migrations with `npm run db:migrate`, not ad-hoc schema push. The deployment environment must include the CLI dependencies and `drizzle/` directory when running this command. No migration runs during app rendering or building.

## Database integration tests

Create ignored `.env.test.local` with a maintenance connection on the local service:

```dotenv
TEST_DATABASE_URL=postgresql://equinox:<URL-encoded-local-password>@127.0.0.1:5433/postgres
```

Then run `npm run test:db`. The role must have `CREATEDB` permission (the Compose role already does). Tests create a fresh `equinox_test_*` database, use the same migration runner as the CLI, verify reapplication, close connections, and drop only that generated database. They never reset the database named in `DATABASE_URL` or the maintenance connection. A forcibly interrupted run can leave its generated test database for manual cleanup.

CI supplies `TEST_DATABASE_URL` and `DATABASE_URL` against its ephemeral PostgreSQL 18 service, runs `npm ci`, `npm run check`, `npm run db:migrate`, and `npm run test:db`. A separate browser job runs Playwright against its own disposable PostgreSQL service using only synthetic data. To exercise the migration CLI separately, supply `DATABASE_URL` for an empty application database and run `npm run db:migrate`. No provider SDK or Docker-in-Docker is required. Test configuration follows Next.js conventions and does not load `.env.local`; `.env.test.local` and shell variables keep the test target explicit.

## Data safety

This is a public repository. Repository content must use generic investment names and synthetic values. Real personal financial data, portfolio values, account identifiers, private institution or account details, and material copied or derived from a private investment spreadsheet must never be committed.

## Authentication

Equinox uses one shared app password for the personal MVP. There are no user accounts, signup, or per-household permissions. All application and API routes require a signed session except the sign-in route and public static assets. Sessions use an HttpOnly, SameSite=Lax cookie, Secure in production, and expire after seven days. Sign out revokes the current server-side session and clears its browser cookie.

Choose a strong password and create its scrypt hash locally with `node scripts/auth-secrets.mjs hash`. The prompt does not echo the password. Create an independent 256-bit signing secret with `node scripts/auth-secrets.mjs secret`. Next.js expands dollar-sign references when loading `.env.local`, so escape each dollar sign in the generated hash as `\$` in that file; Next.js removes the escape and passes the original hash to the app. Enter the unescaped hash in Vercel. Put the values in ignored `.env.local` for local use:

```dotenv
APP_PASSWORD_HASH=scrypt\$16384\$8\$1\$<salt>\$<digest>
SESSION_SECRET=<locally-generated-hex-secret>
```

The app requires `DATABASE_URL` for PostgreSQL-backed failed-attempt throttling, successful login, and server-side session validation on protected page and API requests. Public sign-in/static assets and production builds remain available without an authenticated database session; protected requests fail closed if the database is unavailable. Apply migrations first with `npm run db:migrate`. Five failed attempts from an IP address within 15 minutes trigger a temporary rejection. For production, set the hash, session secret, and database URL only in Vercel environment configuration. Never place the raw password, hash, or signing secret in GitHub, logs, or any `NEXT_PUBLIC_` variable. Configure these secrets and validate the hosted login flow before entering real financial data.

## Continuous integration

GitHub Actions runs `npm ci`, lint, type checking, unit tests, a clean database migration, PostgreSQL integration tests, production build, and whitespace validation on pull requests and pushes to `main`. The workflow uses a disposable PostgreSQL service and synthetic test data; it needs no hosted database or deployment credentials.

## Local migration tooling

EPIC 5 now includes a configurable local XLSX adapter, read-only preflight, atomic canonical import service and analytics-based reconciliation, with synthetic fixtures and PostgreSQL rollback checks. See [migration and portability](docs/migration-and-portability.md) for mapping formats, target safety and private artifact handling. The composed private migration CLI and final EPIC regression/runbook remain separate #68/#70 work.
