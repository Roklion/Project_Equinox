# Metrics

This document is the canonical definition of Equinox's financial measures. The actions and valuation fields referenced here are defined in [the data model](data-model.md).

## Value measures

For an investment at an as-of date:

- **Gross value** is the asset value in the selected valuation mark before investment-linked debt.
- **Investment debt** is debt directly linked to that investment.
- **Net investment value (NAV)** = gross value - investment debt.

Negative NAV is valid. Values shown for any investment or aggregate must communicate the effective as-of date. The rule for aligning investments with different mark dates must be chosen before implementation.

**Household net worth** is a broader concept: all household assets minus all household liabilities. Equinox's investment NAV can contribute to household net worth, but the two terms are not interchangeable. Unless non-investment assets and liabilities are modeled, the product must not label aggregate investment NAV as household net worth.

## Cash-flow measures

Use the selected reporting boundary to classify external cash flow. For household reporting, that boundary is the complete universe of tracked investments rather than all assets and liabilities the household owns. A movement from untracked household cash into a tracked investment is therefore a contribution to the tracked-investment universe.

- **Contributions** are positive amounts supplied from outside the household's tracked-investment reporting boundary.
- **Distributions** are positive amounts leaving the household's tracked-investment reporting boundary. Withdrawals and distributions share this metric treatment in the MVP.
- **Net invested capital** = cumulative contributions - cumulative distributions.

Internal transfers are visible as investment-level movements but net to zero at the household or any aggregate containing both sides. When a selected portfolio contains only the source, its transfer leg is a boundary-relative outflow; when it contains only the destination, its leg is a boundary-relative inflow. Those boundary-relative flows enter that portfolio's contributions or distributions, P&L, MOIC, and XIRR inputs as applicable. The paired transfer remains zero across the complete household tracked-investment boundary. Valuation marks never enter cash-flow totals.

## Profit and multiple

For a period ending at a selected as-of date:

- **P&L** = ending NAV + distributions during the period - contributions during the period - beginning NAV.
- **Inception-to-date P&L**, where beginning NAV is zero, = current NAV + cumulative distributions - cumulative contributions.
- **MOIC** = (current NAV + cumulative distributions) / cumulative contributions.

MOIC is undefined when cumulative contributions are zero; the interface should show an unavailable state rather than infinity or zero. The initial definition is inception-to-date. Period-specific MOIC and treatment of unusual negative contribution histories require explicit decisions before support.

## Money-weighted return (XIRR)

XIRR is the annualized discount rate `r` that makes the net present value of dated investor-perspective cash flows zero:

```text
sum(C_i / (1 + r)^((date_i - date_0) / 365)) = 0
```

Use these investor-perspective signs:

- contributions are negative;
- distributions are positive; and
- the signed ending NAV is the terminal entry on the measurement date. It may be negative when investment-linked debt exceeds gross value.

For a portfolio, combine all qualifying dated cash flows from included investments, cancel transfers only when both legs are inside the portfolio boundary, include a boundary-relative inflow or outflow when only one leg is inside, append aggregate ending NAV, and solve once. Never average or value-weight investment-level IRRs.

XIRR can be undefined or ambiguous when cash flows, including the signed terminal NAV, do not contain a sign change or yield multiple roots. Solver choice, convergence bounds, multiple-root policy, and user-facing unavailable states must be specified during implementation.

## Time-weighted return

Time-weighted return (TWR) is optional and outside the initial MVP. If added, it should chain subperiod returns divided at external cash flows and use a documented policy for valuations at flow boundaries. TWR should remain distinct from XIRR: it answers how the investment performed independent of the size and timing of investor cash flows.

## Change decomposition

For a period:

```text
change in NAV = net external cash flow + investment performance effect
```

where:

```text
net external cash flow = contributions - distributions
investment performance effect = ending NAV - beginning NAV - net external cash flow
```

Internal transfers cancel when both sides fall inside the reporting boundary. A transfer with only one leg inside the boundary contributes to that selection's net flow, preventing the movement from being misclassified as investment performance. This decomposition should be presented alongside value deltas so users can distinguish added or removed capital from investment results.

## Aggregation rules

- Sum additive measures such as gross value, debt, NAV, contributions, distributions, net invested capital, and P&L over the selected underlying records.
- Recompute ratios and returns from aggregated inputs. Do not average child MOIC, XIRR, or future TWR values.
- Respect the selected reporting boundary when determining whether a transfer is internal.
- Retain closed investments when their history falls within the requested period.
- Expose unavailable results explicitly when inputs cannot support a valid calculation.

## Precision and currency

MVP financial inputs and stored monetary values are USD with exact cent precision; binary floating point must not be used to store money. Calculated-metric precision and display rounding remain decisions for the metric implementations. Financial dates are daily calendar dates, independent of operational timestamps. See [architecture](architecture.md#data-integrity) for storage conventions.

Multi-currency support and foreign exchange are outside the MVP. Metric labels and examples must not imply that values in different currencies can be safely summed.
