import { sql } from "drizzle-orm";
import { char, check, date, foreignKey, index, integer, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const id = (name: string) => uuid(name).defaultRandom().notNull();
const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull();

export const households = pgTable("households", {
  id: id("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").default("USD").notNull(),
}, (t) => [check("households_usd_only", sql`${t.currency} = 'USD'`)]);

export const owners = pgTable("owners", {
  id: id("id").primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
}, (t) => [unique("owners_household_id_id").on(t.householdId, t.id)]);

export const assetClasses = pgTable("asset_classes", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull().references(() => households.id), label: text("label").notNull(),
}, (t) => [unique("asset_classes_household_id_id").on(t.householdId, t.id)]);
export const accountTypes = pgTable("account_types", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull().references(() => households.id), label: text("label").notNull(),
}, (t) => [unique("account_types_household_id_id").on(t.householdId, t.id)]);
export const taxStatuses = pgTable("tax_statuses", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull().references(() => households.id), label: text("label").notNull(),
}, (t) => [unique("tax_statuses_household_id_id").on(t.householdId, t.id)]);
export const liquidities = pgTable("liquidities", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull().references(() => households.id), label: text("label").notNull(),
}, (t) => [unique("liquidities_household_id_id").on(t.householdId, t.id)]);
export const institutions = pgTable("institutions", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull().references(() => households.id), label: text("label").notNull(),
}, (t) => [unique("institutions_household_id_id").on(t.householdId, t.id)]);
export const customGroups = pgTable("custom_groups", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull().references(() => households.id), label: text("label").notNull(),
}, (t) => [unique("custom_groups_household_id_id").on(t.householdId, t.id)]);

export const investments = pgTable("investments", {
  id: id("id").primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(),
  closedOn: date("closed_on", { mode: "string" }),
  assetClassId: uuid("asset_class_id"), accountTypeId: uuid("account_type_id"),
  taxStatusId: uuid("tax_status_id"), liquidityId: uuid("liquidity_id"), institutionId: uuid("institution_id"),
}, (t) => [
  unique("investments_household_id_id").on(t.householdId, t.id),
  check("investments_status", sql`${t.status} in ('active', 'closed')`),
  check("investments_closed_on", sql`(${t.status} = 'active' and ${t.closedOn} is null) or (${t.status} = 'closed' and ${t.closedOn} is not null)`),
  foreignKey({ columns: [t.householdId, t.assetClassId], foreignColumns: [assetClasses.householdId, assetClasses.id] }),
  foreignKey({ columns: [t.householdId, t.accountTypeId], foreignColumns: [accountTypes.householdId, accountTypes.id] }),
  foreignKey({ columns: [t.householdId, t.taxStatusId], foreignColumns: [taxStatuses.householdId, taxStatuses.id] }),
  foreignKey({ columns: [t.householdId, t.liquidityId], foreignColumns: [liquidities.householdId, liquidities.id] }),
  foreignKey({ columns: [t.householdId, t.institutionId], foreignColumns: [institutions.householdId, institutions.id] }),
]);

export const investmentOwners = pgTable("investment_owners", {
  householdId: uuid("household_id").notNull().references(() => households.id),
  investmentId: uuid("investment_id").notNull(), ownerId: uuid("owner_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.investmentId, t.ownerId] }),
  foreignKey({ columns: [t.householdId, t.investmentId], foreignColumns: [investments.householdId, investments.id] }),
  foreignKey({ columns: [t.householdId, t.ownerId], foreignColumns: [owners.householdId, owners.id] }),
]);

export const investmentGroups = pgTable("investment_groups", {
  householdId: uuid("household_id").notNull().references(() => households.id),
  investmentId: uuid("investment_id").notNull(), groupId: uuid("group_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.investmentId, t.groupId] }),
  foreignKey({ columns: [t.householdId, t.investmentId], foreignColumns: [investments.householdId, investments.id] }),
  foreignKey({ columns: [t.householdId, t.groupId], foreignColumns: [customGroups.householdId, customGroups.id] }),
]);

export const actions = pgTable("actions", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull().references(() => households.id),
  kind: text("kind").notNull(), effectiveDate: date("effective_date", { mode: "string" }).notNull(),
  amount: money("amount"), source: text("source"), sourceReference: text("source_reference"), notes: text("notes"),
}, (t) => [
  unique("actions_household_id_id").on(t.householdId, t.id),
  check("actions_kind", sql`${t.kind} in ('contribution', 'withdrawal', 'transfer')`),
  check("actions_amount_positive", sql`${t.amount} > 0`),
  check("actions_source", sql`${t.source} is null or ${t.source} in ('manual', 'import', 'system')`),
]);

export const movements = pgTable("movements", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull(),
  actionId: uuid("action_id").notNull(), investmentId: uuid("investment_id").notNull(),
  role: text("role").notNull(), direction: text("direction").notNull(), amount: money("amount"),
}, (t) => [
  unique("movements_action_role").on(t.actionId, t.role),
  index("movements_household_investment_idx").on(t.householdId, t.investmentId),
  foreignKey({ columns: [t.householdId, t.actionId], foreignColumns: [actions.householdId, actions.id] }),
  foreignKey({ columns: [t.householdId, t.investmentId], foreignColumns: [investments.householdId, investments.id] }),
  check("movements_role", sql`${t.role} in ('external', 'source', 'destination')`),
  check("movements_direction", sql`${t.direction} in ('in', 'out')`),
  check("movements_amount_positive", sql`${t.amount} > 0`),
]);

export const valuationMarks = pgTable("valuation_marks", {
  id: id("id").primaryKey(), householdId: uuid("household_id").notNull(), investmentId: uuid("investment_id").notNull(),
  asOfDate: date("as_of_date", { mode: "string" }).notNull(),
  grossValue: money("gross_value"), debt: money("debt").default("0.00"),
  source: text("source"), sourceReference: text("source_reference"), notes: text("notes"),
}, (t) => [
  unique("valuation_marks_investment_date").on(t.investmentId, t.asOfDate),
  foreignKey({ columns: [t.householdId, t.investmentId], foreignColumns: [investments.householdId, investments.id] }),
  check("valuation_marks_nonnegative_values", sql`${t.grossValue} >= 0 and ${t.debt} >= 0`),
  check("valuation_marks_source", sql`${t.source} is null or ${t.source} in ('manual', 'import', 'system')`),
]);
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
