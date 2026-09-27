import { char, integer, pgTable, timestamp } from "drizzle-orm/pg-core";

// Operational authentication state is separate from the financial domain model.
export const authLoginAttempts = pgTable("auth_login_attempts", {
  bucket: char("bucket", { length: 64 }).primaryKey(),
  failures: integer("failures").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
});
export const authSessions = pgTable("auth_sessions", {
  tokenHash: char("token_hash", { length: 64 }).primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
