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

Dependency direction is presentation → application → domain. Persistence is an adapter used by application workflows. Domain code must not depend on Next.js, React, or persistence. ESLint guards imports from the initial higher-level folders; it is a lightweight guardrail, not a substitute for keeping future dependencies within these boundaries. Application and persistence currently contain only placement guidance; introduce concrete implementations as their tickets require them.

Use the `@/` alias for imports rooted at `src`. Domain tests live beside their implementation and run in Vitest's Node environment, without browser or database dependencies. Node.js 24 and npm 11 are the scaffold toolchain; the npm lockfile records reproducible dependency versions. Deployment topology remains open.

The scaffold uses Next.js 16.3.6 and React 19.3. ESLint stays on 9 and TypeScript on 6.0 because the current Next.js lint plugins do not support ESLint 10 or TypeScript 7. Revisit these compatible tooling versions when the upstream plugins support newer majors.

## Environment configuration

Use Next.js's built-in environment loading. Local configuration belongs in ignored `.env.local`; `.env.example` must contain only explanatory comments and empty keys. The scaffold requires no application-specific variables, so the example currently contains comments only. Do not invent credentials or provider configuration before a feature needs them.

Future server configuration should be read at the server boundary that needs it, with validation proportionate to that feature's requirements. Never import secrets into domain or client components. Only intentionally public values may use `NEXT_PUBLIC_`, because Next.js embeds those values in browser bundles at build time. Keep local environment files and their contents out of logs and version control.

## Data integrity

- Persist monetary values using exact decimal representations, with precision and currency policy decided before schema creation.
- Give investments and actions stable identifiers.
- Represent a transfer as one logical operation whose paired movements are written atomically.
- Enforce required as-of dates for valuation marks.
- Preserve closed-investment history.
- Keep derived metrics reproducible from canonical actions and marks rather than storing hand-edited aggregate results.
- Preserve enough audit information to explain corrections to financial history; the precise edit model is still open.

PostgreSQL transactions should protect related writes such as transfer legs. Database constraints should enforce structural invariants where practical, while domain services own rules that depend on reporting boundaries or historical context.

## PWA and responsive delivery

The application should provide installable metadata and a responsive shell. Offline behavior is not yet specified. Financial data must not be cached for offline use until storage, encryption, session, staleness, and device-loss behavior are explicitly designed.

Desktop and mobile should share domain and presentation primitives while composing them for pointer, keyboard, and touch interaction as described in [the design system](design-system.md).

## Security and privacy

This public repository must contain only generic names and synthetic financial values. Real personal data and private-spreadsheet content or derivatives must remain outside version control.

Before production use, architecture must define authentication, authorization, tenancy or single-household assumptions, encryption, secret management, audit retention, backups, deletion, and sensitive telemetry rules. Logs and error reports must avoid financial records and identifiers by default.

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
- single-currency versus multi-currency scope and foreign-exchange policy;
- monetary precision and rounding;
- date, timezone, and valuation-alignment policy;
- action correction, deletion, and audit-history semantics;
- duplicate valuation-mark handling;
- offline and client-cache boundaries;
- PostgreSQL hosting, backup, and recovery; and
- whether and when imports justify a separate Python service.
