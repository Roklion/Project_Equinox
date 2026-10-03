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

Scoped Overview composes the existing returns, period, snapshot and historical-series queries through application-owned queryOverview, passing one SnapshotScope to every output. Presentation translates supported URL identities into that contract without matching investments or calculating money. The existing single-household composition root also supplies canonical owner/classification choices and investments; no aggregate persistence, saved-portfolio ledger or new database adapter is added.

Runtime administration uses the application-owned `SettingsRepository` and `createSettingsService` for household rename, owner maintenance and classification/custom-group maintenance. The server-only `settings-data` composition root resolves the configured household; React and API handlers never import PostgreSQL adapters. The settings adapter reuses the canonical investment-choice query, updates names in place, checks household-scoped references before removal, and translates constraint conflicts to stable application errors. It does not rewrite financial records or remove membership links. Label validation and canonical duplicate/removal rules are defined in [the data model](data-model.md#runtime-administration).

Investment management extends the existing portfolio service and repository port with full metadata replacement, current metadata, and household-scoped owner/classification choices. Creation writes the investment and owner/custom-group links atomically; editing updates metadata and replaces associations in one transaction without touching financial rows. Lifecycle and association conflicts use stable `WorkflowError` codes (with a field key when applicable), and the investment API translates them into field-level feedback without exposing database errors. Routes reuse the server-side single-household composition root; client-supplied household IDs cannot select a household. See [management interaction rules](design-system.md#input-workflows).

The eventual implementation should keep these responsibilities distinct:

- **Presentation:** responsive pages, accessible components, forms, and chart interactions.
- **Application workflows:** commands and queries for recording actions, batch marks, investment lifecycle, and views; separate read-oriented analytics queries.
- **Domain:** financial invariants, transfer boundaries, metric inputs, and lifecycle rules defined in [the data model](data-model.md) and [metrics](metrics.md).
- **Persistence:** PostgreSQL schemas, transactions, migrations, and repositories.
- **Analytics:** deterministic calculations that operate on dated values and cash flows without depending on UI components.
- **Import and reconciliation:** explicit adapters that validate external data and preserve provenance without making a private spreadsheet a runtime source of truth.

EPIC 5's source-neutral contracts and semantic validation live in `src/domain/migration`; the versioned portable bundle and unknown-JSON validator live in `src/domain/portability`. The export query in `src/application/export.ts` owns its repository port; `src/persistence/export.ts` implements a household-scoped, consistent canonical read. `scripts/export-data.ts` composes the local command without adding browser/runtime behavior. [Migration and portability](migration-and-portability.md) owns records, mapping behavior, expectation states, export v1 and private handling. Canonical financial rules and analytics remain authoritative; the local spreadsheet adapter, application-owned atomic importer, and analytics-based reconciliation remain separate responsibilities.

The initial scaffold uses these homes:

| Responsibility | Location |
| --- | --- |
| App Router routes, layouts, and global design tokens | `src/app` |
| Shared presentation components | `src/components` |
| Application commands and queries | `src/application` |
| Framework-independent types and financial rules | `src/domain` |
| Database access, transactions, and migrations | `src/persistence` |

Dependency direction is presentation → application → domain. Persistence implements application-owned repository ports; the application service does not import the PostgreSQL adapter. Domain code does not depend on Next.js, React, or persistence. ESLint guards imports from higher-level folders. The application service exposes canonical action create/edit/delete commands, explicit valuation creation/replacement/date correction/deletion and atomic batch save, plus investment eligibility, an all-investments query for closed history, history, latest marks, and previous/same-date valuation context. Responsive presentation workflows remain separate.

Use the `@/` alias for imports rooted at `src`. Domain tests live beside their implementation and run in Vitest's Node environment, without browser or database dependencies. Node.js 24 and npm 11 are the scaffold toolchain; the npm lockfile records reproducible dependency versions. The hosted topology uses Vercel for Next.js and Neon Free for PostgreSQL; [hosted deployment](hosted-deployment.md) owns operational instructions.

The scaffold uses Next.js 16.3.6 and React 19.3. ESLint stays on 9 and TypeScript on 6.0 because the current Next.js lint plugins do not support ESLint 10 or TypeScript 7. Revisit these compatible tooling versions when the upstream plugins support newer majors.

## Environment configuration

Use Next.js's built-in environment loading, including `@next/env` for the migration CLI and database test configuration. Local application configuration belongs in ignored `.env.local`; database tests use `.env.test.local` or shell variables. Shell variables take precedence. `.env.example` contains only explanatory comments and empty keys.

For phone testing on the same Wi-Fi, set `EQUINOX_DEV_HOSTNAME` in `.env.local` to the computer's LAN hostname or IPv4 address, without a scheme, port, or path. `next.config.ts` uses it as an additional development origin; leaving it empty retains Next.js's default allowed hosts. Restart the server after changing it. Start with `npm run dev -- --hostname <your-LAN-address>` and open `http://<your-LAN-address>:3000` on the phone so the sign-in request uses the same origin as the server. Use an HTTPS deployment for Home Screen/PWA validation.

`DATABASE_URL` is required for database operations and authenticated rendering: the route proxy checks server-side session status on protected requests, while login uses PostgreSQL-backed throttling and session persistence. It is not required to build the app or serve public routes such as sign-in and static assets. The persistence boundary validates that it is a PostgreSQL URL with a host and explicit database, without including its value in errors. `POSTGRES_PASSWORD` configures the local Docker service. `TEST_DATABASE_URL` is a separate maintenance connection for tests and never falls back to `DATABASE_URL`.

Never import secrets into domain or client components. The database adapter is marked `server-only`; the migration CLI uses Node's `react-server` condition to load that marker outside Next.js. Database tests stub only this framework marker and use real PostgreSQL for all database operations. Only intentionally public values may use `NEXT_PUBLIC_`, because Next.js embeds those values in browser bundles at build time. Keep local environment files and their contents out of logs and version control.

## PostgreSQL and migrations

Use Drizzle ORM with the standard `pg` (node-postgres) driver. `src/persistence/database.ts` creates a small connection pool and a typed Drizzle database; the caller owns pool reuse and shutdown. Connections are lazy, so importing the adapter does not contact a database. The migration CLI reports the underlying error message and code when available; invalid connection URL errors omit the supplied value. The idle-pool handler logs a generic message rather than the driver error. The adapter passes the connection URL's TLS options to `pg` without overriding certificate verification. Hosted-provider SDKs are not required.

`src/persistence/schema.ts` defines the financial domain tables and operational authentication tables; authentication state remains separate from the domain model. Drizzle Kit generates versioned SQL and snapshots in `drizzle/`. Commit the SQL, snapshots, and journal together. The custom baseline migration runs `SELECT 1` and establishes Drizzle's journal without inventing an application table. Authentication migrations create failed-login and session storage first; `0003_investment_model` introduces canonical economic records and deferred PostgreSQL checks for required owners and complete action legs, and `0004_movement_history_index` adds the history-query index.

`npm run db:migrate` and integration tests share `src/persistence/migrate.ts`, which delegates migration tracking and transactions to Drizzle. Run migrations as an explicit deployment step; do not run them on page requests or use schema push in production/shared environments. Already-applied migrations are immutable: make corrections in a new migration. No schema-push script is provided.

`npm run db:verify` reuses the same server-only database adapter and performs a synthetic insert and select in a session-local temporary table that PostgreSQL drops at commit. It is an operational connectivity check, not an application investment workflow or a demo seed, and does not exercise the financial domain tables. Neon configuration in `neon.ts` is limited to branch policy; application SQL, migration files, and the driver use standard PostgreSQL interfaces.

Docker Compose provides standard PostgreSQL 18.4, bound to loopback port 5433 with a Docker-managed named volume. No database files belong in the repository. An existing standard PostgreSQL service can use the same adapter and migration commands through `DATABASE_URL`. See [database setup](../README.md#local-postgresql) for startup and destructive local rebuild commands.

Database integration tests require a separate `TEST_DATABASE_URL` with permission to create databases. Each run creates a uniquely named empty database, runs the committed migrations, verifies that repeat application leaves the journal unchanged, and removes only that generated database. A CI PostgreSQL service can run the same path without Docker Compose or a hosted-provider dependency. If a test process is forcibly terminated, its `equinox_test_*` database may remain for manual cleanup; no automatic sweep of databases is performed.

## Data integrity

- MVP financial currency is USD only. Persist monetary values as `numeric(18, 2)` and retain exact strings or integer cents at the driver boundary. The recording adapter rejects more than two fractional digits rather than rounding them.
- Financial/economic dates are calendar dates with daily granularity (`date`), represented as date-only values rather than instants. Operational metadata may use UTC `timestamptz`; it must never determine a financial effective date.
- Give investments and actions stable identifiers.
- Represent a transfer as one logical operation whose paired movements are written atomically.
- Enforce required as-of dates for valuation marks.
- Preserve closed-investment history.
- Keep derived metrics reproducible from canonical actions and marks rather than storing hand-edited aggregate results.
- The MVP has no audit-log or change-history subsystem. Corrections update canonical records in place. A transfer's linked legs are edited or deleted as one transaction. A batch mark save validates all entered rows before mutation and commits them in one transaction. Explicit deletion confirmation belongs to presentation. Preserving closed-investment history remains required unless a user explicitly corrects or deletes a historical record.

Household IDs scope owner, investment, classification, action, movement, and valuation relationships; composite foreign keys reject cross-household links. Investments have one or more owners, with joint ownership represented by links rather than percentages. Classification IDs remain stable when labels change. Closing an investment requires a calendar date and preserves its rows; new ordinary activity is rejected after closure.

Actions represent contributions, withdrawals, and transfers. A contribution or withdrawal has one investment movement; a transfer has one source outflow and one distinct destination inflow of the same amount. A deferred constraint trigger verifies the complete shape at commit, while `src/persistence/records.ts` writes each logical action and its movements in one transaction. Valuation marks live in a separate table and have one row per investment and as-of date. Gross value and debt are nonnegative; net value is derived and may be negative. `src/application/portfolio.ts` validates exact money and calendar dates through domain functions before calling its repository port. See [the data model](data-model.md) for economic meanings and explicit mark correction.

PostgreSQL transactions should protect related writes such as transfer legs. Database constraints should enforce structural invariants where practical, while domain services own rules that depend on reporting boundaries or historical context.

## PWA and responsive delivery

The application provides installable metadata and a responsive shell. The EPIC 1 installed experience is online-only: it uses the App Router manifest and home-screen metadata without a service worker, offline record storage, or background mutation sync. Financial API responses, database-derived portfolio data, and authenticated financial pages must not be deliberately cached for offline use. Offline behavior requires a separate decision on storage, encryption, sessions, staleness, and device loss.

Desktop and mobile should share domain and presentation primitives while composing them for pointer, keyboard, and touch interaction as described in [the design system](design-system.md).

## Security and privacy

This public repository must contain only generic names and synthetic financial values. Real personal data and private-spreadsheet content or derivatives must remain outside version control.

Authentication for the single-household MVP is defined below. Before production use, encryption, secret management, backups, deletion, and sensitive telemetry rules still require validation. Audit retention is relevant only if an audit subsystem is introduced later. Logs and error reports must avoid financial records and identifiers by default.

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

## Decisions still required


- presentation rounding for money, ratios, and rates;
- presentation details for action correction and deletion confirmation;
- offline and client-cache boundaries;
- PostgreSQL backup and recovery; and
- whether and when imports justify a separate Python service.

Multi-currency support and foreign exchange are outside the USD-only MVP.

## Authentication boundary

The personal MVP uses one shared password, verified on the server with Node's scrypt KDF against `APP_PASSWORD_HASH`. A signed, seven-day HttpOnly cookie and a matching server-side session record grant access to the single household. The route proxy denies unauthenticated application and API requests, while login and logout endpoints remain reachable to handle authentication state. Auth code remains separate from investment/domain types. PostgreSQL stores a hash of each active session token and HMAC-keyed failed-login buckets for 15-minute throttling. It stores no password or financial data. Authentication fails closed if database or authentication configuration is unavailable, and server logs use fixed messages without driver details or secret values. The browser receives no password hash or signing key. Logout revokes the current token and clears its browser cookie on success; if revocation fails, it returns 503 and preserves the token so the browser can retry. Other browser sessions remain independent. See [local setup](../README.md#authentication) for secret generation and deployment configuration.

## Analytics read boundary

The single-household server composition root provides both portfolio workflows and read-only analytics. Investments browse consumes the snapshot query; detail consumes investment-scoped returns (including its authoritative snapshot/inception context) and period queries. Presentation selects rows by canonical metadata IDs and formats supplied results, without recalculating money or returns. Financial pages are dynamic and do not introduce offline caching. Reporting/filter state lives in the URL.

EPIC 3 analytics use the application-owned AnalyticsRepository in src/application/analytics-ports.ts, separate from PortfolioRepository mutation and entry workflows established in #25. The initial getSnapshotSources(householdId, throughDate) port supplies household-scoped investments (including closed lifecycle state), stable classification IDs/labels, owner associations, custom-group memberships, and canonical valuation marks through the requested date. The getCashFlowSources(householdId, throughDate) port adds canonical actions and their complete linked movements to those snapshot sources. Both transfer legs are read before reporting-scope selection, through the same read-only repeatable-read transaction as the investments and marks. Snapshot-only reads do not query actions.

src/persistence/analytics.ts implements the port with PostgreSQL reads. It does not aggregate money or select financial results. Association reads stay separate from valuation rows to avoid owner/group join fan-out; a read-only repeatable-read transaction gives these related reads one consistent canonical view. No aggregate tables, mutable calculated fields, or persisted staleness values are introduced.

src/application/analytics.ts validates the requested calendar date, obtains source records, and invokes the deterministic src/domain/analytics/snapshot.ts engine. That engine owns reporting-scope selection, latest-on-or-before mark alignment, exact-cent gross/debt/NAV calculations, coverage metadata, and additive grouping. Domain contracts own period membership and logical transfer classification. src/domain/analytics/cash-flow.ts owns dated boundary-relative flow classification, cumulative capital totals, period P&L, and NAV-change attribution. Application period and inception queries validate dates before reading and recompute from canonical records without caching derived results; missing valuation coverage affects P&L independently of complete cash-flow totals. src/domain/analytics/returns.ts reuses inception outputs to compute MOIC and build combined dated investor-perspective flows with signed terminal NAV. src/domain/analytics/xirr.ts owns the library-backed fixed-guess XIRR adapter and returned-rate validation. Application returns queries read canonical sources afresh; neither rates nor multiples are persisted. [Metrics](metrics.md) owns these financial semantics and result states.

React, routes, and chart consumers receive analytics outputs; they do not reproduce formulas or infer zero from missing marks. HTTP adapters encode bigint cents as exact strings when needed for JSON. Formatting belongs to presentation. src/domain/analytics/series.ts owns historical observation-date sampling and reuses the same snapshot and additive grouping engines. Application valueSeries and compositionSeries queries read snapshot sources through the range end, including older marks for carry-forward. They do not query actions; callers obtain range performance context from period and inception returns from returns. Current canonical classifications apply at historical dates because association history is not modeled.

TWR and approximations remain outside the current design and EPIC 3. XIRR belongs in the TypeScript/Node domain analytics layer using the xirr library with an Excel-style fixed-guess, single-root policy. The domain adapter owns exact same-date cash-flow netting and validates the returned rate; [metrics](metrics.md#inception-return-query-and-numerical-policy) owns the numerical policy and unavailable result semantics. No Python service is required solely for IRR.

The EPIC 3 regression suite shares a compact, synthetic ledger in src/domain/analytics/testing/canonical-fixture.ts. Domain regression tests assert independent expected money and returns alongside cross-metric identities; application regressions exercise query orchestration and correction-driven recalculation. The PostgreSQL integration suite writes that ledger to the canonical schema and exercises the real analytics repository, returns and historical queries. Existing transfer integration tests protect complete-leg reads, household isolation and corrections; the domain regression tests reconcile transfer scope effects across P&L, MOIC, XIRR and attribution. [Metrics](metrics.md#canonical-analytics-regression-ledger) records the hand-checkable expectations. Browser visualization tests remain EPIC 4 work.


## Overview and maintenance integration

The household Overview and Update Center are dynamic server-rendered routes. They reuse the application analytics service and shared financial presentation components; no household formulas, mutable staleness columns, or new mutation endpoints are introduced. A small browser calendar resolver requests the initial date explicitly, avoiding server-timezone assumptions. Overview reads full-household returns, selected-period analytics, grouped snapshots, and recorded value series; presentation consumes their supplied results. Closed investments remain in household analytics.

Update Center only sorts/classifies supplied constituent metadata using the presentation reminder policy in [the design system](design-system.md#household-overview-and-valuation-maintenance). Single and batch valuation entry reuse EPIC 2 forms, validation, and persistence, with date/investment launch context and a fixed return destination. Successful saves refresh client route context; dynamic unprefetched return navigation reads fresh marks and reminders. No financial offline cache is introduced.

The merged #49/#50 ValueTrendChart and CompositionChart components render household historicalSeries directly. The same explicit reporting cutoff drives the headline and both charts. The summary period controls attribution; chart range controls inspect recorded history independently. Existing investment-detail charts and date synchronization remain intact.

The combined historicalSeries application query supplies value and all additive composition series from one repository source read. It delegates to the existing historical snapshot/grouping functions; it does not introduce a separate financial calculation path. The server adapter in src/app/chart-data.tsx resolves the single household with the existing entry context, performs fresh queries, and feeds reusable client chart components on investment detail. Overview calls the same historicalSeries query through its shared analytics context and passes authoritative outputs directly. Other reporting scopes can reuse the same adapter or pass authoritative application-series outputs directly. Client state is limited to measure, grouping, range, and selected observation. ECharts core loads only line/grid/SVG functionality, uses a ResizeObserver, and disposes each instance when inputs change or the component unmounts. No chart route, persisted series, display-derived grouping state, or offline financial cache is introduced.

## Personal household bootstrap

The application-owned HouseholdSetupRepository separates setup-state resolution and the one-time initialize command from routes and React. Its PostgreSQL adapter reads at most two household identities to distinguish empty, configured, and inconsistent states. Initialize locks the household table only for the short first-run transaction, rechecks state, and creates the USD household and owners together. Overlapping retries observe the committed household and return it unchanged. This avoids a schema-wide single-household constraint and keeps canonical household-scoped relationships compatible with future tenancy.

Authenticated page routing checks this state before exposing financial workflows. The shared financial service composition resolves the household through the same application query; client-supplied identities never choose a household. The setup API is session protected, same-origin JSON only, uncached, and returns presentation-safe failures.

## Local migration boundary

Spreadsheet parsing lives in src/migration and uses ExcelJS as a development-only local tooling dependency. Domain/application/runtime surfaces cannot import the spreadsheet adapter. Application-owned MigrationRepository and AnalyticsRepository ports keep import transactions and reconciliation independent of workbook layouts. PostgreSQL migration execution extends the canonical record writer with an optional explicit investment ID and reuses its remaining mutation functions. No new ledger, schema, background sync, or browser workflow is introduced. See [migration and portability](migration-and-portability.md) for target safety, private artifacts, comparison policy and deferred CLI composition.
