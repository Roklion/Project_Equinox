#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ! -f "$1" || ( $# -eq 2 && "$2" != '--expect-demo' ) ]]; then
  echo 'Usage: validate-restore.sh DUMP_FILE [--expect-demo]' >&2
  exit 1
fi
if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  echo 'TEST_DATABASE_URL must point to a PostgreSQL maintenance database with CREATEDB permission.' >&2
  exit 1
fi

dump=$1
pg_restore --list "$dump" >/dev/null 2>&1 || { echo 'Selected dump is invalid.' >&2; exit 1; }
maintenance_url=$TEST_DATABASE_URL
base=${maintenance_url%%\?*}
query=${maintenance_url#"$base"}
if [[ ! $base =~ ^postgres(ql)?://.+/postgres$ ]]; then
  echo 'TEST_DATABASE_URL must name the postgres maintenance database.' >&2
  exit 1
fi
if [[ $(psql --dbname="$maintenance_url" -X -A -t -v ON_ERROR_STOP=1 -c 'select current_database()' 2>/dev/null) != postgres ]]; then
  echo 'Maintenance connection did not select the postgres database.' >&2
  exit 1
fi

target="equinox_restore_$(date -u +%s)_${RANDOM}_${RANDOM}"
target_url="${base%/*}/$target$query"
created=false
cleanup() {
  if [[ $created == true ]]; then
    dropdb --maintenance-db="$maintenance_url" --if-exists "$target" >/dev/null 2>&1 ||
      echo 'Could not remove the generated restore database; clean it up on the test server.' >&2
  fi
}
trap cleanup EXIT
createdb --maintenance-db="$maintenance_url" "$target" 2>/dev/null || {
  echo 'Could not create a disposable restore database.' >&2
  exit 1
}
created=true
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target_url" "$dump" >/dev/null 2>&1 || {
  echo 'Restore into the disposable database failed.' >&2
  exit 1
}

schema_count=$(psql --dbname="$target_url" -X -A -t -v ON_ERROR_STOP=1 -c "
  select count(*) from drizzle.__drizzle_migrations;" 2>/dev/null) || {
  echo 'Could not read restored migration history.' >&2
  exit 1
}
if [[ $schema_count -lt 5 ]]; then
  echo 'Restored database is missing current migration history.' >&2
  exit 1
fi
psql --dbname="$target_url" -X -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF to_regclass('public.households') IS NULL
    OR to_regclass('public.investments') IS NULL
    OR to_regclass('public.actions') IS NULL
    OR to_regclass('public.movements') IS NULL
    OR to_regclass('public.valuation_marks') IS NULL THEN
    RAISE EXCEPTION 'Current application schema is missing';
  END IF;
END $$;
BEGIN;
INSERT INTO households (name) VALUES ('Restore validation household');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM households WHERE name = 'Restore validation household') THEN
    RAISE EXCEPTION 'Synthetic restored-schema read failed';
  END IF;
END $$;
ROLLBACK;
SQL

if [[ ${2:-} == '--expect-demo' ]]; then
  psql --dbname="$target_url" -X -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM households h
    JOIN investments i ON i.household_id = h.id
    JOIN valuation_marks v ON v.investment_id = i.id
    WHERE h.name = 'Example Household'
      AND i.name = 'Sample Property Investment'
      AND v.as_of_date = DATE '2025-03-31'
      AND v.gross_value = 18000.00
  ) THEN
    RAISE EXCEPTION 'Synthetic demo records were not preserved by the dump';
  END IF;
END $$;
SQL
fi
echo 'Disposable restore, migration/schema, and synthetic read checks passed.'
