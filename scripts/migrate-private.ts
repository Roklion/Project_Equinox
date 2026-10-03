import { runMigrationCli } from "../src/migration/cli";

// Deliberately do not load .env.local or fall back to DATABASE_URL/TEST_DATABASE_URL.
process.exitCode = await runMigrationCli(process.argv.slice(2));
