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
pg_restore --list "$dump" >/dev/null || { echo 'Selected dump is invalid.' >&2; exit 1; }
maintenance_url=$TEST_DATABASE_URL
base=${maintenance_url%%\?*}
query=${maintenance_url#"$base"}
if [[ ! $base =~ ^postgres(ql)?://.+/postgres$ ]]; then
  echo 'TEST_DATABASE_URL must name the postgres maintenance database.' >&2
  exit 1
fi
current_database=$(psql --dbname="$maintenance_url" -X -A -t -v ON_ERROR_STOP=1 -c 'select current_database()') || {
  echo 'Could not connect to the postgres maintenance database.' >&2
  exit 1
}
if [[ $current_database != postgres ]]; then
  echo 'Maintenance connection did not select the postgres database.' >&2
  exit 1
fi

target="equinox_restore_$(date -u +%s)_${RANDOM}_${RANDOM}"
if [[ -n "$query" && "$query" != '?' ]]; then
  target_url="${base%/*}/$target$query&dbname=$target"
else
  target_url="${base%/*}/$target?dbname=$target"
fi
created=false
cleanup() {
  exit_status=$?
  trap - EXIT
  if [[ $created == true ]]; then
    if ! dropdb --maintenance-db="$maintenance_url" --force --if-exists "$target" >/dev/null 2>&1; then
      echo 'Could not remove the generated restore database; clean it up on the test server.' >&2
      exit_status=1
    fi
  fi
  exit "$exit_status"
}
trap cleanup EXIT
createdb --maintenance-db="$maintenance_url" "$target" || {
  echo 'Could not create a disposable restore database.' >&2
  exit 1
}
created=true
target_database=$(psql --dbname="$target_url" -X -A -t -v ON_ERROR_STOP=1 -c 'select current_database()') || {
  echo 'Could not connect to the generated disposable restore database.' >&2
  exit 1
}
if [[ $target_database != "$target" ]]; then
  echo 'Generated restore URL did not select the disposable database.' >&2
  exit 1
fi
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target_url" "$dump" >/dev/null || {
  echo 'Restore into the disposable database failed.' >&2
  exit 1
}

# Keep these created_at identities aligned with drizzle/meta/_journal.json.
expected_migration_times='1790395811882,1790481077627,1790481544775,1790525408351,1790525408352'
schema_count=$(psql --dbname="$target_url" -X -A -t -v ON_ERROR_STOP=1 -c "
  select count(distinct created_at)
  from drizzle.__drizzle_migrations
  where created_at in ($expected_migration_times);") || {
  echo 'Could not read restored migration history.' >&2
  exit 1
}
if [[ $schema_count != 5 ]]; then
  echo 'Restored database is missing one or more current migration records.' >&2
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
