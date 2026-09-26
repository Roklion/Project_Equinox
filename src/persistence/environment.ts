type DatabaseUrlKey = "DATABASE_URL" | "TEST_DATABASE_URL";

export function readDatabaseUrl(
  key: DatabaseUrlKey = "DATABASE_URL",
  environment: Record<string, string | undefined> = process.env,
): string {
  const value = environment[key];
  if (!value?.trim()) {
    throw new Error(`${key} is required for database operations.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid PostgreSQL connection URL.`);
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length <= 1
  ) {
    throw new Error(`${key} must be a PostgreSQL URL with a host and database name.`);
  }

  return value;
}
