# Design system

This document owns Equinox's presentation and interaction contracts. Product behavior is owned by [the product specification](product-spec.md), financial semantics by [the data model](data-model.md) and [metrics](metrics.md), and implementation boundaries by [architecture](architecture.md).

## Experience principles

- **Value first:** lead with current value, as-of date, and the change that matters; place supporting classifications and controls later in the hierarchy.
- **Calm and spacious:** favor readable spacing, restrained color, and clear grouping over dense institutional dashboards.
- **Progressive disclosure:** make common decisions available immediately and reveal calculation detail, history, and metadata on demand.
- **Explainable metrics:** show definitions, periods, and unavailable states close to IRR, MOIC, and performance figures.
- **Responsive composition:** reuse domain components and visual language while allowing mobile and desktop layouts to differ.
- **Fast input:** reduce steps for recurring cash flows and valuation updates, preserve context between entries, and support batch valuation marks.

## Information hierarchy

A primary investment or portfolio view should generally present:

1. the headline current value;
2. the relevant change and its context;
3. the as-of date and selected period;
4. the split between cash-flow and performance effects;
5. a value-history chart;
6. allocation or composition;
7. MOIC and XIRR with their period and context; and
8. underlying investments, actions, and metadata.

Investment name and scope identify the view without competing with its primary value. This sequence is guidance rather than a fixed page template; small screens may distribute it across summary and detail surfaces.

## Visual reference direction

Equinox output and visualization surfaces should take **Monarch Money as a visual reference**, without copying its branding, proprietary layouts, or individual screens. The target is the same class of polished consumer-finance presentation: calm, spacious, value-first, and immediately legible.

Use this reference primarily for **output surfaces** such as dashboards, investment detail, value summaries, history context, and charts. Input workflows should still optimize first for speed, clarity, keyboard use, and touch ergonomics rather than imitating another product's interaction model.

Translate the reference into these Equinox principles:

- make the primary financial value the strongest visual element;
- follow a clear **value → delta/context → as-of date → supporting detail** hierarchy;
- use a light neutral canvas, white/light surfaces, restrained dark-green accents, and generous whitespace;
- prefer subtle borders/elevation and rounded consumer-product surfaces over dense card grids;
- keep chart chrome, axes, and gridlines visually quiet so the data carries the emphasis;
- use subdued categorical colors rather than saturated rainbow palettes;
- preserve the same visual language across desktop and iPhone while allowing composition to change;
- avoid generic admin-dashboard styling, dense institutional-finance terminals, and repeated KPI-card grids.

The exact palette, typography, and icon system may continue to evolve, but new UI work should preserve this visual character unless a concrete usability or accessibility requirement calls for a different treatment.

## Visual language

Semantic CSS tokens in `src/app/globals.css` own color, typography, spacing, radii, elevation and chart series. Extend those shared tokens when changing visual identity.

Color must not carry meaning alone. Positive and negative states need labels, signs, shapes, or patterns as appropriate. Text, controls, focus indicators, and charts should meet WCAG 2.2 AA contrast and interaction expectations.

The shell uses a light neutral canvas, white surfaces, dark green text and accents, system sans-serif body text, and a system serif display face. Semantic CSS custom properties in `src/app/globals.css` own its colors, fonts, spacing, radii, and elevation; no external font request is required. The shell stacks its header below 40rem and includes a keyboard skip link and visible focus.

## Navigation and shared presentation foundation

One primary navigation exposes **Overview** (`/`), **Investments** (`/investments`), **Update Center** (`/updates`), and the existing **Add entry** launcher (`/add`). Desktop presents these horizontally; below 40rem they form a two-column touch-friendly grid. The same links remain available without hover or a sidebar. The current destination is underlined and uses `aria-current`; investment detail and history belong to Investments, batch valuation belongs to Update Center, and entry forms belong to Add. Sign out is a quiet secondary control available throughout the authenticated shell. Sign-in shows neither product navigation nor sign out. Shell edge padding retains installed-PWA safe areas; all navigation and sign-out targets are at least 48px tall.

The Investments foundation lists canonical active and closed records and links to `/investments/[investmentId]`, which shows classification metadata and opens the existing history workflow with that investment selected. Overview and Update Center consume live household analytics and link into existing financial workflows. Overview integrates the reusable value-trend and composition charts, alongside an authoritative current asset-class breakdown. Investment creation remains separate from the financial Add launcher.

`src/components/financial` owns headline values, signed deltas, as-of dates, gross/debt/NAV and cash-flow/performance/P&L breakdowns, MOIC/XIRR, unavailable explanations, valuation age, classification chips, metadata rows, investment rows, surface states, and chart frames. These compose authoritative `MetricResult`, snapshot, and period-change outputs; no financial formulas are calculated in these components. The same exact-money formatter serves existing entry, batch, and history workflows.

Money displays exact cents with two decimal places, USD labels, tabular numerals and retained negative signs. MOIC displays two decimal places and XIRR displays percentages with two decimal places; this formatting never changes the authoritative results. Dates are formatted as calendar dates without local timezone shifts and remain visible at narrow widths. Available zero metrics remain zero; incomplete coverage and unavailable returns use an em dash plus a reason. An optional presentation-only ambiguous state also requires a reason; the current fixed-guess XIRR domain solver does not emit ambiguity. Gross/debt/NAV and performance breakdowns display supplied results without recomputation. Any carried-forward valuation is labeled **Older valuation**, with its supplied age in days and original mark date, rather than inventing a universal freshness cutoff. Current marks are labeled **Current valuation**. Selected-date/value context sits outside the chart in a polite live region. Loading and error surfaces use status/alert semantics; investment rows and metadata stack at phone widths.

Reusable value, delta, date, investment-row, and history components should compose with both the total-value trend and the stacked composition-over-time chart. The trend explains how much value changed; composition explains what makes up that value. Keep their visual roles distinct.

## Investments browse and detail

Investments defaults to active records, with explicit closed-only and combined views. Rows show authoritative NAV, reporting date, effective mark date/age, lifecycle and selected asset-class/institution context. Missing marks remain unavailable. Filters use stable asset-class, account-type, tax-status, liquidity, institution, owner and custom-group IDs; overlapping groups filter rather than create additive segments. Ordering is display name then stable identity. The default browse view waits for the browser-local date before showing financial rows and dated detail links, and synchronizes that date on later default visits. An explicitly selected reporting date bypasses local-today synchronization and remains shown.

Investment detail leads with NAV, selected-period change, reporting date and mark age, followed by financial Add and Manage entry points. Closed records show the close date and historical correction access without ordinary Add. The default performance period is year to date, with editable start/end dates; since-inception P&L and returns are labeled separately. Both use authoritative investment-boundary analytics, including crossing transfer flows. Detail composes the shared chart frame, value/debt breakdown, cash-flow/performance and returns components. Detail renders interactive value and composition charts alongside the actual dated valuation history link. An explicitly selected reporting date controls both financial summaries and chart cutoff; without an explicit date, detail uses the browser-local chart date once available, with the existing UTC fallback until it is shared.

Desktop uses a wider financial column beside ownership/classification disclosure. iPhone stacks these sections and filters, preserving dates and value signs. Metadata filters and ownership detail use native progressive disclosure, keeping the ordinary browse experience focused on values. All seven metadata filters remain discoverable in one disclosure, which opens when a metadata filter is selected. Filter dimensions intersect; GET form submissions retain every selection in the URL across reporting-date changes, refresh, and browser history. Choices come from the full browse snapshot, including closed records; unclassified investments remain visible without a relevant filter. Reset clears metadata/owner/group selections while retaining the reporting date and lifecycle view. Browse/detail navigation retains the selected reporting date. Action/valuation history links pass the investment identity into the existing history/correction surface; detail introduces no parallel mutation UI.

## Charts

Apache ECharts is the charting system. Charts are first-class product surfaces and should follow the Monarch-inspired output language above rather than raw library defaults.

### Chart hierarchy

Use two complementary chart roles:

1. **Primary value trend — line/subtle area chart.** This answers **"How much is this worth over time?"** for a household, portfolio/view, group, or investment. Keep the visual treatment minimal: a clear value series, restrained gridlines, compact time controls, and prominent selected date/value context.
2. **Composition over time — stacked area chart.** This is an Equinox-specific core visualization inspired by the user's existing spreadsheet workflow. It answers **"What is that value made of over time?"** while presenting the result as an app-native consumer visualization rather than an embedded spreadsheet chart.

The stacked composition chart should be able to group the same underlying investment values by useful dimensions such as:

- investment;
- asset class;
- account type;
- owner-set bucket (joint owners remain one segment);
- tax status where useful; and
- liquidity and institution.

Custom groups filter reporting scopes; overlapping membership is never an additive stacking dimension. Additional grouping dimensions should reuse canonical classifications rather than creating chart-specific financial state.

### Chart behavior and styling

- Use a simple line/subtle area chart as the default hero trend instead of making stacked composition the only value view.
- Use stacked area when composition change is the question; avoid a rainbow palette, heavy outlines, dense legends, or spreadsheet-style chart chrome.
- Use soft/subdued categorical fills with sufficient distinction and accessibility; color must not be the only differentiator where identification matters.
- Tooltips for composition should show the selected date, total value, and visible segment values without obscuring the point being inspected.
- Allow hide/show or filtering of segments only when it improves readability; do not add chart controls merely for feature completeness.
- Use purpose-built summary treatments for XIRR and MOIC; a gauge or decorative market-terminal visualization is not required.
- Charts need accessible text summaries and must not be the sole source of essential information.
- When a selected point/date changes, reflect the important date/value context outside the tooltip where the surrounding surface benefits from it.

On desktop, charts support hover and precise pointer inspection. On iPhone, they support touch scrubbing with a stable crosshair or selection marker, appropriately sized targets, and behavior that does not trap ordinary page scrolling. Small screens may simplify legends or move composition details into a drill-down surface rather than compressing unreadable labels.

### Historical chart rendering contract

The shared ValueTrendChart and CompositionChart consume the authoritative historical-series outputs. NAV is the default trend; gross value and investment-linked debt are optional measure controls. Grouping choices are restricted to supplied additive series: investment, asset class, account type, tax status, liquidity, institution, and owner set. Labels and stable bucket keys come from analytics.

Overview and investment-detail chart queries default to the browser's local calendar date, matching valuation entry. An explicit detail reporting date instead controls the cutoff and does not synchronize back to local today. A date-only session cookie conveys this reporting date to fresh server reads; first visits show a loading state until it is available. Revisiting charts updates a changed local date without storing financial values.

Both charts use an elapsed-calendar-time axis and unsmoothed steps between recorded snapshots. Dots identify actual observations; intermediate positions never create a selectable financial point. A single observation is a dot, and an empty range has an explicit message. All, one-year, and three-month ranges filter existing observations relative to the supplied range end, without generating endpoint observations.

Incomplete aggregate points are gaps in every visual series, even when individual buckets are available. The selected summary displays the unavailable total, coverage counts, and a disclosure of each constituent's actual mark date and supplied age. Exact available bucket values remain inspectable below composition; missing valuations never become zero. An absent bucket has no scope members at that date and contributes no area; its detail reads "Not in scope on this date". A bucket's position and color remain stable across range changes, ordered by its canonical key. Each composition series has a numeric endpoint label matching its numbered breakdown entry; these identifiers remain stable across ranges and distinguish buckets when palette colors repeat. Endpoint labels shift vertically to avoid overlap.

The shared categorical palette alternates fresh mint green, tangerine, sky blue, golden yellow, lilac, turquoise, pink, and periwinkle. Chart fills and swatches are intentionally brighter and more playful than the restrained shell accents, with distinct adjacent hues. Each hue has a shared darker ink token for boundaries, observation markers and numbered endpoint text, with at least 4.5:1 contrast against the white chart surface; value-trend strokes also use the ink palette. Composition uses 50% opacity fills with 1.5px boundaries; negative bands use diagonal hatching with a lighter fill, and an authoritative total-NAV overlay uses a 2.5px dashed stroke. Area fills and breakdown swatches use the same bright categorical tokens; strokes and endpoint text use their corresponding ink tokens and stable bucket order. Numbered endpoints and textual breakdowns remain essential when hues repeat.

Composition uses a signed cumulative stack in stable numbered bucket order. Positive values add solid area; negative values subtract downward from the preceding cumulative boundary and use diagonal hatching, including in the selected-date swatch. Negative bands are drawn above solid fills so they remain visible where areas overlap; the overlap is subtractive, not an additional positive holding. A bucket that crosses zero changes treatment at recorded dates without interpolating new observations. When the visible range contains negative segments, a distinct dashed total-NAV line uses the supplied aggregate, and explanatory text describes the signed stack and ordering. Exact signed bucket values and the authoritative aggregate remain available outside the plot. Incomplete totals leave gaps in every band and the total line.

Hover selects the nearest recorded date on desktop. Touch taps and horizontal drags select observations; the plot uses pan-y touch behavior so ordinary vertical scrolling remains available. A dashed crosshair retains the selected observation after pointer exit. A labeled native date selector provides keyboard and non-pointer inspection. All essential dates, values, coverage and segment labels remain outside the SVG. Date selection persists across range/group changes when present; otherwise it selects the latest remaining observation. No tooltip is required to obtain financial information.

The neutral chart frame, as-of labels, exact-money formatting, controls and categorical CSS tokens reuse the shared financial presentation system. Chart headings stay in the surrounding frame rather than the plot renderer. Browser checks exercise the real React components and ECharts renderer with synthetic analytics, including Chromium phone touch emulation; physical iPhone Safari/PWA validation remains a device check.

## Responsive behavior

Desktop can use side-by-side summaries, charts, filters, and tables when width supports them. Mobile should prioritize the headline value and primary action, stack supporting content, use compact drill-down surfaces, and keep important controls within comfortable touch reach. Responsive design may change composition and interaction while preserving the same underlying meaning. The installed iPhone shell respects display safe areas, including the bottom home indicator.

## Input workflows

Investment management is separate from the four financial Add actions. Investments links to **Add investment** at `/investments/new`; investment detail links to **Manage investment** at `/investments/[investmentId]/manage`. Creation and editing use a single-column form on phones, paired classification selectors where desktop width allows, and touch-friendly owner/custom-group checkboxes. Select existing stable lookup records, allow classifications to be cleared, and require at least one owner. Creation does not require an opening valuation or contribution. Ordinary validation failures retain entered values, and pending writes disable submission and metadata controls.

Closing is a separate section of management, with an explicitly entered calendar date and a confirmation explaining that historical actions and valuation marks remain available, activity after the close date stops, and reopening is unsupported. A close date before recorded activity produces a field-level conflict without changing the investment. Closed investments remain visible and their metadata remains editable; management does not expose reopening or deletion. These entry points reuse shared navigation and presentation primitives.

Entry surfaces should default dates and recent selections when safe, accept keyboard and touch input efficiently, validate close to the field, and keep financial signs understandable through language such as contribution and distribution.

The overview's primary Add action opens a dedicated launcher with Contribution, Withdrawal / Distribution, Transfer, and Valuation Mark choices. Each choice has a dedicated route using the same entry form primitives. Forms use a single column on narrow screens and may pair related selectors or money fields on desktop. Controls have at least 44–48 pixel touch height and visible focus; the mobile submit area respects the bottom safe area. The date defaults from the browser's local calendar, remains editable as a date-only value, and drives eligible investment choices. Optional notes and source reference sit behind a disclosure. A successful save shows a confirmation with Add another and Overview exits. A failed save keeps entered values and places errors near the affected fields.

Investment-detail financial launches carry the investment ID and displayed reporting date through the Add launcher and all four forms. Transfer defaults that investment as the source and leaves the destination empty. All actions/Choose another action links retain the launch context. Save confirmation offers an unprefetched return to the originating investment detail, including its original reporting date and period start, even if the entry date or selection changes. Return routes are constructed from known internal destinations. Global Add remains context-free and defaults to the browser calendar date. Ineligible or unknown defaults are cleared with an explanation; server household and lifecycle validation remains authoritative. Closed detail pages retain their historical-correction entry point without ordinary Add.

Transfer entry labels its two investments as “Move value from” and “Move value to” and collects one positive amount. Single-investment valuation entry shows derived net value, prior and latest mark context, and change from the previous mark when available. An existing mark on the selected date changes the submit action to an explicit correction and displays a notice before save. Show the existing mark’s gross value, linked debt, and net value in the valuation preview. Prefill its optional notes and source reference: keeping either value preserves it, changing it updates it, and clearing it removes it. During correction, leaving debt blank preserves the current debt; entering zero explicitly clears it. When creating a new mark, blank debt means zero. Financial values and deltas use exact cents and retain negative signs.

Batch valuation entry should allow a user to choose an as-of date, review a list of relevant investments, enter gross value and linked debt efficiently, see derived NAV before saving, and identify omissions or invalid entries without losing entered values. Untouched blank rows are omitted. Validate all entered rows together and save them atomically; an invalid or conflicting row prevents the whole batch from being written. A same-date mark requires an explicit create or replacement choice, and validation or write failures keep the entered values available for correction.

The batch page lists active investments in stable name order, shows previous or latest net value and same-date marks, and requires an explicit correction choice for a same-date mark. Changing its shared date with entered values asks before clearing them. Investment history is a separate chronological surface available for active and closed investments. It labels valuation observations separately from cash movements and opens a single correction form for a whole transfer. Delete controls confirm the logical entry being removed.

## Component direction

Shared financial presentation lives in `src/components/financial`; form and chart components reuse its formatting, states and accessibility behavior. Extend the existing owner when semantics match. Domain calculations remain outside presentation.

## Open design decisions

- density and interaction model for large investment lists; and
- install and update prompts for the PWA; offline financial-data behavior requires a separate security and product decision.

## Authentication screen

The password-only sign-in screen uses the shell's existing color, type, spacing, focus, and surface tokens. It provides one labeled password field, one primary action, and a generic failure message. The authenticated shell exposes sign out. The flow has no username, account creation, or password recovery controls in the personal MVP.


## Household Overview and valuation maintenance

Overview's reporting scope appears directly below its heading and defaults to **All tracked investments**. One **Choose reporting scope** disclosure in the reporting-date/performance-period form contains native disclosures for owner, custom group, each of the five classification dimensions, and an optional investment set. Each uses labeled checkboxes with 48px row targets; phone layouts stack the dimensions. Multiple selections within a dimension use OR; different dimensions intersect using canonical SnapshotScope semantics. Empty filters impose no restriction. Choices include unused canonical values from Settings, so a configured scope may legitimately contain no investments.

Submitting the form carries stable IDs as repeated query parameters alongside date and performance period. Browser-local date resolution preserves those IDs; chart range, measure and additive grouping controls operate on the same scoped series without changing them. The applied labels stay visible while editing filters; Update overview applies the draft. Reset to All tracked investments retains the reporting date and period. Unavailable/deleted identities remain checked and labeled unavailable until cleared, rather than silently broadening scope. Empty scopes explicitly show zero aggregate totals, unavailable returns and no historical observations.

All headline, coverage, capital/return, period and composition outputs share the selected scope through existing analytics queries. Both chart components remain unchanged; overlapping custom groups are filters only. Underlying investments show four rows initially, with a disclosure for every remaining scope member and dated detail links. The separate Browse all tracked investments link intentionally opens the household browse surface. Scope choices use current canonical associations for all history; see [metrics](metrics.md#snapshot-scopes-and-additive-breakdowns).

Overview leads with **aggregate investment NAV**, selected-period change, reporting date, and explicit valuation coverage across the selected reporting scope, including closed investments. The default scope is the full tracked-investment household. Actual constituent mark dates and ages are available in a disclosure. Incomplete aggregates show no partial numeric headline. Period contributions, distributions, and recorded net external cash flow remain readable when endpoint coverage prevents performance calculation. Year to date (default), last three months, and last year use calendar boundaries, clamping month ends. Period performance and inception capital/returns remain separately labeled and come directly from analytics.

Separate value-trend and composition charts occupy the chart area, using the same explicit reporting cutoff as summary analytics. Their own All/1Y/3M controls inspect recorded history independently of the selected performance-summary period. Current asset-class NAV remains available in a disclosure. Missing observations and single-point series retain the existing chart empty/sparse behavior; no values or allocation percentages are manufactured. Desktop places value/debt beside inception capital/returns. Phones place the chart area ahead of supporting performance/return metrics, then the concise four-investment preview and full-list navigation.

Overview and Update Center resolve today's calendar date in the browser before requesting financial analytics, then carry an explicit editable reporting date in the URL. Initial navigation shows a loading state until that date is supplied; the shared chart-date synchronizer stores only a date-only session cookie, never financial records. Requested historical dates stay authoritative.

Update Center uses a presentation-only reminder policy: **Missing valuation** before all other records; **Stale valuation** after 90 calendar days; **Update due** at 31–90 days; **Recent valuation** at 0–30 days. Within a band, older marks come first, then name and stable identity. This policy uses snapshot-supplied mark age and never alters valuation alignment, financial semantics, or persisted records. Missing coverage is distinct from a recorded zero value. Investments closed on or before the requested date appear in retained-history disclosure without recurring update prompts; earlier requested dates may still show them as eligible for historical valuation entry.

Each maintenance row links to the existing single valuation, history/correction, detail, and management workflows. Batch entry remains the existing atomic batch workflow. Valuation launches pass the investment (single), requested date, and a fixed Update Center origin. Successful saves retain existing confirmations and add a return link to the original reporting context. Client route refresh and an unprefetched return link request fresh dynamic analytics without a full browser reload. Failures retain entered values and existing field-level feedback. All four canonical financial Add actions remain intact; investment creation stays under Investments.

## First-run setup

Authenticated navigation without a household routes to /setup. Setup replaces financial navigation with a single-column household-name and initial-owner form using shared entry spacing, 48px inputs, visible focus, labeled owner controls, and inline errors. Add/remove-last-owner controls permit one or more owners. Pending submission disables the form; errors retain names. Sign out remains available. Success opens Add investment; configured installations visiting setup return to Overview. An unexpected multiple-household state shows explicit recovery text and a retry link without financial workflows or an arbitrary household choice.

## Settings administration

Settings is a secondary shell link beside sign out, leaving the four primary financial destinations intact. `/settings` opens Household & owners; `/settings?section=classifications` opens one coherent surface for the six lookup dimensions. Each dimension uses the same lightly divided, single-column name editor and Add value form, with 48px controls, visible focus and inline validation. Names remain entered after a failed write; a pending write disables all settings editors. Successful writes refresh the household-scoped choices without a browser reload.

Remove opens an inline confirmation explaining that only unused values can be removed and financial history remains intact. A referenced value stays present with guidance to reassign it through Manage investment first; custom groups use the same conservative rule. Add/Edit Investment links to Manage owners and Manage classifications and custom groups. These links carry a validated return path to the original investment form, whose fresh query includes newly created or renamed choices. Leaving the investment form does not save its draft; save existing metadata before navigating if it should be retained. Canonical removal and duplicate-name rules live in [the data model](data-model.md#runtime-administration).
