# Application workflows

`ports.ts` defines the canonical repository contract without framework or SQL types. `portfolio.ts` validates money and calendar dates and exposes the small EPIC 1 command/query surface. Construct it with `createPortfolioService(createPostgresPortfolioRepository(db))` on the server. Full user-facing workflows and API routes belong to later tickets.

See [architecture](../../docs/architecture.md) for the dependency direction and [the data model](../../docs/data-model.md) for canonical semantics.
