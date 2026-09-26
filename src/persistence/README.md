# Persistence adapters

`database.ts` creates a server-only Drizzle database and standard PostgreSQL pool. Application workflows should reuse a connection instance rather than open a pool for every operation. Call `pool.end()` when its owner shuts down; the migration CLI and tests already do this.

`schema.ts` is intentionally empty until the domain-schema ticket. `migrate.ts` applies committed SQL from `drizzle/` through Drizzle's migrator. It is shared by the CLI and integration tests.

See [architecture](../../docs/architecture.md#postgresql-and-migrations) for persistence decisions and [the README](../../README.md#local-postgresql) for operational commands.
