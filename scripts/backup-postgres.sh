#!/usr/bin/env bash
set -euo pipefail

# Runs inside a PostgreSQL 18.4 image (or a host with matching client tools).
if [[ -z "${DATABASE_URL:-}" || -z "${EQUINOX_BACKUP_DIR:-}" ]]; then
  echo 'DATABASE_URL and EQUINOX_BACKUP_DIR are required.' >&2
  exit 1
fi

backup_dir=$EQUINOX_BACKUP_DIR
if [[ ! -d "$backup_dir" || ! -w "$backup_dir" ]]; then
  echo 'EQUINOX_BACKUP_DIR must be an existing writable directory.' >&2
  exit 1
fi

lock_dir="$backup_dir/.equinox-backup.lock"
lock_acquired=false
temporary=''
dump_pid=''
dump_starting=false
pending_signal=''
cleanup() {
  local exit_status=$?
  trap - EXIT
  if [[ -n "$temporary" ]] && ! rm -f -- "$temporary"; then
    echo 'Could not remove the temporary backup file.' >&2
    exit_status=1
  fi
  if [[ "$lock_acquired" == true ]]; then
    if ! rmdir -- "$lock_dir" 2>/dev/null; then
      echo 'Could not release the backup lock; inspect it before retrying.' >&2
      exit_status=1
    fi
  fi
  exit "$exit_status"
}
terminate_on_signal() {
  local signal=$1
  local exit_status=$2
  if [[ "$dump_starting" == true && -z "$dump_pid" ]]; then
    pending_signal=$signal
    return
  fi
  if [[ -n "$dump_pid" ]]; then
    trap '' INT TERM
    kill -s "$signal" "$dump_pid" 2>/dev/null || true
    wait "$dump_pid" 2>/dev/null || true
    dump_pid=''
  fi
  exit "$exit_status"
}
trap cleanup EXIT
trap 'terminate_on_signal INT 130' INT
trap 'terminate_on_signal TERM 143' TERM

if ! mkdir -- "$lock_dir" 2>/dev/null; then
  echo 'Another backup is running, or a stale backup lock needs inspection.' >&2
  exit 1
fi
lock_acquired=true

stamp=$(date -u +%Y%m%dT%H%M%SZ)
final="$backup_dir/equinox-$stamp.dump"
if [[ -e "$final" ]]; then
  echo 'A backup with this timestamp already exists.' >&2
  exit 1
fi
temporary=$(mktemp "$backup_dir/.equinox-$stamp.XXXXXXXX.tmp")

dump_starting=true
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$temporary" &
dump_pid=$!
dump_starting=false
if [[ -n "$pending_signal" ]]; then
  if [[ "$pending_signal" == INT ]]; then
    terminate_on_signal INT 130
  else
    terminate_on_signal TERM 143
  fi
fi
if ! wait "$dump_pid"; then
  dump_pid=''
  echo 'pg_dump failed; check the private connection settings and database access.' >&2
  exit 1
fi
dump_pid=''
[[ -s "$temporary" ]] || { echo 'pg_dump produced an empty file.' >&2; exit 1; }
pg_restore --list "$temporary" >/dev/null || { echo 'Dump validation failed.' >&2; exit 1; }
mv --no-clobber -- "$temporary" "$final"
[[ -e "$temporary" ]] && { echo 'Backup finalization failed.' >&2; exit 1; }
temporary=''
echo "Validated backup created: $(basename "$final")"

# Keep the newest successful dump regardless of age. Retain the newest dump
# in each UTC day/week/month within the 14/8/12 rolling calendar windows.
# Only this script's completed filename pattern is eligible for deletion.
day_cutoff=$(date -u -d '13 days ago' +%Y%m%d)
week_cutoff=$(date -u -d '7 weeks ago' +%G%V)
month_cutoff=$(date -u -d "$(date -u +%Y-%m-01) -11 months" +%Y%m)
declare -A days=() weeks=() months=()
shopt -s nullglob
files=("$backup_dir"/equinox-????????T??????Z.dump)
if ((${#files[@]} > 0)); then
  mapfile -t files < <(printf '%s\n' "${files[@]}" | sort -r)
fi
for file in "${files[@]}"; do
  name=${file##*/}
  [[ $name =~ ^equinox-([0-9]{8})T([0-9]{6})Z\.dump$ ]] || continue
  day=${BASH_REMATCH[1]}
  iso="${day:0:4}-${day:4:2}-${day:6:2}"
  week=$(date -u -d "$iso" +%G%V 2>/dev/null) || continue
  month=${day:0:6}
  keep=false
  if [[ $file == "$final" ]]; then keep=true; fi
  if [[ $day > $day_cutoff || $day == $day_cutoff ]] && [[ ! -v days[$day] ]]; then
    days[$day]=1; keep=true
  fi
  if [[ $week > $week_cutoff || $week == $week_cutoff ]] && [[ ! -v weeks[$week] ]]; then
    weeks[$week]=1; keep=true
  fi
  if [[ $month > $month_cutoff || $month == $month_cutoff ]] && [[ ! -v months[$month] ]]; then
    months[$month]=1; keep=true
  fi
  if [[ $keep == false ]]; then rm -- "$file"; fi
done
