# Persistence adapters

`database.ts` creates a server-only Drizzle database and standard PostgreSQL pool. Application workflows should reuse a connection instance rather than open a pool for every operation. Call `pool.end()` when its owner shuts down; the migration CLI and tests already do this.

`schema.ts` owns household, investment, classification, action/movement, and valuation tables. `records.ts` provides focused transaction-safe recording functions until application commands are introduced. `migrate.ts` applies committed SQL from `drizzle/` through Drizzle's migrator. It is shared by the CLI and integration tests.

See [architecture](../../docs/architecture.md#postgresql-and-migrations) for persistence decisions and [the README](../../README.md#local-postgresql) for operational commands.
