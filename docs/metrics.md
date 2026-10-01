# Metrics

This document is the canonical definition of Equinox's financial measures. The actions and valuation fields referenced here are defined in [the data model](data-model.md).

## Value measures

For an investment at an as-of date:

- **Gross value** is the asset value in the selected valuation mark before investment-linked debt.
- **Investment debt** is debt directly linked to that investment.
- **Net investment value (NAV)** = gross value - investment debt.

Negative NAV is valid. A snapshot at calendar date D selects each investment's latest persisted mark with as-of date <= D. Never use a future mark or interpolate. Carry-forward is allowed, including for closed investments; closing does not synthesize a zero valuation. Preserve the actual mark date and derive age in calendar days relative to D. Values shown for any investment or aggregate must communicate the requested effective date and make constituent mark dates available.

A selected investment with no qualifying mark has missing valuation coverage, not zero value. The aggregate is incomplete and has no numeric totals if any selected investment lacks a mark. Consumers can inspect available constituents but must not present their subtotal as the complete scope value. An empty selection is complete with zero totals and selectedCount = 0.

**Household net worth** is a broader concept: all household assets minus all household liabilities. Equinox's investment NAV can contribute to household net worth, but the two terms are not interchangeable. Unless non-investment assets and liabilities are modeled, the product must not label aggregate investment NAV as household net worth.

## Cash-flow measures

Use the selected reporting boundary to classify external cash flow. For household reporting, that boundary is the complete universe of tracked investments rather than all assets and liabilities the household owns. A movement from untracked household cash into a tracked investment is therefore a contribution to the tracked-investment universe.

- **Contributions** are positive amounts supplied from outside the household's tracked-investment reporting boundary.
- **Distributions** are positive amounts leaving the household's tracked-investment reporting boundary. Withdrawals and distributions share this metric treatment in the MVP.
- **Net invested capital** = cumulative contributions - cumulative distributions.

Internal transfers are visible as investment-level movements but net to zero at the household or any aggregate containing both sides. When a selected portfolio contains only the source, its transfer leg is a boundary-relative outflow; when it contains only the destination, its leg is a boundary-relative inflow. Those boundary-relative flows enter that portfolio's contributions or distributions, P&L, MOIC, and XIRR inputs as applicable. The paired transfer remains zero across the complete household tracked-investment boundary. Valuation marks never enter cash-flow totals.

## Profit and multiple

For a period from startDate through endDate, beginning NAV is the snapshot at startDate and ending NAV is the snapshot at endDate. Period cash flows satisfy startDate < effectiveDate <= endDate. The same convention applies to P&L, NAV changes, and external-flow/performance decomposition. A same-day period contains no flows; a reversed range is invalid. Missing required endpoint valuation coverage makes the dependent metric incomplete.

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

XIRR can be undefined or ambiguous when cash flows, including the signed terminal NAV, do not contain a sign change or yield multiple roots. Use a deterministic bounded root search and robust bracketed solver in TypeScript/Node, rather than Newton-Raphson alone. No-root and multiple-root cases return explicit unavailable reasons. The implemented bounds and numerical tolerances are specified below. Display rounding belongs to presentation; do not arbitrarily select a root from an ambiguous result.

## Time-weighted return

Time-weighted return (TWR) is outside the current Equinox design and EPIC 3 MVP. Do not implement TWR or approximations. EPIC 3 return analytics use XIRR / money-weighted return.

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
- Recompute ratios and returns from aggregated inputs. Do not average child MOIC or XIRR values.
- Respect the selected reporting boundary when determining whether a transfer is internal.
- Retain closed investments when their history falls within the requested period.
- Expose unavailable results explicitly when inputs cannot support a valid calculation.

## Precision and currency

MVP financial inputs and stored monetary values are USD with exact cent precision; binary floating point must not be used to store money. Additive calculations retain bigint cents from exact decimal inputs through all sums and differences, including totals beyond a single stored column's capacity. Never convert money to binary floating point for summation. Ratios and return solvers may use floating point after exact inputs are normalized; the implemented numerical tolerances are specified in [the return policy](#inception-return-query-and-numerical-policy), while display rounding belongs to presentation. Snapshot outputs expose bigint cents; an HTTP/JSON adapter must encode cents as exact decimal integer strings because JSON does not serialize bigint. Financial dates are daily calendar dates, independent of operational timestamps. See [architecture](architecture.md#data-integrity) for storage conventions.

Multi-currency support and foreign exchange are outside the MVP. Metric labels and examples must not imply that values in different currencies can be safely summed.

## Shared reporting-boundary contracts

Classify one logical transfer against the selected investment-ID set using the domain function classifyTransfer:

| Included investments | Classification | External effect |
| --- | --- | --- |
| Source and destination | internal | Zero |
| Destination only | contribution | Inflow |
| Source only | distribution | Outflow |
| Neither | excluded | None |

P&L, MOIC, XIRR, and delta attribution must consume this classification rather than each implementing transfer-boundary logic. Valuation marks never enter this classification or cash-flow inputs. Period consumers use isInPeriod for the start-exclusive/end-inclusive convention above.

## Snapshot scopes and additive breakdowns

The application snapshot query accepts a household, requested calendar date, and optional investment-ID, owner-ID, custom-group-ID, and classification-ID filters. Values within a filter are OR matches; different filters intersect (AND). An absent filter imposes no restriction; an empty supplied filter matches nothing. Owner filters match any associated owner and include each matching investment once. Classifications and memberships use their current canonical identities/labels, including for historical snapshots; classification history is not modeled.

Additive breakdowns support investment, asset class, account type, tax status, liquidity, institution, and owner-set. Each selected investment contributes to exactly one bucket per dimension. Classification buckets use stable IDs, not labels; missing classifications use an explicit Unclassified bucket. Renaming a label does not change bucket identity.

For ownership, sort stable owner IDs to form one deterministic owner-set bucket; display the associated names in that same order (for example Owner A + Owner B). Joint investments appear once, with no invented percentages and no duplicate full value in each owner's bucket. Ownership percentages are not modeled.

Custom groups may overlap and select scopes by membership. Matching several groups still includes an investment once. Custom groups are not an additive breakdown dimension: separate overlapping group totals must not be presented as composition segments expected to sum to the household. Such a breakdown requires a future exclusivity/allocation model.

Each bucket follows the same coverage rules as the aggregate. A bucket with missing marks is incomplete, while fully valued buckets may retain available totals. For complete snapshots, every supported additive breakdown reconciles gross value, debt, and NAV to the aggregate.

## Presentation-neutral result states

The shared MetricResult<T> contract is defined in src/domain/analytics/contracts.ts:

| Status | Payload | Meaning |
| --- | --- | --- |
| available | value | Valid result; zero and negative values remain ordinary values |
| incomplete | reason: missing_valuation, missingInvestmentIds | Required valuation coverage is absent; no numeric result |
| unavailable | reason: zero_contributions | MOIC denominator is zero |
| unavailable | reason: no_sign_change | XIRR inputs lack opposite signs |
| unavailable | reason: no_root | No supported root found by the bounded solver |
| unavailable | reason: multiple_roots | XIRR is ambiguous |

Snapshot, cash-flow, and return queries share these result states. Never encode an unavailable result as zero, infinity, NaN, or an unexplained null.

The authoritative calculateSnapshot path returns requested asOfDate, constituent investment metadata and valuation results, complete/incomplete totals, and coverage (selectedCount, valuedCount, missingInvestmentIds). Available constituents include markId, markAsOfDate, ageDays, grossValueCents, debtCents, and navCents. Staleness is derived at query time and never persisted.

## Cash-flow and change query outputs

`classifyCashFlows` in `src/domain/analytics/cash-flow.ts` converts complete canonical logical actions into dated boundary-relative contributions/distributions using the shared `classifyTransfer` contract. Both transfer legs must be supplied before scope selection. Incomplete action shapes or disagreeing amounts fail rather than yielding partial totals. Canonical reads must include all actions and complete linked movements through the requested end/as-of date; repository failures reject the query instead of returning numeric results.

The application `period` query returns beginning/ending snapshots, dated flows, exact cash-flow totals, and a `MetricResult<PeriodChange>`. Available change results include beginning NAV, ending NAV, NAV change, net external cash flow, investment performance effect, and P&L (equal to the performance effect). Incomplete change results contain no numeric value and identify the union of investments missing either endpoint; each snapshot retains its own coverage metadata. Cash-flow totals remain available independently of valuation coverage. An empty scope returns zero totals; a same-day period has zero flows and, when valued, zero change.

The `inception` query includes all recorded actions with effectiveDate <= asOfDate. It returns cumulative contributions/distributions, net invested capital, the as-of snapshot, and a separate P&L result. Inception P&L assumes a zero opening NAV and complete recorded capital history; it cannot reconstruct capital omitted from canonical records. Missing ending marks leave cumulative capital totals available but P&L incomplete. Closed investments are retained; closure alone never substitutes a terminal zero mark. Partial realization, distributions exceeding contributions, and negative NAV remain ordinary exact-cent results.

The returns query reuses these dated flows for MOIC/XIRR. Cash-flow calculations and persistence do not format money or store mutable aggregate results.

## Inception return query and numerical policy

The application `returns(householdId, asOfDate, scope)` query reads fresh canonical sources and delegates to `calculateReturns` in `src/domain/analytics/returns.ts`. It reuses `calculateInception` for scope selection, complete logical-action classification, cumulative totals, and the terminal snapshot. The output retains those exact-cent inputs and valuation dates alongside separate `moic` and `xirr` results. Missing terminal valuation coverage makes both returns incomplete, even when capital totals are available. Zero contributions with complete coverage makes MOIC unavailable. Empty scopes have unavailable returns.

MOIC adds signed aggregate NAV and cumulative distributions in bigint cents, then divides by aggregate contributions as a floating-point ratio. Negative multiples are valid. XIRR signs the boundary-relative dated flows from the investor perspective and appends signed aggregate NAV on the requested measurement date, including when the selected terminal marks are older. Same-date cash flows and terminal NAV are netted exactly in bigint cents; zero date totals are removed before solver normalization. Both signs on distinct dates are required. A zero stream or a stream confined to one date has no identifiable annualized return (`no_sign_change`).

`solveXirr` in `src/domain/analytics/xirr.ts` normalizes the exact dated totals by their largest absolute amount and solves in log-rate space `x = log(1 + r)`, using actual UTC calendar-day differences divided by 365. The supported rate domain is inclusive `-0.9999 <= r <= 1,000,000` (rates are fractions, from -99.99% to 100,000,000%). Rates at or below -100% are unsupported. A stream whose only roots lie outside this domain yields `no_root`.

The bounded search isolates stationary points recursively: factor out the earliest positive exponential, differentiate the remaining exponential polynomial (removing one term), and find its derivative roots. These points partition the domain into monotone intervals. Every sign-change interval is solved by bisection, rather than relying on an initial guess or fixed grid. This detects closely spaced crossing roots and also checks stationary points for repeated roots. Same-sign coefficient sequences terminate the recursion immediately.

Bisection stops at a log-rate bracket width of `1e-12` (at most 64 iterations). Evaluations scale by the largest absolute discounted term, use compensated summation, and divide by the sum of absolute discounted terms to avoid overflow. Endpoints and stationary points with relative NPV residual at most `1e-12` count as numerical root candidates. Candidates within `1e-9` in log-rate space are treated as one numerically indistinguishable root. This is finite-precision identification, not symbolic proof: nearly tangent roots closer than the tolerances cannot be distinguished. No candidate yields `no_root`; multiple distinct candidates yield `multiple_roots`; one yields an unrounded finite annualized rate. All outcomes are deterministic.

Returns are inception-to-date from complete recorded capital history, with no persisted or cached source-of-truth fields. Corrections or deletions of actions and marks change the next calculation naturally. The same query supports the existing owner, classification, investment and custom-group filters and retains closed investments. It never averages child rates or multiples.

Regression tests include hand-checkable annual and leap-year cases, multiple contributions, partial/closed realization, transfer boundaries, missing marks, negative NAV, close and repeated roots, bounded no-root cases, and [Microsoft's published irregular-date XIRR example](https://support.microsoft.com/en-us/excel/functions/xirr-function). No UI percentage rounding or TWR calculation is introduced.

## Historical value and composition queries

The application exposes `valueSeries(householdId, startDate, endDate, scope)` and `compositionSeries(householdId, startDate, endDate, groupBy, scope)`. Both read canonical snapshot sources once through `endDate`, retaining older marks for carry-forward. Domain calculations live in `src/domain/analytics/series.ts` and reuse `calculateSnapshot` and `groupSnapshot`. Every point exposes all three exact-cent measures (`grossValueCents`, `debtCents`, `navCents`); callers choose the measure to render without financial recomputation.

Historical sampling uses the sorted, deduplicated union of persisted valuation dates for investments selected by the existing snapshot scope. The date range is inclusive: `startDate <= observationDate <= endDate`. An observation shared by several investments creates one point. Unselected investments' dates never create points. Marks before `startDate` remain available for valuation alignment at later observations; future marks never participate. There is no interpolation, daily resampling, or synthetic endpoint. A same-day range returns that day's observation if present. A range with no selected observations, including an empty scope, returns `points: []`; this means no observations in the range, not a zero-valued portfolio. Call the snapshot query separately when a boundary value is needed.

Value points are full snapshot outputs, including `asOfDate`, totals, coverage and constituents with actual mark dates and age in calendar days. Missing coverage leaves the point incomplete, with no numeric aggregate subtotal. Closed investments remain selected and older marks carry forward according to the same policy as headline snapshots.

Composition points extend those same snapshots with `breakdown` and the response identifies `groupBy`. Supported dimensions are investment, asset class, account type, tax status, liquidity, institution and owner-set. Each complete point's segment gross value, debt and NAV sum exactly to that point's aggregate totals. Incomplete buckets retain their coverage; complete buckets can be inspected without implying a complete aggregate. Joint owners form one deterministic owner-set bucket. Current canonical classification and membership metadata applies to all historical points; historical classification changes are not modeled.

Overlapping custom groups remain scope filters, and each matching investment participates once. Unsupported additive dimensions (including custom groups) are rejected; application composition queries report `invalid_grouping` before accessing persistence. Invalid dates and reversed ranges report `invalid_date`.

For range cash-flow and performance context, callers use the existing `period` query and its authoritative start-exclusive/end-inclusive flows and endpoint snapshots. Those endpoints need not be valuation observation dates and do not create additional historical series points. MOIC/XIRR remain available through the separate inception return query. Series contain no formatting, chart configuration, persisted aggregates or cached source-of-truth values; corrections and deletions naturally change the next result.

## Canonical analytics regression ledger

The compact fixture in `src/domain/analytics/testing/canonical-fixture.ts` contains invented USD amounts only. It is independent of the larger demo seed. Measurements run from 2021-01-01 through 2023-01-01, two exact 365-day years; the intermediate date is 2022-01-01. Every investment has an opening mark equal to its initial contributed NAV. Opening contributions therefore belong to inception totals but are excluded from period flows.

| Example | Recorded capital history | Ending gross / debt / NAV (USD) | Inception P&L (USD) | MOIC | XIRR |
| --- | --- | --- | --- | --- | --- |
| Active | 100 contributed at opening | 121 / 0 / 121 | 21 | 1.21 | 10% |
| Fully realized, closed | 200 contributed at opening; 288 distributed at end | 0 / 0 / 0 | 88 | 1.44 | 20% |
| Partially realized | 100 contributed at opening; 100 contributed and 22 distributed after one year | 206.80 / 0 / 206.80 | 28.80 | 1.144 | 10% |
| Leveraged | 300 contributed at opening | 400 / 100 / 300 | 0 | 1 | 0% |
| Negative equity | 50 contributed at opening | 20 / 40 / -20 | -70 | -0.4 | Unavailable: no sign change |

The annual checks are `100 × 1.1² = 121`, `200 × 1.2² = 288`, and `100 × 1.1² + (100 - 22) × 1.1 = 206.80`. The leveraged example's latest mark is at the intermediate date, carried forward by 365 days at the endpoint. The active and partial examples share one joint owner-set bucket; the active example belongs to two overlapping custom groups and is selected once by their union.

Household totals are gross 747.80, debt 140, NAV 607.80, inception contributions 850, distributions 310, net invested capital 540, and P&L 67.80. Beginning NAV is 750; period contributions are 100 and distributions 310, so `-142.20 NAV change = -210 net external flow + 67.80 performance`. Inception MOIC is `917.80 / 850`. For the active-plus-realized scope, MOIC is `409 / 300` and XIRR is `sqrt(409 / 300) - 1`; these differ from arithmetic child averages and the contribution-weighted child rate.

A separate transfer ledger starts with 100 contributed to a source, transfers 40 after one year, and ends with source NAV 60 and destination NAV 40. Household period flow is zero; source-only period flow is -40 and destination-only flow is +40. All three scopes have zero P&L, MOIC 1 and XIRR 0%. This protects one shared transfer classification across return and change calculations.

Focused variants preserve explicit missing coverage (a future-only mark), zero-contribution MOIC, XIRR without a sign change, a root outside the supported domain, and ambiguity: `-100 + 230/(1+r) - 132/(1+r)²` has roots 10% and 20%. Complete historical composition reconciles all three monetary measures with headline snapshots across every supported additive dimension. Incomplete points retain coverage without exposing a partial numeric total. Corrections are checked through application queries and the canonical PostgreSQL read adapter, including removal of a closed investment's zero terminal mark. TWR remains excluded.
