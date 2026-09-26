# Project Equinox

Project Equinox is a personal investment and wealth tracker designed for desktop and iPhone. It gives a household a clear view of investment values, cash flows, performance, and composition without requiring security or tax-lot accounting.

The application foundation uses Next.js App Router, React, and TypeScript in one responsive web codebase. Apache ECharts, PostgreSQL, and progressive web app capabilities are planned for later work. Python and FastAPI may be introduced later for specialized analytics or imports when that boundary is justified.

## Documentation

- [Product specification](docs/product-spec.md) defines users, scope, workflows, and product requirements.
- [Data model](docs/data-model.md) defines entities, canonical actions, and invariants.
- [Metrics](docs/metrics.md) defines financial measures and aggregation rules.
- [Design system](docs/design-system.md) defines interface and interaction direction.
- [Architecture](docs/architecture.md) defines technical boundaries and the initial platform direction.
- [Agent guidance](AGENTS.md) defines repository working practices.

## Status

The initial application scaffold includes a responsive empty-state shell, responsibility boundaries, and a domain unit-test harness. Investment entry, storage, charts, authentication, and PWA installation/offline behavior are not implemented yet.

## Local setup

Install Node.js 24.x (see `.nvmrc`) and npm 11.x. From a clean checkout:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No database, credentials, or environment variables are required. Next.js loads `.env.local` automatically if future local configuration is needed. `.env.example` documents the convention and intentionally has no active keys yet. See [environment configuration](docs/architecture.md#environment-configuration) before adding configuration; never put secrets in `NEXT_PUBLIC_` values.

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
| `npm run check` | Run lint, type checks, tests, and production build in order |

Run `npm run check` and `git diff --check` before handing off changes. Tests use Vitest's Node environment; the first test exercises the documented active/closed investment entry policy. Add focused tests beside domain code as supported workflows grow.

See [architecture](docs/architecture.md#responsibility-boundaries) for the source layout and dependency direction, and [personal-app scope](docs/architecture.md#personal-app-scope) for implementation tradeoffs.

## Data safety

This is a public repository. Repository content must use generic investment names and synthetic values. Real personal financial data, portfolio values, account identifiers, private institution or account details, and material copied or derived from a private investment spreadsheet must never be committed.
