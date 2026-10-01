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

### Investments browse and detail

Investments defaults to active records, with explicit closed-only and combined views. Rows show authoritative NAV, reporting date, effective mark date/age, lifecycle and selected asset-class/institution context. Missing marks remain unavailable. Filters use stable asset-class, institution, owner and custom-group IDs; overlapping groups filter rather than create additive segments. Ordering is display name then stable identity. The editable reporting date initially uses today's UTC calendar date, always shown explicitly.

Investment detail leads with NAV, selected-period change, reporting date and mark age, followed by financial Add and Manage entry points. Closed records show the close date and historical correction access without ordinary Add. The default performance period is year to date, with editable start/end dates; since-inception P&L and returns are labeled separately. Both use authoritative investment-boundary analytics, including crossing transfer flows. Detail composes the shared chart frame, value/debt breakdown, cash-flow/performance and returns components. Interactive trend rendering belongs to the separate chart ticket; the frame links to actual dated valuation history while awaiting integration.

Desktop uses a wider financial column beside ownership/classification disclosure. iPhone stacks these sections and filters, preserving dates and value signs. Metadata filters and ownership detail use native progressive disclosure, keeping the ordinary browse experience focused on values. Browse/detail navigation retains the selected reporting date. Action/valuation history links pass the investment identity into the existing EPIC 2 history/correction surface; detail introduces no parallel mutation UI.

Apache ECharts is the planned charting system. Charts are first-class product surfaces and should follow the Monarch-inspired output language above rather than raw library defaults.

### Chart hierarchy

Use two complementary chart roles:

1. **Primary value trend — line/subtle area chart.** This answers **"How much is this worth over time?"** for a household, portfolio/view, group, or investment. Keep the visual treatment minimal: a clear value series, restrained gridlines, compact time controls, and prominent selected date/value context.
2. **Composition over time — stacked area chart.** This is an Equinox-specific core visualization inspired by the user's existing spreadsheet workflow. It answers **"What is that value made of over time?"** while presenting the result as an app-native consumer visualization rather than an embedded spreadsheet chart.

The stacked composition chart should be able to group the same underlying investment values by useful dimensions such as:

- investment;
- asset class;
- account type;
- owner;
- tax status where useful; and
- custom group.

Additional grouping dimensions should reuse canonical classifications rather than creating chart-specific financial state.

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

## Responsive behavior

Desktop can use side-by-side summaries, charts, filters, and tables when width supports them. Mobile should prioritize the headline value and primary action, stack supporting content, use compact drill-down surfaces, and keep important controls within comfortable touch reach. Responsive design may change composition and interaction while preserving the same underlying meaning. The installed iPhone shell respects display safe areas, including the bottom home indicator.

## Input workflows

Investment management is separate from the four financial Add actions. Investments links to **Add investment** at `/investments/new`; investment detail links to **Manage investment** at `/investments/[investmentId]/manage`. Creation and editing use a single-column form on phones, paired classification selectors where desktop width allows, and touch-friendly owner/custom-group checkboxes. Select existing stable lookup records, allow classifications to be cleared, and require at least one owner. Creation does not require an opening valuation or contribution. Ordinary validation failures retain entered values, and pending writes disable submission and metadata controls.

Closing is a separate section of management, with an explicitly entered calendar date and a confirmation explaining that historical actions and valuation marks remain available, activity after the close date stops, and reopening is unsupported. A close date before recorded activity produces a field-level conflict without changing the investment. Closed investments remain visible and their metadata remains editable; management does not expose reopening or deletion. These entry points can compose with shared navigation and presentation primitives as those are implemented.

Entry surfaces should default dates and recent selections when safe, accept keyboard and touch input efficiently, validate close to the field, and keep financial signs understandable through language such as contribution and distribution.

The overview's primary Add action opens a dedicated launcher with Contribution, Withdrawal / Distribution, Transfer, and Valuation Mark choices. Each choice has a dedicated route using the same entry form primitives. Forms use a single column on narrow screens and may pair related selectors or money fields on desktop. Controls have at least 44–48 pixel touch height and visible focus; the mobile submit area respects the bottom safe area. The date defaults from the browser's local calendar, remains editable as a date-only value, and drives eligible investment choices. Optional notes and source reference sit behind a disclosure. A successful save shows a confirmation with Add another and Overview exits. A failed save keeps entered values and places errors near the affected fields.

Transfer entry labels its two investments as “Move value from” and “Move value to” and collects one positive amount. Single-investment valuation entry shows derived net value, prior and latest mark context, and change from the previous mark when available. An existing mark on the selected date changes the submit action to an explicit correction and displays a notice before save. Show the existing mark’s gross value, linked debt, and net value in the valuation preview. Prefill its optional notes and source reference: keeping either value preserves it, changing it updates it, and clearing it removes it. During correction, leaving debt blank preserves the current debt; entering zero explicitly clears it. When creating a new mark, blank debt means zero. Financial values and deltas use exact cents and retain negative signs.

Batch valuation entry should allow a user to choose an as-of date, review a list of relevant investments, enter gross value and linked debt efficiently, see derived NAV before saving, and identify omissions or invalid entries without losing entered values. Untouched blank rows are omitted. Validate all entered rows together and save them atomically; an invalid or conflicting row prevents the whole batch from being written. A same-date mark requires an explicit create or replacement choice, and validation or write failures keep the entered values available for correction.

The batch page lists active investments in stable name order, shows previous or latest net value and same-date marks, and requires an explicit correction choice for a same-date mark. Changing its shared date with entered values asks before clearing them. Investment history is a separate chronological surface available for active and closed investments. It labels valuation observations separately from cash movements and opens a single correction form for a whole transfer. Delete controls confirm the logical entry being removed.

## Component direction

Likely reusable components include value summaries, metric cards, as-of labels, delta breakdowns, classification chips, chart frames, action-entry fields, investment rows, empty states, and unavailable metric explanations. Components should encode stable presentation and accessibility behavior; domain calculations remain outside the component layer.

## Open design decisions

- visual identity, palette, typography, and icon system;
- chart behavior for sparse or irregular valuation marks;
- density and interaction model for large investment lists; and
- install and update prompts for the PWA; offline financial-data behavior requires a separate security and product decision.

## Authentication screen

The password-only sign-in screen uses the shell's existing color, type, spacing, focus, and surface tokens. It provides one labeled password field, one primary action, and a generic failure message. The authenticated shell exposes sign out. The flow has no username, account creation, or password recovery controls in the personal MVP.
