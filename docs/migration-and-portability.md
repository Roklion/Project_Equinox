# Migration contracts and canonical portability

This document owns EPIC 5's source-neutral boundary and portable format. Financial rules remain owned by [the data model](data-model.md) and [metrics](metrics.md); [architecture](architecture.md) owns dependency direction. Neither capability depends on a private workbook or the EPIC 4 UI. First-run setup (#61) is an operator prerequisite for a future import into a zero-household target, not for these contracts. Database backups remain a separate [operational capability](backup-and-restore.md).

## Source-neutral migration boundary

`src/domain/migration/contracts.ts` defines normalized adapter records; `validateMigration` returns deterministic, presentation-neutral findings. It performs no database reads or writes. Later spreadsheet adapters (#65), atomic import/preflight (#66), reconciliation (#67), and the private CLI (#68) consume this boundary rather than introducing workbook concepts into canonical entities or analytics.

A dataset has a stable `datasetId`, `records`, declared `scopes`, and `expectations`. Every record, scope, and expectation carries an opaque `sourceKey` and `sourceKind`, optionally `safeReference`. Keys are unique across the entire dataset. Adapters must issue deterministic keys stable across repeated parsing of the same dataset, with no private labels, file paths, filenames, account identifiers or raw row contents embedded in them. Workbook positions/formulas may be tracked privately by an adapter but are not canonical record fields. Safe references are local diagnostic hints only; they never enter default findings/logs or analytics. Dataset IDs plus source keys provide provenance for later private manifests; no general audit/versioning subsystem is introduced.

Investment records carry a display name, owner keys, optional classification keys, custom-group keys and explicit lifecycle. Financial records carry investment source-key references until the executor resolves canonical IDs. External flows use positive magnitudes and contribution/withdrawal types; a transfer contains one amount and distinct source/destination keys. Valuations are separate observations with nonnegative gross/debt, preserving valid negative NAV. Closed investments require a calendar close date on or after all actions and marks. There is one mark per investment/date.

`MigrationMapping` targets one existing household. Owner source keys must explicitly map to canonical owners in that household. `MigrationTarget` is a household-scoped catalog supplied by later database preflight: it verifies referenced canonical owner/classification IDs. A classification maps to either a canonical ID in the correct dimension or a nonempty, already-trimmed normalized label. The future executor creates/reuses that label by exact equality within household and dimension; no fuzzy matching or case-folding is implied. A supplied but unmapped classification is blocking; an absent optional classification stays unclassified. Custom groups follow the same explicit mapping rule and may overlap. Required owners are never created or guessed by the migration contract.

Money fields are decimal strings, never floating point; persisted inputs follow the exact-cent `numeric(18,2)` capacity and reject any rounding. Financial dates are valid `YYYY-MM-DD` calendar strings, with no timestamp coercion. The normalized TypeScript contract is an adapter output, not a parser for arbitrary JSON/rows: adapters must establish its structural shape and report ambiguous or unsupported raw records before handing it to validation. The validator also reports unsupported record kinds. It checks semantics and references without silently correcting input.

Findings have stable `code`, `severity: error`, optional `sourceKey`, and optional field name; no private input value or note is echoed. Codes cover invalid money/date/identity/expectation, duplicate source keys/marks, missing investments/scopes, unresolved owners/classifications, household mismatch, lifecycle conflicts, same-investment transfers, and unsupported records. Findings sort by key, code and field using locale-independent lexical ordering. Blocking findings prevent later apply; this ticket does not implement apply.

## Source expectations for reconciliation

Each expectation references an investment key or declared scope of investment keys, a measure, and either an as-of date or start/end calendar dates. Supported measures are gross value, debt, NAV, contributions, distributions, P&L, historical value, MOIC and XIRR. Historical value expectations represent individual date/value points; the source-definition tag can specify the source series definition. Money values are signed exact decimal strings where meaningful (NAV, P&L and historical value), with no single stored-column capacity restriction on aggregated totals. Gross/debt/contribution/distribution expectations are nonnegative. MOIC/XIRR values are finite numbers with no comparison tolerance or display rounding applied here.

Source outputs are explicitly `available` with a typed value, `missing`, or `not_computable`, optionally with a reason. Zero is an available value, never a substitute for a missing output. `sourceDefinitionTag` identifies intentional definition differences; later reconciliation owns comparison policy and consumes existing analytics, without reproducing spreadsheet formulas or adding TWR to canonical records.

## Canonical export format v1

The JSON bundle is `{ format: "equinox-canonical", version: 1, generatedAt, data }`. `generatedAt` is an operational UTC ISO timestamp with millisecond precision. All financial dates remain date-only strings. `data` contains:

| Field | Canonical content |
| --- | --- |
| `household` | ID, name and USD currency |
| `owners` | ID and name, including currently unused owners |
| `classifications` | ID, dimension and label, including unused lookup values; custom groups use dimension `customGroup` |
| `investments` | ID, name, status, close date, owner/group ID arrays and optional classification IDs by dimension |
| `actions` | ID, type, effective date, exact decimal amount and complete nested movements (stable movement ID, investment ID, role, direction, amount) |
| `marks` | ID, investment ID, as-of date, gross value and linked debt |

Actions and marks include optional canonical `source`, `sourceReference`, and `notes` where stored. Those fields can contain private text and require the same protection as financial amounts. Private migration reports/manifests are not exported. Transfers remain one logical action with equal source/out and destination/in movements; preserving movement IDs retains all canonical identities. No aggregate/return fields, authentication sessions/throttles/passwords, credentials, deployment configuration or workbook artifacts are included.

Entities sort by stable ID; classifications sort by dimension then ID. Nested owner/group IDs and movement IDs also sort. Object properties have a fixed order. Re-exporting unchanged canonical data with the same generated-at timestamp yields identical bytes. Operational timestamps normally differ between exports. Monetary strings round-trip exactly and never enter numeric JSON values; no timezone conversion occurs for economic dates.

`validateExportBundle` accepts unknown parsed JSON and rejects unsupported versions, malformed/extra fields, invalid timestamp/date/money encodings, duplicate identities, broken or wrong-dimension references, lifecycle conflicts, duplicate valuation dates and incomplete/disagreeing action legs. It validates format integrity without a database. Validation does not implement restore/import or verify an existing target database. `serializeExportBundle` validates before serialization.

The application-owned `ExportRepository` reads exactly one explicit existing household. Its PostgreSQL adapter reads only canonical tables using one repeatable-read, read-only transaction, including unused lookups and closed history. Missing households and failed reads fail the export rather than returning partial data. No analytics cache/store or schema migration is needed.

## Private local command

Configure the normal private `DATABASE_URL` in ignored `.env.local` or the shell. Run from the checkout root:

```sh
npm run data:export -- export <household-id> <absolute-private-file-path-outside-checkout>
npm run data:export -- validate <bundle-file-path>
```

Use an explicit canonical household UUID; the command never picks the first household or creates one. The destination's parent must exist and the file must not already exist. Export refuses destinations inside the current checkout, even ignored ones. It writes only after successful query/validation, creates the file exclusively with private POSIX permissions where supported, and removes its own file if writing fails. On Windows, keep the destination in a folder with private ACLs. Validation mode needs no database connection.

Terminal success output includes only destination and entity counts, or a validation-success message. Failures use a fixed diagnostic message without driver errors, private paths, labels, money or source contents. There is no browser download interface in this ticket.

**Real exports are private artifacts, comparable to the source workbook.** Store them outside every public checkout in a private, access-controlled location. Do not commit, attach to issues/PRs, snapshot or log them. Handle destination paths privately too. Automated tests and public examples use invented data only. An export is a user-data portability format; use the backup runbook for database recovery and take a current backup before a later real import. This work does not complete the spreadsheet adapter, migration executor, reconciliation engine or EPIC 5's end-to-end runbook.
