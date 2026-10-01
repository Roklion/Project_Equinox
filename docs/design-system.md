# Design system

This document defines Equinox's initial interface and interaction direction. Product behavior is owned by [the product specification](product-spec.md), financial semantics by [the data model](data-model.md) and [metrics](metrics.md), and implementation boundaries by [architecture](architecture.md).

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

Use semantic design tokens for color, typography, spacing, radii, elevation, and chart series. The specific palette and typeface remain open until visual exploration and accessibility testing.

Color must not carry meaning alone. Positive and negative states need labels, signs, shapes, or patterns as appropriate. Text, controls, focus indicators, and charts should meet WCAG 2.2 AA contrast and interaction expectations.

The shell uses a light neutral canvas, white surfaces, dark green text and accents, system sans-serif body text, and a system serif display face. Semantic CSS custom properties in `src/app/globals.css` own its colors, fonts, spacing, radii, and elevation; no external font request is required. The shell stacks its header below 40rem and includes a keyboard skip link and visible focus.

## Navigation and shared presentation foundation

One primary navigation exposes **Overview** (`/`), **Investments** (`/investments`), **Update Center** (`/updates`), and the existing **Add entry** launcher (`/add`). Desktop presents these horizontally; below 40rem they form a two-column touch-friendly grid. The same links remain available without hover or a sidebar. The current destination is underlined and uses `aria-current`; investment detail and history belong to Investments, batch valuation belongs to Update Center, and entry forms belong to Add. Sign out is a quiet secondary control available throughout the authenticated shell. Sign-in shows neither product navigation nor sign out. Shell edge padding retains installed-PWA safe areas; all navigation and sign-out targets are at least 48px tall.

The Investments foundation lists canonical active and closed records and links to `/investments/[investmentId]`, which shows classification metadata and opens the existing history workflow with that investment selected. Update Center links to existing batch valuation and history/correction workflows. These are route foundations: complete financial summaries, lifecycle management, update guidance, and charts belong to the following EPIC 4 tickets. Placeholders state that boundary explicitly and never invent live financial values. Investment creation remains separate from the financial Add launcher.

`src/components/financial` owns headline values, signed deltas, as-of dates, gross/debt/NAV and cash-flow/performance/P&L breakdowns, MOIC/XIRR, unavailable explanations, valuation age, classification chips, metadata rows, investment rows, surface states, and chart frames. These compose authoritative `MetricResult`, snapshot, and period-change outputs; no financial formulas are calculated in these components. The same exact-money formatter serves existing entry, batch, and history workflows.

Money uses exact bigint cents, USD labels, tabular numerals and retained negative signs. Dates are formatted as calendar dates without local timezone shifts and remain visible at narrow widths. Available zero metrics remain zero; incomplete coverage and unavailable returns use an em dash plus a reason. An optional presentation-only ambiguous state also requires a reason; the current fixed-guess XIRR domain solver does not emit ambiguity. Gross/debt/NAV and performance breakdowns display supplied results without recomputation. Any carried-forward valuation is labeled **Older valuation**, with its supplied age in days and original mark date, rather than inventing a universal freshness cutoff. Current marks are labeled **Current valuation**. Selected-date/value context sits outside the chart in a polite live region. Loading and error surfaces use status/alert semantics; investment rows and metadata stack at phone widths.

Financial values use tabular numerals where available, an explicit currency, consistent precision within a view, and a real unavailable state such as an em dash. Negative values retain their sign. Every current-value context includes an as-of date.

For financial output surfaces, use Monarch Money as a consumer-finance hierarchy reference without copying its branding or exact screens: lead with the financial value, then its delta or context, then the as-of date, followed by supporting details and controls. Apply this to post-save summaries, previous-value context, investment rows, and history. Entry forms use the same visual language while keeping interaction optimized for fast, clear input.

Reusable value, delta, date, investment-row, and history components should compose with both the total-value trend and the stacked composition-over-time chart. The trend explains how much value changed; composition explains what makes up that value. Keep their visual roles distinct.

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

Overview and investment-detail chart queries end on the browser's local calendar date, matching valuation entry. A date-only session cookie conveys this reporting date to fresh server reads; first visits show a loading state until it is available. Revisiting charts updates a changed local date without storing financial values.

Both charts use an elapsed-calendar-time axis and unsmoothed steps between recorded snapshots. Dots identify actual observations; intermediate positions never create a selectable financial point. A single observation is a dot, and an empty range has an explicit message. All, one-year, and three-month ranges filter existing observations relative to the supplied range end, without generating endpoint observations.

Incomplete aggregate points are gaps in every visual series, even when individual buckets are available. The selected summary displays the unavailable total, coverage counts, and a disclosure of each constituent's actual mark date and supplied age. Exact available bucket values remain inspectable below composition; missing valuations never become zero. An absent bucket has no scope members at that date and contributes no area; its detail reads "Not in scope on this date". A bucket's position and color remain stable across range changes, ordered by its canonical key. Each composition series has a numeric endpoint label matching its numbered breakdown entry; these identifiers remain stable across ranges and distinguish buckets when palette colors repeat. Endpoint labels shift vertically to avoid overlap.

Composition uses stacked NAV areas only when the visible range has no negative segments. If any supplied segment is negative, the entire visible range uses separate step lines and an explicit explanation. This avoids implying that separate positive/negative stacks form one total boundary. Negative values and the supplied aggregate remain exact in the selected-date summary and labeled segment breakdown.

Hover selects the nearest recorded date on desktop. Touch taps and horizontal drags select observations; the plot uses pan-y touch behavior so ordinary vertical scrolling remains available. A dashed crosshair retains the selected observation after pointer exit. A labeled native date selector provides keyboard and non-pointer inspection. All essential dates, values, coverage and segment labels remain outside the SVG. Date selection persists across range/group changes when present; otherwise it selects the latest remaining observation. No tooltip is required to obtain financial information.

The neutral chart frame, as-of labels, exact-money formatting, controls and categorical CSS tokens reuse the shared financial presentation system. Chart headings stay in the surrounding frame rather than the plot renderer. Browser checks exercise the real React components and ECharts renderer with synthetic analytics, including Chromium phone touch emulation; physical iPhone Safari/PWA validation remains a device check.

## Responsive behavior

Desktop can use side-by-side summaries, charts, filters, and tables when width supports them. Mobile should prioritize the headline value and primary action, stack supporting content, use compact drill-down surfaces, and keep important controls within comfortable touch reach. Responsive design may change composition and interaction while preserving the same underlying meaning. The installed iPhone shell respects display safe areas, including the bottom home indicator.

## Input workflows

Entry surfaces should default dates and recent selections when safe, accept keyboard and touch input efficiently, validate close to the field, and keep financial signs understandable through language such as contribution and distribution.

The overview's primary Add action opens a dedicated launcher with Contribution, Withdrawal / Distribution, Transfer, and Valuation Mark choices. Each choice has a dedicated route using the same entry form primitives. Forms use a single column on narrow screens and may pair related selectors or money fields on desktop. Controls have at least 44–48 pixel touch height and visible focus; the mobile submit area respects the bottom safe area. The date defaults from the browser's local calendar, remains editable as a date-only value, and drives eligible investment choices. Optional notes and source reference sit behind a disclosure. A successful save shows a confirmation with Add another and Overview exits. A failed save keeps entered values and places errors near the affected fields.

Transfer entry labels its two investments as “Move value from” and “Move value to” and collects one positive amount. Single-investment valuation entry shows derived net value, prior and latest mark context, and change from the previous mark when available. An existing mark on the selected date changes the submit action to an explicit correction and displays a notice before save. Show the existing mark’s gross value, linked debt, and net value in the valuation preview. Prefill its optional notes and source reference: keeping either value preserves it, changing it updates it, and clearing it removes it. During correction, leaving debt blank preserves the current debt; entering zero explicitly clears it. When creating a new mark, blank debt means zero. Financial values and deltas use exact cents and retain negative signs.

Batch valuation entry should allow a user to choose an as-of date, review a list of relevant investments, enter gross value and linked debt efficiently, see derived NAV before saving, and identify omissions or invalid entries without losing entered values. Untouched blank rows are omitted. Validate all entered rows together and save them atomically; an invalid or conflicting row prevents the whole batch from being written. A same-date mark requires an explicit create or replacement choice, and validation or write failures keep the entered values available for correction.

The batch page lists active investments in stable name order, shows previous or latest net value and same-date marks, and requires an explicit correction choice for a same-date mark. Changing its shared date with entered values asks before clearing them. Investment history is a separate chronological surface available for active and closed investments. It labels valuation observations separately from cash movements and opens a single correction form for a whole transfer. Delete controls confirm the logical entry being removed.

## Component direction

Likely reusable components include value summaries, metric cards, as-of labels, delta breakdowns, classification chips, chart frames, action-entry fields, investment rows, empty states, and unavailable metric explanations. Components should encode stable presentation and accessibility behavior; domain calculations remain outside the component layer.

## Open design decisions

- visual identity, palette, typography, and icon system;
- density and interaction model for large investment lists; and
- install and update prompts for the PWA; offline financial-data behavior requires a separate security and product decision.

## Authentication screen

The password-only sign-in screen uses the shell's existing color, type, spacing, focus, and surface tokens. It provides one labeled password field, one primary action, and a generic failure message. The authenticated shell exposes sign out. The flow has no username, account creation, or password recovery controls in the personal MVP.
