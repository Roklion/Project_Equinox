# Hosted deployment

This is the operational path for Vercel Hobby and Neon Free. The application uses standard PostgreSQL through `pg` and Drizzle. The current app is an empty shell; it has no investment storage workflow or authentication yet. Do not enter real financial data until [Issue #17](https://github.com/Roklion/Project_Equinox/issues/17) protects the production URL.

## Configure Neon and Vercel

1. Create a Neon Free project and identify its production branch and database. Obtain a PostgreSQL connection URL with TLS enabled. Keep the URL private; do not paste its password, hostname, or full value into a GitHub issue, commit, screenshot, or log.
2. Import this repository into Vercel Hobby and select `main` as the production branch. Use the normal Next.js build settings (`npm ci` and `npm run build`); the build does not contact PostgreSQL or require seeded data.
3. In Vercel Project Settings → Environment Variables, set `DATABASE_URL` for Production only. Do not use a `NEXT_PUBLIC_` prefix. Add Preview or Development access only when a separate safe database and a concrete workflow require it. Avoid connecting previews to production data.
4. Issue #17 owns `APP_PASSWORD_HASH` and `SESSION_SECRET` (or its final chosen names). Generate them using that ticket's documented process and configure them privately once the implementation exists. Never invent placeholder production secrets. Before then, the public empty shell contains no personal data.

For local development, copy `.env.example` to ignored `.env.local` and use the Docker PostgreSQL URL described in [local setup](../README.md#local-postgresql). To run an explicit hosted operation from a trusted workstation, temporarily set `DATABASE_URL` to the hosted URL in ignored local configuration or the process environment. Check the target in the Neon console before running migration or verification commands. Never use `npm run db:reset` against a hosted database.

## Migrate, deploy, and verify

1. From the exact release commit, install locked dependencies with `npm ci`. Review the committed files in `drizzle/` and confirm the target production branch/database in Neon.
2. Run `npm run db:migrate` with the production `DATABASE_URL` in the process environment. It applies pending committed migrations using Drizzle's journal. It is an explicit release step, separate from Vercel builds and page requests. Never use schema push or manual SQL to replace this step.
3. Run `npm run db:verify` with that same URL. It uses the server-only adapter to create a transaction-local temporary table, insert one synthetic row, read it back, and drop the table on commit. It writes no lasting demo or financial data and prints only a pass/fail message. A failure should stop the release until connectivity and permissions are corrected; avoid posting raw driver errors that might contain connection details.
4. Deploy the commit to Vercel Production, then check the deployment status and load the production URL on desktop and an iPhone-class browser. The current shell should render without database data. Check the browser network response and JavaScript assets for credential exposure; only server-side code should use `DATABASE_URL`.

There is no automatic production demo seed. Since the baseline migration has no domain tables, a permanent synthetic seed is not applicable yet. The temporary row in `db:verify` supplies a reproducible synthetic write/read check. Investment workflow validation belongs to the later domain and application tickets.

## Roll forward

For each later schema change, generate and review a new versioned migration with the [schema workflow](../README.md#changing-the-schema). Test it against disposable PostgreSQL, run the repository checks, and commit the schema, SQL, snapshot, and journal together. For release, apply `npm run db:migrate` to the intended Neon production branch before deploying code that requires the new schema. Re-run `npm run db:verify` and verify the deployed application. The migrator records applied versions; re-running it is safe. Correct a faulty migration with a new forward migration and a new deployment, rather than editing an already-applied file or resetting production. Plan a compatible intermediate migration and code release when a schema change cannot support both old and new code during rollout.

The operational check uses standard SQL temporary tables and the same `pg` adapter used for local PostgreSQL. `neon.ts` configures Neon branch policy only; it is not imported by application, domain, or migration code. No paid service is required for the present empty-shell workload. Revisit capacity and cost only when a concrete limit appears.
