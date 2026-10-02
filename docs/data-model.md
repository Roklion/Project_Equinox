# Data model

This document defines Equinox's canonical domain concepts and invariants. Metric formulas are owned by [metrics.md](metrics.md).

## Core entities

### Household

The top-level reporting context. For Equinox metrics, the household reporting boundary is the household's complete universe of tracked investments, not every asset and liability the household owns. **Household external cash flow** means value crossing into or out of that tracked-investment universe; for example, cash moved from a household checking account that is not tracked as an investment into a tracked brokerage account is a contribution.

### Owner

A person or ownership entity associated with one or more investments. Ownership is a reporting dimension and does not create a separate ledger.

### Investment

The leaf-level economic account or investment whose value and actions are recorded. An investment has a stable identity, display name, lifecycle status, and classification metadata.

Supported classification dimensions include:

- owner;
- asset class;
- account type;
- tax status;
- liquidity;
- institution; and
- custom groups.

Classifications should use stable identities so labels can change without rewriting economic history. Classification and membership history is not modeled: historical analytics use current canonical associations. Owners are many-to-many without percentage allocations; additive owner breakdowns use one deterministic owner-set bucket per investment. Custom groups may overlap and serve as reporting-scope filters rather than additive composition segments. The exact rules are owned by [metrics](metrics.md#snapshot-scopes-and-additive-breakdowns).

### Portfolio or view

A dynamic aggregation selected by filters or saved grouping rules. It references investments and recomputes aggregate metrics from their underlying events. It does not own duplicate transactions, valuation marks, or pre-averaged returns.

### Action

A dated economic event affecting an investment. The canonical user-entered action types are:

- **Contribution:** value entering the household's tracked-investment universe from outside that boundary.
- **Withdrawal/Distribution:** value leaving the household's tracked-investment universe across that boundary.
- **Transfer:** value moving between two investments within the household boundary.
- **Valuation Mark:** an observation of gross value and, where applicable, investment-linked debt as of a date.

The MVP has no audit/change-history subsystem. Explicit correction updates the canonical record in place. A contribution or withdrawal can be edited or deleted as one action; its single movement changes with it. A transfer can be edited or deleted only as one logical action, preserving both linked movements. A valuation mark can be explicitly replaced in place for the same investment/date or deleted. Creating a same-date mark never silently replaces one. Presentation must confirm explicit deletion. Closing an investment retains its economic history until a user explicitly corrects or deletes a historical record.

## Transfer representation

An internal transfer is one logical action with two linked investment-level movements: an outflow from the source investment and an inflow to the destination investment. The linked movements net to zero when both investments are inside the reporting boundary, including the household's complete tracked-investment universe. For a portfolio or filtered subset containing only one leg, that leg is a boundary-relative inflow or outflow and must participate in the subset's cash-flow and performance calculations. Fees or taxes that cross the reporting boundary, if supported later, are separate external events rather than part of the transfer amount.

## Valuation representation

Every valuation mark has an as-of date and identifies its investment. A mark records enough information to derive:

- gross investment value;
- investment-linked debt; and
- net investment value, which is gross value minus investment-linked debt.

Debt may exceed gross value; negative net investment value is valid. A mark is an observation, not a cash flow.

The MVP accepts one mark per investment and calendar date. A second insert is rejected by a database uniqueness constraint. An explicit replacement operation updates an existing mark on that date in place, including a historical mark on a closed investment. It fails if no mark exists; no silent insert or overwrite occurs. A batch valuation save uses one shared as-of date, omits untouched rows, and identifies each entered row as creation or replacement. All rows are validated before writing and the batch commits atomically.

An investment-history correction may also change a mark's as-of date while retaining the mark's identity. The corrected date must be valid for the investment lifecycle and must not collide with another mark for the same investment. A collision fails the correction without replacing the other mark.

## Runtime administration

Household, owner and classification names are mutable display data; renaming preserves their IDs and all investment/financial records. Administration accepts 1–200 characters after trimming. Classification/custom-group create and rename reject an exact matching label within that household and dimension, excluding the record being renamed. Equality is case-sensitive, consistent with migration label resolution. Existing database identity constraints do not impose label uniqueness; the administration application path checks duplicates before writing and does not merge preexisting duplicate records. Owner names may repeat, preserving existing owner semantics; distinct display names are encouraged for clear selection.

Removing an owner, classification or custom group is allowed only if no investment (including closed investments) references it. Reference checks and restrictive foreign keys prevent silent association removal. Reclassification and membership removal use the existing investment metadata workflow first. A removal never changes financial history. Household deletion, additional households, owner percentages and classification history remain outside the MVP.

## Lifecycle

Creation requires a display name and at least one household owner, but no opening financial record. Metadata editing retains the investment ID and replaces current owner/classification/custom-group associations without rewriting actions or valuations; optional classifications and groups can be cleared. Closed investments may also have their metadata edited, preserving lifecycle status and close date. All selected records must belong to the same household. Closing requires an explicit calendar date on or after all recorded actions and valuations; an earlier date is rejected while history remains unchanged.

An investment can be active or closed. Closing stops ordinary forward data entry after the close date but does not delete actions, marks, classifications, or historical participation in portfolio calculations. Closure itself does not imply full realization or create a zero terminal valuation: fully realized history requires its recorded distributions and an explicit zero mark. Deleting that mark restores latest-on-or-before alignment with any older qualifying mark. Historical actions and marks on or before the close date may be entered or explicitly corrected. Reopening behavior remains a future product decision.

## Invariants

- Investments are the leaf-level source of economic history; portfolios are derived views.
- Every valuation has an as-of date.
- Valuation marks are never cash flows.
- Internal transfers create investment-level movements and zero external cash flow across the complete household tracked-investment boundary; a subset containing only one leg recognizes the boundary-relative flow.
- Net investment value equals gross value minus investment-linked debt.
- Negative equity is valid.
- Closing an investment retains its history.
- Aggregate metrics are recomputed from underlying events and values, never produced by averaging child metrics.
- Portfolio XIRR uses combined portfolio cash flows and terminal value; investment-level IRRs are never averaged.

## Time and money conventions

MVP financial values are USD with exact cent precision. Financial/economic dates are daily calendar dates, not timestamps. Operational metadata may use UTC timestamps but cannot supply or replace an economic effective date. Storage and adapter conventions are owned by [architecture](architecture.md#data-integrity).

Persisted monetary columns use `numeric(18, 2)` (up to 16 whole digits). The application service accepts exact decimal strings with at most two fractional digits and rejects values that would require rounding. Contribution, withdrawal, and transfer inputs are positive magnitudes; the selected action type owns direction. Gross value and linked debt inputs are nonnegative; derived net value can be negative. Snapshot valuation selection uses the latest mark on or before the requested calendar date, preserves its actual date, and never interpolates or backfills from future marks. Missing coverage is explicit rather than zero. Exact-cent aggregation, period boundaries, and result states are owned by [metrics](metrics.md). The implemented numerical-return bounds, tolerances and unavailable states are defined in [metrics](metrics.md#inception-return-query-and-numerical-policy); display rounding belongs to presentation. These decisions must not be implied by UI formatting. Multi-currency and foreign exchange are outside the MVP.
