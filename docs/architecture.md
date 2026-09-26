# Architecture

## Initial direction

Equinox will be a responsive progressive web app using:

- Next.js, React, and TypeScript for the application and user interface;
- Apache ECharts for interactive financial charts; and
- PostgreSQL as the durable system of record.

Python and FastAPI may be added later behind a focused service boundary for specialized analytics or import workloads. They are not required for the initial application and should not be introduced until a concrete capability benefits from them.

Streamlit is not the target architecture because polished consumer-facing responsive layouts, reusable interaction patterns, touch behavior, and rich chart interactions are core requirements.

## Personal-app scope

Equinox is a personal app for ordinary household use. Design and implementation should remain proportionate to that context and to the current ticket. Introduce mechanisms when a concrete supported workflow requires them; do not anticipate multi-user scale with generic infrastructure, speculative concurrency coordination, or defenses against impractical manipulation and remote edge cases.

This scope still calls for meaningful financial-data integrity and privacy: exact monetary representations when persistence is added, atomic transfers, preserved history, and clear failures for ordinary invalid input or failed writes. Choose the smallest understandable solution that protects those credible risks. Broader security and deployment decisions remain prerequisites for production use, rather than scaffold features.

## Responsibility boundaries

The eventual implementation should keep these responsibilities distinct:

- **Presentation:** responsive pages, accessible components, forms, and chart interactions.
- **Application workflows:** commands and queries for recording actions, batch marks, investment lifecycle, and views.
- **Domain:** financial invariants, transfer boundaries, metric inputs, and lifecycle rules defined in [the data model](data-model.md) and [metrics](metrics.md).
- **Persistence:** PostgreSQL schemas, transactions, migrations, and repositories.
- **Analytics:** deterministic calculations that operate on dated values and cash flows without depending on UI components.
- **Import and reconciliation:** explicit adapters that validate external data and preserve provenance without making a private spreadsheet a runtime source of truth.

The initial scaffold uses these homes:

| Responsibility | Location |
| --- | --- |
| App Router routes, layouts, and global design tokens | `src/app` |
| Shared presentation components | `src/components` |
| Application commands and queries | `src/application` |
| Framework-independent types and financial rules | `src/domain` |
| Database access, transactions, and migrations | `src/persistence` |

Dependency direction is presentation → application → domain. Persistence is an adapter used by application workflows. Domain code must not depend on Next.js, React, or persistence. ESLint guards imports from the initial higher-level folders; it is a lightweight guardrail, not a substitute for keeping future dependencies within these boundaries. Application workflows remain future work; persistence now provides a PostgreSQL connection factory and migration runner without domain tables.

Use the `@/` alias for imports rooted at `src`. Domain tests live beside their implementation and run in Vitest's Node environment, without browser or database dependencies. Node.js 24 and npm 11 are the scaffold toolchain; the npm lockfile records reproducible dependency versions. Deployment topology remains open.

The scaffold uses Next.js 16.3.6 and React 19.3. ESLint stays on 9 and TypeScript on 6.0 because the current Next.js lint plugins do not support ESLint 10 or TypeScript 7. Revisit these compatible tooling versions when the upstream plugins support newer majors.

## Environment configuration

Use Next.js's built-in environment loading, including `@next/env` for the migration CLI and database test configuration. Local application configuration belongs in ignored `.env.local`; database tests use `.env.test.local` or shell variables. Shell variables take precedence. `.env.example` contains only explanatory comments and empty keys.

`DATABASE_URL` is required only for database operations, not for rendering or building the current empty shell. The persistence boundary validates that it is a PostgreSQL URL with a host and explicit database, without including its value in errors. `POSTGRES_PASSWORD` configures the local Docker service. `TEST_DATABASE_URL` is a separate maintenance connection for tests and never falls back to `DATABASE_URL`.

Never import secrets into domain or client components. The database adapter is marked `server-only`; the migration CLI uses Node's `react-server` condition to load that marker outside Next.js. Database tests stub only this framework marker and use real PostgreSQL for all database operations. Only intentionally public values may use `NEXT_PUBLIC_`, because Next.js embeds those values in browser bundles at build time. Keep local environment files and their contents out of logs and version control.

## PostgreSQL and migrations

Use Drizzle ORM with the standard `pg` (node-postgres) driver. `src/persistence/database.ts` creates a small connection pool and a typed Drizzle database; the caller owns pool reuse and shutdown. Connections are lazy, so importing the adapter does not contact a database. Driver errors are not printed by the migration CLI or idle-pool handler. The adapter passes the connection URL's TLS options to `pg` without overriding certificate verification. Hosted-provider SDKs are not required.

`src/persistence/schema.ts` is the future domain-schema owner. Drizzle Kit generates versioned SQL and snapshots in `drizzle/`. Commit the SQL, snapshots, and journal together. The initial custom baseline migration runs `SELECT 1` and establishes Drizzle's journal without inventing an application table. Subsequent schema tickets generate real DDL from the schema owner.

`npm run db:migrate` and integration tests share `src/persistence/migrate.ts`, which delegates migration tracking and transactions to Drizzle. Run migrations as an explicit deployment step; do not run them on page requests or use schema push in production/shared environments. Already-applied migrations are immutable: make corrections in a new migration. No schema-push script is provided.

Docker Compose provides standard PostgreSQL 18.4, bound to loopback port 5433 with a Docker-managed named volume. No database files belong in the repository. An existing standard PostgreSQL service can use the same adapter and migration commands through `DATABASE_URL`. See [database setup](../README.md#local-postgresql) for startup and destructive local rebuild commands.

Database integration tests require a separate `TEST_DATABASE_URL` with permission to create databases. Each run creates a uniquely named empty database, runs the committed migrations, verifies that repeat application leaves the journal unchanged, and removes only that generated database. A CI PostgreSQL service can run the same path without Docker Compose or a hosted-provider dependency. If a test process is forcibly terminated, its `equinox_test_*` database may remain for manual cleanup; no automatic sweep of databases is performed.

## Data integrity

- MVP financial currency is USD only. Persist monetary values with exact cent precision, using PostgreSQL exact numeric or integer-cent types rather than binary floating point. Choose column capacity with the domain schema; retain exact strings or integer cents at the driver boundary.
- Financial/economic dates are calendar dates with daily granularity (`date`), represented as date-only values rather than instants. Operational metadata may use UTC `timestamptz`; it must never determine a financial effective date.
- Give investments and actions stable identifiers.
- Represent a transfer as one logical operation whose paired movements are written atomically.
- Enforce required as-of dates for valuation marks.
- Preserve closed-investment history.
- Keep derived metrics reproducible from canonical actions and marks rather than storing hand-edited aggregate results.
- No audit-log or change-history subsystem is required in EPIC 1. Correction behavior is a later workflow decision; preserving closed-investment history remains required.

PostgreSQL transactions should protect related writes such as transfer legs. Database constraints should enforce structural invariants where practical, while domain services own rules that depend on reporting boundaries or historical context.

## PWA and responsive delivery

The application should provide installable metadata and a responsive shell. Offline behavior is not yet specified. Financial data must not be cached for offline use until storage, encryption, session, staleness, and device-loss behavior are explicitly designed.

Desktop and mobile should share domain and presentation primitives while composing them for pointer, keyboard, and touch interaction as described in [the design system](design-system.md).

## Security and privacy

This public repository must contain only generic names and synthetic financial values. Real personal data and private-spreadsheet content or derivatives must remain outside version control.

Before production use, architecture must define authentication, authorization, intended household access, encryption, secret management, backups, deletion, and sensitive telemetry rules. Audit retention is relevant only if an audit subsystem is introduced later. Logs and error reports must avoid financial records and identifiers by default.

## Validation strategy

Validation should concentrate on domain invariants and credible data-integrity risks:

- transfer pairing and household-level cancellation;
- marks excluded from cash flow;
- value, debt, and negative NAV calculations;
- portfolio metric recomputation, especially combined-flow XIRR;
- closed-investment history;
- as-of date handling; and
- input and persistence failure behavior.

Use focused unit tests for deterministic domain calculations, integration tests for database constraints and workflows, and a small set of responsive end-to-end tests for critical entry and review paths. Coverage targets should not substitute for meaningful scenarios.

## Decisions required before implementation

- authentication and intended deployment model;
- monetary column capacity, input handling beyond cent precision, and calculated/display rounding;
- valuation alignment across calendar dates;
- action correction and deletion semantics (an audit subsystem is outside EPIC 1);
- duplicate valuation-mark handling;
- offline and client-cache boundaries;
- PostgreSQL hosting, backup, and recovery; and
- whether and when imports justify a separate Python service.

Multi-currency support and foreign exchange are outside the USD-only MVP.
