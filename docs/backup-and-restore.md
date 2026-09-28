# PostgreSQL backup and restore validation

Equinox's live database remains hosted PostgreSQL. The NAS stores private custom-format dumps; it is never a restore target for the live database. These commands use PostgreSQL 18.4 client tools, matching the local Compose image. Keep backup files, connection URLs, the private environment file, and actual NAS paths outside this public repository.

## Run one backup

`scripts/backup-postgres.sh` requires `DATABASE_URL` (a direct/unpooled PostgreSQL URI with TLS configured for the hosted provider) and `EQUINOX_BACKUP_DIR` (an **existing, writable** directory on the job's machine or a mounted share). It requires Bash, GNU `date`, `pg_dump`, and `pg_restore` from PostgreSQL 18.4. Run it as `bash scripts/backup-postgres.sh` on a matching host or inside `postgres:18.4`. Do not point a backup job at a pooled URL. Keep the URL in a private environment file or secret manager; the script prints only a dated basename. PostgreSQL client errors are printed for troubleshooting, so keep Task Scheduler/container logs private.

The job writes `equinox-YYYYMMDDTHHMMSSZ.dump` in custom format. It first writes a hidden temporary file in the **same directory**, checks that it is nonempty, and runs `pg_restore --list`. Only then does it rename it to the final name. A failed or interrupted dump leaves no final file; the exit trap removes its temporary file and owned lock. A hard-link lock prevents overlapping runs. If an interrupted process leaves `.equinox-backup.lock`, inspect the folder and running containers before removing that file and retrying. A timestamp collision fails instead of replacing a dump. `pg_restore --list` validates the archive structure; periodic full restores remain necessary to verify its contents.

After a successful new dump, retention keeps the newest completed dump, plus the newest dump for each UTC day in the current 14-day window, each UTC ISO week in the current 8-week window, and each UTC month in the current 12-month window. These categories overlap; a file stays if any category selects it. Only completed files matching this job's filename pattern are eligible for pruning. A failed backup never starts pruning, and the newly validated dump is always kept. This protects the only known-good dump if older files are absent. Review available NAS capacity and verify restore results regularly; snapshots or share versioning provide an additional layer, not a substitute for database dumps.

Before the first scheduled run, move any manual dumps that must be kept unchanged (for example, a pre-migration snapshot) to a separate private archival folder. The retention job may prune older same-day files in its managed backup folder.

## Synology DSM daily deployment

The portable script does not depend on Synology. For the established NAS-local path:

1. In File Station, keep a dedicated administrator-restricted backup shared folder. Enable Btrfs snapshots or versioning if the NAS supports them. Do not expose the NAS to the public internet for this job.
2. Place a copy of `scripts/backup-postgres.sh` at a private NAS path readable by the task. Store a private environment file outside the shared backup folder, readable only by the task account, containing `DATABASE_URL=<direct hosted URI>` and `EQUINOX_BACKUP_DIR=/backups`. Do not put either value into a public issue, screenshot, task name, or command log.
3. In DSM Task Scheduler, create a daily **User-defined script** task at a quiet time. Use an account that can run Container Manager/Docker and write the restricted folder. In the task, run a one-shot `postgres:18.4` container with the private environment file, a read-only bind mount for the script, and a read-write bind mount of the backup folder at `/backups`. Use bridge networking, no published port, and no privileged mode. The command inside the container is `bash /job/backup-postgres.sh`. The generic command shape is:

   ```sh
   docker run --rm --network bridge --env-file "PRIVATE_ENV_FILE" \
     --mount "type=bind,src=PRIVATE_SCRIPT_PATH,dst=/job/backup-postgres.sh,readonly" \
     --mount "type=bind,src=PRIVATE_BACKUP_FOLDER,dst=/backups" \
     postgres:18.4 bash /job/backup-postgres.sh
   ```

   Replace the three uppercase paths **privately on the NAS**; none belongs in Git. Container Manager can also run the same image and mounts as a one-shot container for a manual trial. Set it to stop after the command finishes; the Task Scheduler job should launch a new one each day.
4. Run one manual scheduled task, check its exit status and confirm a new nonempty `.dump` in File Station. Schedule a separate periodic restore test on a trusted local/test PostgreSQL server as described below. Review task failures; a missing successful daily run needs investigation.

## Validate a restore safely

`scripts/validate-restore.sh DUMP_FILE` requires a selected dump and `TEST_DATABASE_URL` for the **postgres maintenance database** on a disposable local/test PostgreSQL server with `CREATEDB` permission. Supply a valid PostgreSQL URI and percent-encode reserved characters in credentials (for example, `?` as `%3F`). Never set it to the live production database. The script checks the dump, creates a uniquely named `equinox_restore_*` database, explicitly selects and verifies that generated database before restoring with `--exit-on-error --no-owner --no-privileges`, checks all five current migration records and essential application tables, then inserts and reads a synthetic household **inside a rolled-back transaction**. It forcibly drops only the generated database on exit; it does not drop or restore into the maintenance database. Run it with PostgreSQL 18.4 tools from a trusted host, or mount the script and selected dump into a one-shot `postgres:18.4` container that can reach the disposable test server. Never use a production URL for `TEST_DATABASE_URL`.

The normal validation proves that the selected archive restores and its schema supports a synthetic read/write. It does **not** claim that a production dump contains synthetic rows. To verify row preservation end to end without adding demo data to production, create an empty disposable **source** database on local PostgreSQL, point `DATABASE_URL` to it, run `npm run db:migrate` and `npm run db:seed`, then back it up with `scripts/backup-postgres.sh` into an ignored local backup directory. Run `scripts/validate-restore.sh THAT_DUMP --expect-demo` with `TEST_DATABASE_URL` pointing to the same local server's `postgres` maintenance database. This extra mode confirms a known synthetic household, investment, and valuation row survived dump and restore. The demo seed refuses a nonlocal or nonempty household database. Drop only the generated disposable source database after the check; do not use the production database or its dump for the demo-row assertion.

If validation fails, retain the dump and report the failure privately without printing connection strings or private row contents. Investigate before relying on that backup. Do not overwrite the live database when testing recovery.
