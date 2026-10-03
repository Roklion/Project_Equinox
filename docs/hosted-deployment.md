# Hosted deployment

This is the operational path for Vercel Hobby and Neon Free. The application uses standard PostgreSQL through `pg` and Drizzle. Single-password authentication is implemented, but the production URL is protected only after migrations are applied and the required environment variables are configured. Complete the [authentication setup](../README.md#authentication) and verify hosted sign-in before entering real financial data.

## Configure Neon and Vercel

1. Create a Neon Free project and identify its production branch and database. Obtain a PostgreSQL connection URL with TLS enabled. Keep the URL private; do not paste its password, hostname, or full value into a GitHub issue, commit, screenshot, or log.
2. Import this repository into Vercel Hobby and select `main` as the production branch. Use the normal Next.js build settings (`npm ci` and `npm run build`); the build does not contact PostgreSQL or require seeded data.
3. In Vercel Project Settings → Environment Variables, set `DATABASE_URL` for Production only. Do not use a `NEXT_PUBLIC_` prefix. Add Preview or Development access only when a separate safe database and a concrete workflow require it. Avoid connecting previews to production data.
4. Generate `APP_PASSWORD_HASH` and `SESSION_SECRET` as described in [authentication setup](../README.md#authentication), then set them privately in Vercel Project Settings → Environment Variables. Never invent placeholder production secrets or commit generated values.

For local development, copy `.env.example` to ignored `.env.local` and use the Docker PostgreSQL URL described in [local setup](../README.md#local-postgresql). To run an explicit hosted operation from a trusted workstation, temporarily set `DATABASE_URL` to the hosted URL in ignored local configuration or the process environment. Check the target in the Neon console before running migration or verification commands. Never use `npm run db:reset` against a hosted database.

## Migrate, deploy, and verify

1. From the exact release commit, install locked dependencies with `npm ci`. Review the committed files in `drizzle/` and confirm the target production branch/database in Neon.
2. Run `npm run db:migrate` with the production `DATABASE_URL` in the process environment. It applies pending committed migrations using Drizzle's journal. It is an explicit release step, separate from Vercel builds and page requests. Never use schema push or manual SQL to replace this step.
3. Run `npm run db:verify` with that same URL. It uses the server-only adapter to create a transaction-local temporary table, insert one synthetic row, read it back, and drop the table on commit. It writes no lasting demo or financial data and prints only a pass/fail message. A failure should stop the release until connectivity and permissions are corrected; avoid posting raw driver errors that might contain connection details.
4. Deploy the commit to Vercel Production, then check the deployment status and load the production URL on desktop and an iPhone-class browser. Verify unauthenticated requests are protected, sign in, and complete first-run household/owner setup if the target is empty. An empty configured household should show useful empty states. Check the browser network response and JavaScript assets for credential exposure; only server-side code should use `DATABASE_URL`.

There is no automatic production demo seed. Canonical financial and authentication tables are created by committed migrations. The temporary row in `db:verify` supplies a reproducible synthetic write/read check; it does not validate the full application workflow. Run the [release validation commands](product-validation.md#commands-and-ci) against disposable local PostgreSQL before deployment. Confirm hosted sign out invalidates the session and protected requests require signing in again.

Before entering or importing real financial records, verify [backup and restore](backup-and-restore.md) and follow the [private migration runbook](migration-and-portability.md#real-migration-operating-sequence). Validate the actual deployment's secrets, TLS, private logging, and backup schedule operationally; passing synthetic tests alone is not production acceptance. Do not attach private deployment details or migration evidence to public issues.

## Roll forward

Prepare schema changes with the [schema workflow](../README.md#changing-the-schema), then repeat the migration, verification and deployment sequence above. Correct failures with a forward migration and new deployment, never an edited applied file or production reset. If a change cannot support old and new code during rollout, plan a compatible intermediate migration/release.

Verify provider capacity against actual personal-app use; revisit capacity and cost when a concrete limit appears.
