# Product regression validation

Automated regression protects the personal household product on Desktop Chrome and iPhone 13 dimensions/touch emulation in Chromium. These tests use invented names and values in disposable databases. They assert behavior, accessible text, dates and usable controls rather than pixel positions.

## Automated journeys

| Contract | Coverage owner |
| --- | --- |
| Clean migrations, authentication, zero-household routing, owner validation, multi-owner setup, lost-response retry, immediate unclassified investment, configured setup bypass | e2e/bootstrap.spec.ts, run separately against a fresh database for each viewport |
| Post-bootstrap household rename; add/rename/remove owners and all classification dimensions; duplicate errors and retained input; pending writes; in-use removal blocks; return to investment choices; stable IDs, associations and financial history | e2e/settings-workflow.ts, composed into the clean bootstrap journey for both viewports; src/persistence/settings.integration.test.ts covers cross-household isolation and closed-investment references |
| Overview -> Investments -> detail -> management -> contribution -> Update Center -> single valuation -> chart inspection -> closure -> retained history | e2e/product-regression.spec.ts |
| Create/edit classification and ownership, close-date conflicts, historical accessibility, investment identity/history preservation | e2e/investment-management.spec.ts |
| Investment detail -> all four Add actions, date/source defaults, saved return context, global Add reset, invalid/closed defaults | e2e/action-context.spec.ts |
| Active/closed/all lifecycle, all seven stable-ID metadata filters and intersections, reporting-date changes, URL refresh/back/forward, reset, unclassified records, missing valuations and unavailable detail | e2e/investments.spec.ts |
| Missing/stale/current valuation priority, closed-history exclusion, single/batch updates and fresh client-navigation returns | e2e/overview-updates.spec.ts |
| Scoped Overview owner/joint-owner, overlapping-group, all classification and investment-set filters; intersections; scope retained across date, period and chart controls; local date resolution; reset; empty/missing/negative scopes and dated underlying links | e2e/scoped-overview.spec.ts; src/components/overview/scoped-analytics.test.ts checks authoritative metrics and histories against the compact synthetic ledger |
| Real persisted chart values, dates, additive owner grouping and browser-local reporting dates | e2e/historical-charts.spec.ts |
| Pointer selection, horizontal touch scrubbing, vertical page scrolling, keyboard date inspection, coverage gaps, negative segment rendering and color-independent labels | e2e/presentation/charts.spec.ts |
| All seven browse filter controls at desktop/iPhone widths, landmarks, visible keyboard focus, touch targets, retained as-of dates, negative values, unavailable and presentation-only ambiguous return explanations | e2e/presentation/primitives.spec.ts |
| Detailed entry/correction, transfer and atomic batch workflows | e2e/desktop.spec.ts, e2e/iphone.spec.ts |

The product journey distinguishes the four financial Add actions from investment creation/management. Its negative-NAV investment retains an unavailable XIRR explanation, and its retained history distinguishes valuation observations from cash movements. Existing Overview and historical-chart tests protect incomplete aggregate coverage and exact available constituents; missing coverage never becomes a zero aggregate. Grouping choices exclude overlapping custom groups. Domain and application tests own numerical/formula regressions. The current fixed-guess XIRR policy does not emit ambiguity; only the presentation contract is exercised with an ambiguous synthetic result.

## Analytics regressions

`src/domain/analytics/testing/canonical-fixture.ts` supplies the compact synthetic ledger. Domain and application regression tests assert independent expected values and cross-metric identities; `src/persistence/database.integration.test.ts` checks the same contracts through real canonical reads. Coverage includes transfer boundaries, joint ownership and overlapping groups, exact-cent aggregation, closed/partial realization, negative NAV, carried-forward and missing marks, combined-flow MOIC/XIRR, fixed-guess root selection and correction-driven recalculation. [Metrics](metrics.md) owns the definitions; the fixture and tests own the worked values.

## Migration regressions

`src/migration/end-to-end.integration.test.ts` runs the private CLI through inspection, non-mutating preflight, atomic apply, canonical analytics, reconciliation and validated export on disposable PostgreSQL. The temporary workbook generator uses the existing synthetic matrix with explicit owners, no source taxonomy and an intentionally ignored legacy grouping; the original adapter fixture separately exercises classification mapping.

Assertions cover exact cents/calendar dates, joint ownership, transfer pairing/cancellation, debt and negative NAV, closed returns, historical carry-forward, missing source/coverage, annotated definition differences, valuation uniqueness, repeat rejection and exclusion of populated authentication state. CLI tests protect explicit target selection, private reports and manifest identity validation. `src/migration/privacy.test.ts` checks documented ignore rules/tracked paths; it does not certify arbitrary contents or repository history. All database cases run through `npm run test:db`; no real workbook or financial database is required.

## Commands and CI

Run npm run check, npm run test:db, npm run test:presentation, npm run test:e2e and git diff --check against the intended base. The existing CI browser job runs the same presentation and E2E commands; test:e2e includes test:bootstrap after the seeded regression suite. test:bootstrap starts and cleans up a separate migration-only database per viewport; it never seeds it or resets an existing application database.

Inspect generated synthetic screenshots and traces when a failure concerns layout or interaction. The primary workflows must fit the viewport, keep dates visible, offer labeled controls with usable focus/touch targets, and expose essential chart information outside the plot. [The historical chart contract](design-system.md#historical-chart-rendering-contract) owns signed-stack rendering and accessibility.

## Proportionate UX checks

The integrated journey exercises updates without a full browser reload using the existing maintenance continuity assertions. Historical charts load one authoritative historical-series bundle per scope; local measure, range, date and grouping changes consume that bundle in React rather than issuing analytics requests. No speculative cache or background analytics infrastructure is introduced. Browser checks protect viewport fit, usable targets and scrolling; they are not performance benchmarks.

Physical iPhone Safari and installed-PWA behavior remain [device checks](pwa-validation.md). Chromium touch emulation is automated regression evidence, not physical-device verification.
