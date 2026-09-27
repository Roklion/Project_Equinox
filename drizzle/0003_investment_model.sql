CREATE TABLE "account_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "account_types_household_id_id" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"effective_date" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"source" text,
	"source_reference" text,
	"notes" text,
	CONSTRAINT "actions_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "actions_kind" CHECK ("actions"."kind" in ('contribution', 'withdrawal', 'transfer')),
	CONSTRAINT "actions_amount_positive" CHECK ("actions"."amount" > 0),
	CONSTRAINT "actions_source" CHECK ("actions"."source" is null or "actions"."source" in ('manual', 'import', 'system'))
);
--> statement-breakpoint
CREATE TABLE "asset_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "asset_classes_household_id_id" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "custom_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "custom_groups_household_id_id" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "households_usd_only" CHECK ("households"."currency" = 'USD')
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "institutions_household_id_id" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "investment_groups" (
	"household_id" uuid NOT NULL,
	"investment_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "investment_groups_investment_id_group_id_pk" PRIMARY KEY("investment_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "investment_owners" (
	"household_id" uuid NOT NULL,
	"investment_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "investment_owners_investment_id_owner_id_pk" PRIMARY KEY("investment_id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"closed_on" date,
	"asset_class_id" uuid,
	"account_type_id" uuid,
	"tax_status_id" uuid,
	"liquidity_id" uuid,
	"institution_id" uuid,
	CONSTRAINT "investments_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "investments_status" CHECK ("investments"."status" in ('active', 'closed')),
	CONSTRAINT "investments_closed_on" CHECK (("investments"."status" = 'active' and "investments"."closed_on" is null) or ("investments"."status" = 'closed' and "investments"."closed_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "liquidities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "liquidities_household_id_id" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"investment_id" uuid NOT NULL,
	"role" text NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	CONSTRAINT "movements_action_role" UNIQUE("action_id","role"),
	CONSTRAINT "movements_role" CHECK ("movements"."role" in ('external', 'source', 'destination')),
	CONSTRAINT "movements_direction" CHECK ("movements"."direction" in ('in', 'out')),
	CONSTRAINT "movements_amount_positive" CHECK ("movements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "owners_household_id_id" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "tax_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "tax_statuses_household_id_id" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "valuation_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"investment_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"gross_value" numeric(18, 2) NOT NULL,
	"debt" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"source" text,
	"source_reference" text,
	"notes" text,
	CONSTRAINT "valuation_marks_investment_date" UNIQUE("investment_id","as_of_date"),
	CONSTRAINT "valuation_marks_nonnegative_values" CHECK ("valuation_marks"."gross_value" >= 0 and "valuation_marks"."debt" >= 0),
	CONSTRAINT "valuation_marks_source" CHECK ("valuation_marks"."source" is null or "valuation_marks"."source" in ('manual', 'import', 'system'))
);
--> statement-breakpoint
ALTER TABLE "account_types" ADD CONSTRAINT "account_types_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_classes" ADD CONSTRAINT "asset_classes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_groups" ADD CONSTRAINT "custom_groups_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_groups" ADD CONSTRAINT "investment_groups_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_groups" ADD CONSTRAINT "investment_groups_household_id_investment_id_investments_household_id_id_fk" FOREIGN KEY ("household_id","investment_id") REFERENCES "public"."investments"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_groups" ADD CONSTRAINT "investment_groups_household_id_group_id_custom_groups_household_id_id_fk" FOREIGN KEY ("household_id","group_id") REFERENCES "public"."custom_groups"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_owners" ADD CONSTRAINT "investment_owners_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_owners" ADD CONSTRAINT "investment_owners_household_id_investment_id_investments_household_id_id_fk" FOREIGN KEY ("household_id","investment_id") REFERENCES "public"."investments"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_owners" ADD CONSTRAINT "investment_owners_household_id_owner_id_owners_household_id_id_fk" FOREIGN KEY ("household_id","owner_id") REFERENCES "public"."owners"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_household_id_asset_class_id_asset_classes_household_id_id_fk" FOREIGN KEY ("household_id","asset_class_id") REFERENCES "public"."asset_classes"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_household_id_account_type_id_account_types_household_id_id_fk" FOREIGN KEY ("household_id","account_type_id") REFERENCES "public"."account_types"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_household_id_tax_status_id_tax_statuses_household_id_id_fk" FOREIGN KEY ("household_id","tax_status_id") REFERENCES "public"."tax_statuses"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_household_id_liquidity_id_liquidities_household_id_id_fk" FOREIGN KEY ("household_id","liquidity_id") REFERENCES "public"."liquidities"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_household_id_institution_id_institutions_household_id_id_fk" FOREIGN KEY ("household_id","institution_id") REFERENCES "public"."institutions"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidities" ADD CONSTRAINT "liquidities_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_household_id_action_id_actions_household_id_id_fk" FOREIGN KEY ("household_id","action_id") REFERENCES "public"."actions"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_household_id_investment_id_investments_household_id_id_fk" FOREIGN KEY ("household_id","investment_id") REFERENCES "public"."investments"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_statuses" ADD CONSTRAINT "tax_statuses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_marks" ADD CONSTRAINT "valuation_marks_household_id_investment_id_investments_household_id_id_fk" FOREIGN KEY ("household_id","investment_id") REFERENCES "public"."investments"("household_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- The owner link and action legs may be inserted after their parent in one transaction.
-- Check the complete shape at commit so partial economic records cannot persist.
CREATE FUNCTION check_investment_owners() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'investments' THEN target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN target_id := OLD.investment_id;
  ELSE target_id := NEW.investment_id; END IF;
  IF EXISTS (SELECT 1 FROM investments WHERE id = target_id)
     AND NOT EXISTS (SELECT 1 FROM investment_owners WHERE investment_id = target_id) THEN
    RAISE EXCEPTION 'investment must have at least one owner';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER investment_requires_owner AFTER INSERT OR UPDATE ON investments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_investment_owners();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER investment_owner_required AFTER DELETE OR UPDATE ON investment_owners
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_investment_owners();
--> statement-breakpoint
CREATE FUNCTION check_action_movements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; action_row actions%ROWTYPE; leg_count integer;
BEGIN
  IF TG_TABLE_NAME = 'actions' THEN target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN target_id := OLD.action_id;
  ELSE target_id := NEW.action_id; END IF;
  SELECT * INTO action_row FROM actions WHERE id = target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO leg_count FROM movements WHERE action_id = target_id;
  IF action_row.kind = 'transfer' THEN
    IF leg_count <> 2 OR NOT EXISTS (
      SELECT 1 FROM movements s JOIN movements d ON s.action_id = d.action_id
      WHERE s.action_id = target_id AND s.role = 'source' AND s.direction = 'out'
        AND d.role = 'destination' AND d.direction = 'in'
        AND s.investment_id <> d.investment_id
        AND s.amount = action_row.amount AND d.amount = action_row.amount
    ) THEN RAISE EXCEPTION 'transfer requires equal source and destination movements'; END IF;
  ELSIF leg_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM movements m WHERE m.action_id = target_id AND m.role = 'external'
      AND m.direction = CASE WHEN action_row.kind = 'contribution' THEN 'in' ELSE 'out' END
      AND m.amount = action_row.amount
  ) THEN RAISE EXCEPTION 'external action requires one matching movement'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER action_requires_movements AFTER INSERT OR UPDATE ON actions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_action_movements();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER movements_match_action AFTER INSERT OR UPDATE OR DELETE ON movements
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_action_movements();
--> statement-breakpoint
CREATE FUNCTION check_open_investment_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE activity_date date; target_investment uuid;
BEGIN
  target_investment := NEW.investment_id;
  IF TG_TABLE_NAME = 'movements' THEN
    SELECT effective_date INTO activity_date FROM actions WHERE id = NEW.action_id;
  ELSE
    activity_date := NEW.as_of_date;
  END IF;
  IF EXISTS (SELECT 1 FROM investments WHERE id = target_investment
    AND status = 'closed' AND activity_date > closed_on) THEN
    RAISE EXCEPTION 'cannot record activity after investment closure';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movements_open_investment BEFORE INSERT OR UPDATE ON movements
FOR EACH ROW EXECUTE FUNCTION check_open_investment_activity();
--> statement-breakpoint
CREATE TRIGGER marks_open_investment BEFORE INSERT OR UPDATE ON valuation_marks
FOR EACH ROW EXECUTE FUNCTION check_open_investment_activity();
--> statement-breakpoint
CREATE FUNCTION check_investment_close_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'closed' AND (
    EXISTS (SELECT 1 FROM valuation_marks WHERE investment_id = NEW.id AND as_of_date > NEW.closed_on)
    OR EXISTS (SELECT 1 FROM movements m JOIN actions a ON a.id = m.action_id
      WHERE m.investment_id = NEW.id AND a.effective_date > NEW.closed_on)
  ) THEN RAISE EXCEPTION 'investment closure predates recorded activity'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER investments_close_date BEFORE UPDATE OF status, closed_on ON investments
FOR EACH ROW EXECUTE FUNCTION check_investment_close_date();
--> statement-breakpoint
CREATE FUNCTION keep_link_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'investment_owners' THEN
    IF NEW.investment_id <> OLD.investment_id OR NEW.owner_id <> OLD.owner_id OR NEW.household_id <> OLD.household_id
    THEN RAISE EXCEPTION 'owner links cannot be reassigned'; END IF;
  ELSIF NEW.action_id <> OLD.action_id OR NEW.investment_id <> OLD.investment_id OR NEW.household_id <> OLD.household_id
  THEN RAISE EXCEPTION 'movement links cannot be reassigned'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER investment_owner_identity BEFORE UPDATE ON investment_owners
FOR EACH ROW EXECUTE FUNCTION keep_link_identity();
--> statement-breakpoint
CREATE TRIGGER movement_identity BEFORE UPDATE ON movements
FOR EACH ROW EXECUTE FUNCTION keep_link_identity();
--> statement-breakpoint
CREATE FUNCTION check_action_date_for_closed_investments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM movements m JOIN investments i ON i.id = m.investment_id
    WHERE m.action_id = NEW.id AND i.status = 'closed' AND NEW.effective_date > i.closed_on) THEN
    RAISE EXCEPTION 'cannot move action after investment closure';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER actions_closed_investment_date BEFORE UPDATE OF effective_date ON actions
FOR EACH ROW EXECUTE FUNCTION check_action_date_for_closed_investments();
