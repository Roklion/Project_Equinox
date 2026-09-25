# Architecture

## Initial direction

Equinox will be a responsive progressive web app using:

- Next.js, React, and TypeScript for the application and user interface;
- Apache ECharts for interactive financial charts; and
- PostgreSQL as the durable system of record.

Python and FastAPI may be added later behind a focused service boundary for specialized analytics or import workloads. They are not required for the initial application and should not be introduced until a concrete capability benefits from them.

Streamlit is not the target architecture because polished consumer-facing responsive layouts, reusable interaction patterns, touch behavior, and rich chart interactions are core requirements.

## Responsibility boundaries

The eventual implementation should keep these responsibilities distinct:

- **Presentation:** responsive pages, accessible components, forms, and chart interactions.
- **Application workflows:** commands and queries for recording actions, batch marks, investment lifecycle, and views.
- **Domain:** financial invariants, transfer boundaries, metric inputs, and lifecycle rules defined in [the data model](data-model.md) and [metrics](metrics.md).
- **Persistence:** PostgreSQL schemas, transactions, migrations, and repositories.
- **Analytics:** deterministic calculations that operate on dated values and cash flows without depending on UI components.
- **Import and reconciliation:** explicit adapters that validate external data and preserve provenance without making a private spreadsheet a runtime source of truth.

Exact folder structure, framework conventions, and deployment topology should be chosen during scaffolding rather than fixed prematurely.

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
