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

Classifications should use stable identities so labels can change without rewriting history.

### Portfolio or view

A dynamic aggregation selected by filters or saved grouping rules. It references investments and recomputes aggregate metrics from their underlying events. It does not own duplicate transactions, valuation marks, or pre-averaged returns.

### Action

An immutable or auditable dated economic event affecting an investment. The canonical user-entered action types are:

- **Contribution:** value entering the household's tracked-investment universe from outside that boundary.
- **Withdrawal/Distribution:** value leaving the household's tracked-investment universe across that boundary.
- **Transfer:** value moving between two investments within the household boundary.
- **Valuation Mark:** an observation of gross value and, where applicable, investment-linked debt as of a date.

Corrections may be implemented through explicit edit history, reversal, or replacement semantics. The precise audit mechanism remains an architecture decision; it must preserve explainability and prevent silent loss of financial history.

## Transfer representation

An internal transfer is one logical action with two linked investment-level movements: an outflow from the source investment and an inflow to the destination investment. The linked movements net to zero when both investments are inside the reporting boundary, including the household's complete tracked-investment universe. For a portfolio or filtered subset containing only one leg, that leg is a boundary-relative inflow or outflow and must participate in the subset's cash-flow and performance calculations. Fees or taxes that cross the reporting boundary, if supported later, are separate external events rather than part of the transfer amount.

## Valuation representation

Every valuation mark has an as-of date and identifies its investment. A mark records enough information to derive:

- gross investment value;
- investment-linked debt; and
- net investment value, which is gross value minus investment-linked debt.

Debt may exceed gross value; negative net investment value is valid. A mark is an observation, not a cash flow.

The policy for multiple marks on the same investment and as-of date remains unresolved. The implementation must choose and document either replacement/versioning or an explicit ordering rule before accepting such records.

## Lifecycle

An investment can be active or closed. Closing stops ordinary forward data entry but does not delete actions, marks, classifications, or historical participation in portfolio calculations. Reopening behavior and deletion policy remain future product decisions.

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

## Time and money conventions to decide

Before persistence is implemented, architecture must define currency representation and rounding, base and multi-currency policy, date/time storage, timezone interpretation, valuation selection between marks, and edit/audit behavior. These decisions affect correctness and should not be implied by UI formatting.
