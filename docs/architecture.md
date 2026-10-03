# Architecture

## Platform

Equinox is a responsive, online-only progressive web app using Next.js App Router, React and TypeScript, Apache ECharts, and standard PostgreSQL through Drizzle ORM and `pg`. Vercel hosts the application and Neon hosts PostgreSQL; [hosted deployment](hosted-deployment.md) owns release operations. Docker is a local development convenience, not a runtime dependency.

Node.js and npm versions are declared in `.nvmrc` and `package.json`; `package-lock.json` records reproducible dependencies. Next.js lint tooling currently keeps ESLint on 9 and TypeScript on 6.0. Consult the installed, version-matched Next.js documentation when changing framework behavior.

## Personal-app scope

Keep implementation proportionate to one household's ordinary use. Protect credible financial-data integrity and privacy risks with exact money, atomic related writes, preserved history and clear failures. Do not add speculative infrastructure for multi-user scale or unsupported adversarial workflows. Product scope and exclusions are owned by [the product specification](product-spec.md).

## Responsibility boundaries

| Responsibility | Location |
| --- | --- |
| App Router routes, server composition and HTTP adapters | `src/app` |
| Shared presentation, forms and charts | `src/components` |
| Application commands, queries and repository ports | `src/application` |
| Framework-independent financial rules and analytics | `src/domain` |
| PostgreSQL schema, transactions and repository adapters | `src/persistence` |
| Local XLSX parsing and mapping | `src/migration` |

Dependency direction is presentation → application → domain. Persistence implements application-owned ports. Domain code does not depend on React, Next.js or PostgreSQL; application services do not import database adapters. ESLint guards these boundaries. The `@/` alias resolves to `src`.

Server-only composition roots resolve the configured household and construct services. Client-supplied household IDs never select a different household. Routes translate stable application failures into presentation-safe responses; forms and charts consume authoritative outputs rather than reproducing financial formulas.

Portfolio workflows own investment metadata, lifecycle, actions and valuation commands. Settings reuses canonical choices and retains stable identities. [The data model](data-model.md) owns their invariants; [the design system](design-system.md) owns forms, confirmations and navigation.

### Development dependency audit disposition

A scoped override pins `@esbuild-kit/core-utils`' esbuild to 0.25.12 to address its development-server advisory without downgrading Drizzle Kit. Remove the override when stable Drizzle Kit removes or updates that dependency, after checking TypeScript transforms and migration generation.

As of 2026-10-03, the Next.js lint chain's braces advisory has no patched release. Retain compatible tooling with the finding visible: Equinox does not configure the plugin's `rootDir` glob setting or supply application data to it. Deeply nested patterns could still fail a developer/CI process if introduced into lint configuration. The repository maintainer owns rechecking before release and when upstream versions or glob usage change. [PR #87](https://github.com/Roklion/Project_Equinox/pull/87) records the audit evidence for [issue #85](https://github.com/Roklion/Project_Equinox/issues/85).

## Environment configuration

Use Next.js environment loading, including `@next/env` for schema migration/export commands and database tests. The private data-migration CLI is separate: it reads only the shell's `MIGRATION_DATABASE_URL`, never environment files or application/test database fallbacks. Application configuration belongs in ignored `.env.local`; tests use `.env.test.local` or shell variables and never load `.env.local`. Shell variables take precedence. [Local setup](../README.md#local-setup) owns installation and secret-generation commands.

`DATABASE_URL` is required for database operations and authenticated requests, but not production builds or public sign-in/static routes. Validate it as a PostgreSQL URL with a host and explicit database without including its value in errors. `POSTGRES_PASSWORD` configures local Compose; `TEST_DATABASE_URL` is a separate maintenance connection and never falls back to `DATABASE_URL`.

For phone testing on the same Wi-Fi, set `EQUINOX_DEV_HOSTNAME` to the LAN hostname or IPv4 address, without scheme, port or path. It adds an allowed development origin. Restart and run `npm run dev -- --hostname <your-LAN-address>`; use that same origin on the phone. Installed-PWA validation requires HTTPS.

Never import secrets into client/domain code or put secrets in `NEXT_PUBLIC_` variables. Keep local environment files and their contents out of logs and version control.

## PostgreSQL and migrations

`src/persistence/database.ts` owns the server-only Drizzle database and a reusable connection pool. Connections are lazy; the owner closes the pool on shutdown. TLS options pass through to `pg` without disabling certificate verification. `neon.ts` configures branch policy only and is not imported by application or migration code.

`src/persistence/schema.ts` defines financial and separate authentication tables. `src/persistence/migrate.ts` applies committed SQL with Drizzle's journal and transactions, shared by the CLI and integration tests. Migrations are explicit deployment steps, never rendering/build side effects. Applied migrations are immutable; use forward migrations and never schema push in production. [The schema workflow](../README.md#changing-the-schema) owns generation/application commands.

`db:verify` checks connectivity with a synthetic read/write in a transaction-local temporary table; it is not financial workflow validation. The schema migration CLI may report driver error messages/codes, so keep operational output private. Idle-pool logs use a fixed message.

Docker Compose provides PostgreSQL bound to loopback port 5433 with a managed volume. [Local PostgreSQL](../README.md#local-postgresql) owns setup and reset instructions. [Backup and restore](backup-and-restore.md) owns dumps, retention and disposable recovery tests.

## Data integrity

[The data model](data-model.md) owns economic invariants; [metrics](metrics.md) owns valuation alignment, reporting boundaries and calculations.

Persist USD money as `numeric(18, 2)`, retaining exact decimal strings or integer cents at adapter boundaries and rejecting fractional-cent inputs instead of rounding. Financial dates are PostgreSQL `date` values, represented as calendar strings. Operational metadata may use UTC `timestamptz` and never determines financial effective dates.

Household-scoped composite foreign keys reject cross-household associations. Deferred constraints verify required owners and complete action legs at commit. Canonical action/movement writes, investment associations and batch marks commit atomically. Valuation uniqueness is enforced per investment/date. Application validation owns supported lifecycle and correction rules; database constraints backstop structural integrity. No aggregate tables, persisted staleness or audit/change-history subsystem is introduced.

## PWA and responsive delivery

The app provides manifest/icons and home-screen metadata without a service worker, offline record storage or background mutation sync. Do not deliberately cache financial API responses or authenticated financial pages for offline use. Offline support requires a separate product/security decision covering storage, encryption, sessions, staleness and device loss.

Desktop and phone share presentation primitives with composition and interactions owned by [the design system](design-system.md). [PWA validation](pwa-validation.md) owns physical-device installation checks.

## Security and privacy

[Repository safety](../AGENTS.md#repository-safety) prohibits private financial data and workbook-derived content in repository artifacts. Logs and errors must avoid financial records, identifiers and secrets. [Hosted deployment](hosted-deployment.md) owns authentication verification before real data entry; [backup and restore](backup-and-restore.md) owns recovery validation.

## Authentication boundary

The personal MVP uses one shared password verified server-side with scrypt against `APP_PASSWORD_HASH`. A signed seven-day HttpOnly, SameSite=Lax cookie (Secure in production) and matching PostgreSQL session record grant access to one household. PostgreSQL stores hashed session tokens and HMAC-keyed failed-login buckets; five failed attempts in 15 minutes cause temporary throttling. Passwords and signing keys never reach the browser.

The route proxy denies unauthenticated application/API requests; login, logout and public static assets remain reachable for authentication. Protected requests fail closed if authentication configuration or PostgreSQL is unavailable. Logout revokes the current session and clears its cookie on success; a revocation failure returns 503 and preserves the cookie for retry. Other sessions remain independent. [Authentication setup](../README.md#authentication) owns secret generation.

## Analytics read boundary

`AnalyticsRepository` in `src/application/analytics-ports.ts` is separate from portfolio mutation ports. Snapshot reads provide household-scoped investments, current associations and marks through the requested date. Cash-flow reads also provide complete actions and both transfer legs before reporting-scope selection. The PostgreSQL adapter reads related records in one read-only repeatable-read transaction; separate association reads avoid join fan-out.

Application analytics validates dates and invokes deterministic domain snapshot, cash-flow, return and historical-series engines. These own scope selection, exact-cent calculations and result states defined by [metrics](metrics.md). The XIRR library adapter stays in TypeScript/Node; no separate service is needed for it.

Historical-series queries read snapshot sources once and supply value and additive composition outputs together. Routes/charts format these outputs without recalculating money. HTTP adapters encode bigint cents as exact strings. Derived results are recomputed from canonical records; no persisted aggregate or offline financial cache becomes a source of truth.

## Overview and maintenance integration

Overview, investment detail and Update Center are dynamic server-rendered routes. Browser calendar resolution supplies an explicit reporting date without server-timezone assumptions. Overview passes the same reporting scope into all headline, period, return and historical queries. URL state retains date, period and scope. Update Center derives reminders from snapshot metadata using the [presentation policy](design-system.md#household-overview-and-valuation-maintenance) and reuses existing single/batch valuation workflows.

`ValueTrendChart` and `CompositionChart` consume the shared historical-series bundle. Client state controls measure, grouping, range and selected observation; it does not issue new financial calculations. ECharts loads line/grid/SVG functionality, observes size changes and disposes instances when inputs change or components unmount. [The chart contract](design-system.md#historical-chart-rendering-contract) owns rendering and interaction.

## Personal household bootstrap

`HouseholdSetupRepository` separates setup-state resolution and initialization from routes. Its adapter reads at most two household identities to distinguish empty, configured and inconsistent states. Initialization briefly locks the household table, rechecks state and creates household/owners atomically; overlapping retries return the committed household unchanged. There is no schema-wide single-household constraint.

Authenticated pages and financial composition roots resolve this state through the same service. The setup API is session protected, same-origin JSON and uncached. [First-run setup](product-spec.md#first-run-household-setup) owns behavior; [the design system](design-system.md#first-run-setup) owns its interface.

## Local migration boundary

ExcelJS is a development-only dependency used by `src/migration`; ordinary application/domain/runtime code cannot import the XLSX adapter. Application-owned migration and analytics ports keep import/reconciliation independent of workbook layout. Imports reuse canonical persistence functions, with an explicit investment ID where required, without another ledger/schema/browser workflow.

[Migration and portability](migration-and-portability.md) owns normalized records, mappings, export, target safety and reconciliation. `scripts/migrate-private.ts` composes the local workflow through `src/migration/cli.ts`. Target selection uses only `MIGRATION_DATABASE_URL`; JSON parsing and private report-file handling remain local tooling concerns. Financial validation and writes stay in the existing services. The [operator runbook](migration-and-portability.md#real-migration-operating-sequence) owns rehearsal, backup, explicit apply and uncertain-outcome recovery.

## Validation strategy

Use focused units for deterministic rules, PostgreSQL integration tests for constraints/transactions, and responsive browser journeys for supported workflows. Protect transfer boundaries, missing valuation coverage, negative NAV, combined-flow returns, calendar dates, closed history and credible failure paths. Coverage targets do not replace meaningful scenarios.

[Product regression validation](product-validation.md) owns coverage mapping and commands; [PWA validation](pwa-validation.md) owns physical-device checks.
