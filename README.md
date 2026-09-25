# Project Equinox

Project Equinox is a personal investment and wealth tracker designed for desktop and iPhone. It gives a household a clear view of investment values, cash flows, performance, and composition without requiring security or tax-lot accounting.

The product is planned as a responsive progressive web app built with Next.js, React, TypeScript, Apache ECharts, and PostgreSQL. Python and FastAPI may be introduced later for specialized analytics or imports when that boundary is justified.

## Documentation

- [Product specification](docs/product-spec.md) defines users, scope, workflows, and product requirements.
- [Data model](docs/data-model.md) defines entities, canonical actions, and invariants.
- [Metrics](docs/metrics.md) defines financial measures and aggregation rules.
- [Design system](docs/design-system.md) defines interface and interaction direction.
- [Architecture](docs/architecture.md) defines technical boundaries and the initial platform direction.
- [Agent guidance](AGENTS.md) defines repository working practices.

## Status

Equinox is in product and architecture definition. Application scaffolding and implementation have not started.

## Data safety

This is a public repository. Repository content must use generic investment names and synthetic values. Real personal financial data, portfolio values, account identifiers, private institution or account details, and material copied or derived from a private investment spreadsheet must never be committed.
