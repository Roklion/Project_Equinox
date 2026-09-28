# Product specification

## Product intent

Equinox is a personal investment and wealth tracker for desktop and iPhone. It helps a household answer four questions quickly:

1. What are our investments worth now?
2. How is that value allocated?
3. How much capital have we contributed or received?
4. How much of the change came from cash flows versus investment performance?

The experience should feel like a polished consumer product: spacious, direct, and useful at a glance, with deeper detail available through progressive disclosure.

## Users and concepts

The primary user manages investments for a household and may need to distinguish ownership, account and tax structures, liquidity, institutions, and custom groupings.

An **investment** is the leaf-level economic account or holding whose cash flows and value are tracked. A **portfolio** is a dynamic aggregation or saved view over investments; it is not a second financial ledger. See [the data model](data-model.md) for canonical entities and actions.

## Core workflows

- Add and maintain an investment and its classification metadata.
- Record a contribution, withdrawal or distribution, transfer, or dated valuation mark.
- Enter valuation marks efficiently for several investments in a batch.
- Review current gross value, investment-linked debt, and net investment value.
- Explore value and performance over time at investment, group, portfolio, and household levels.
- Group or filter investments by owner, asset class, account type, tax status, liquidity, institution, and custom groups.
- Close an investment without losing its history.

## MVP scope

The MVP focuses on investment and account net asset value, cash flows, performance, composition, and convenient manual data entry. It supports the metrics defined in [metrics](metrics.md) and responsive behavior defined in [the design system](design-system.md).

The MVP does not provide security-level transaction accounting, tax lots, realized-gain tax accounting, trade execution, brokerage connectivity, or tax filing calculations. These exclusions keep the product centered on household investment outcomes rather than brokerage bookkeeping.

## Product requirements

- Every displayed valuation communicates its as-of date.
- Negative net equity is represented accurately rather than clamped to zero.
- Closed investments remain available in historical views and calculations.
- Internal transfers remain visible at the affected investments and contribute zero external cash flow across the household's complete tracked-investment universe. A portfolio containing only one transfer leg treats it as a flow across that portfolio boundary.
- Metrics for groups and portfolios are recomputed from their underlying events and valuations according to [the metric definitions](metrics.md).
- The interface distinguishes investment net value from household net worth; Equinox may initially track only the investment portion needed to compute the former.
- Mobile and desktop may compose the same domain components differently to suit touch and available space.
- Output and visualization surfaces follow the consumer-finance visual direction in [the design system](design-system.md): value-first, calm, spacious, and Monarch-inspired without copying another product's branding or exact screens.
- Value-over-time and composition-over-time are distinct product questions: use a simple value trend for "how much" and a stacked composition view for "what it is made of" across investment/classification groupings.

## Success criteria

An MVP is successful when a user can maintain dated values and cash flows with low friction, understand current investment value and allocation, and distinguish invested capital from performance across useful groupings on both iPhone and desktop.

## Data and privacy boundary

The repository is public. All checked-in examples, fixtures, tests, and screenshots must contain generic investment names and synthetic figures. Real personal financial data and any content copied or derived from a user's private investment spreadsheet are prohibited from repository content.

Local use of a private spreadsheet for a future migration or reconciliation workflow is permitted only when its contents and derived artifacts remain outside the repository.
