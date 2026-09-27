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

1. name, scope, and as-of date;
2. current NAV and period change;
3. the split between cash-flow and performance effects;
4. a value-history chart;
5. allocation or composition;
6. MOIC and XIRR with their period and context; and
7. underlying investments, actions, and metadata.

This sequence is guidance rather than a fixed page template. Small screens may distribute it across summary and detail surfaces.

## Visual language

Use semantic design tokens for color, typography, spacing, radii, elevation, and chart series. The specific palette and typeface remain open until visual exploration and accessibility testing.

Color must not carry meaning alone. Positive and negative states need labels, signs, shapes, or patterns as appropriate. Text, controls, focus indicators, and charts should meet WCAG 2.2 AA contrast and interaction expectations.

The initial shell uses a light neutral canvas, white surfaces, dark green text and accents, system sans-serif body text, and a system serif display face. Semantic CSS custom properties in `src/app/globals.css` own its colors, fonts, spacing, radii, and elevation; no external font request is required. This is a starting visual direction, not a complete brand system. The shell stacks its header below 40rem, includes a keyboard skip link and visible link focus, and displays an explicit empty state without invented financial values or nonfunctional action controls. Navigation and investment-entry composition remain future work.

Financial values use tabular numerals where available, an explicit currency, consistent precision within a view, and a real unavailable state such as an em dash. Negative values retain their sign. Every current-value context includes an as-of date.

## Charts

Apache ECharts is the planned charting system.

- Use line or subtle area charts for value over time.
- Use stacked-area charts when change in composition over time is the question.
- Use purpose-built summary treatments for XIRR and MOIC; a gauge or decorative market-terminal visualization is not required.
- Tooltips should show the date, value, relevant series, and cash-flow context without obscuring the selected point.
- Charts need accessible text summaries and must not be the sole source of essential information.

On desktop, charts support hover and precise pointer inspection. On iPhone, they support touch scrubbing with a stable crosshair or selection marker, appropriately sized targets, and behavior that does not trap ordinary page scrolling.

## Responsive behavior

Desktop can use side-by-side summaries, charts, filters, and tables when width supports them. Mobile should prioritize the headline value and primary action, stack supporting content, use compact drill-down surfaces, and keep important controls within comfortable touch reach. Responsive design may change composition and interaction while preserving the same underlying meaning.

## Input workflows

Entry surfaces should default dates and recent selections when safe, accept keyboard and touch input efficiently, validate close to the field, and keep financial signs understandable through language such as contribution and distribution.

Batch valuation entry should allow a user to choose an as-of date, review a list of relevant investments, enter gross value and linked debt efficiently, see derived NAV before saving, and identify omissions or invalid entries without losing valid work. Exact partial-save and correction behavior remains to be decided.

## Component direction

Likely reusable components include value summaries, metric cards, as-of labels, delta breakdowns, classification chips, chart frames, action-entry fields, investment rows, empty states, and unavailable metric explanations. Components should encode stable presentation and accessibility behavior; domain calculations remain outside the component layer.

## Open design decisions

- visual identity, palette, typography, and icon system;
- navigation model and information architecture;
- exact desktop breakpoints and mobile navigation behavior;
- chart behavior for sparse or irregular valuation marks;
- density and interaction model for large investment lists; and
- offline, install, and update prompts for the PWA.
