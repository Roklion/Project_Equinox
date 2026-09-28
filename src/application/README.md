# Application workflows

`ports.ts` defines the canonical repository contract without framework or SQL types. `portfolio.ts` validates exact money and calendar dates and exposes create/edit/delete commands for external actions and transfers, explicit mark creation/replacement/deletion, atomic batch mark save, and query context for EPIC 2 forms. Correctable failures have stable codes in `errors.ts`. Construct the service with `createPortfolioService(createPostgresPortfolioRepository(db))` on the server. Forms and API routes belong to later tickets. Presentation must confirm explicit deletion before calling the command.

See [architecture](../../docs/architecture.md) for the dependency direction and [the data model](../../docs/data-model.md) for canonical semantics.
