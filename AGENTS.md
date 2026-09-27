# Working in Project Equinox

## Repository safety

- This is a public repository. Never commit real personal financial data, actual portfolio values, account identifiers, private institution or account details, or anything copied or derived from the user's real investment spreadsheet.
- Use generic investment names and synthetic numbers in examples, fixtures, tests, and screenshots. A private spreadsheet may be used locally for a future migration or reconciliation workflow, but it must never become repository content.
- Treat the documents linked from `README.md` as the canonical product, domain, metrics, design, and architecture specifications. Update the owning document when a decision changes and link to it instead of duplicating it.

## Engineering practice

- Equinox is a personal app. Keep changes within the requested scope and proportionate to ordinary personal use. Protect credible financial-data integrity and privacy risks, but do not add speculative concurrency mechanisms, defenses against impractical manipulation, or exhaustive edge-case handling without a concrete supported workflow that needs them. Prefer a small, understandable implementation over infrastructure for hypothetical scale or adversarial use.
- Inspect the nearest related implementation before adding a workflow or substantial logic. Reuse or extend an existing owner when semantics match; introduce parallel logic only when responsibilities genuinely differ.
- Avoid mechanical DRY and generic frameworks. Split modules by cohesive responsibility and keep validation and tests proportional to credible product and data-integrity risks.
- Test domain invariants, supported workflows, and relevant failure paths. Do not optimize for coverage numbers or exhaustive theoretical combinations.
- Read `docs/design-system.md` before changing UI, navigation, charts, forms, or responsive behavior. Keep shared tokens and components centralized where practical, and update the design document when the interface contract changes.
- For Next.js APIs and conventions, consult the version-matched documentation in `node_modules/next/dist/docs/` after installing dependencies.

## Permissions and Git

- Read-only repository inspection and non-destructive validation are pre-authorized.
- Staging and local commits are pre-authorized. Pushing, creating or modifying GitHub content, merging, force-pushing, changing settings, and deleting published branches require explicit user authorization.
- For every commit created directly by Codex, append this commit trailer:

  ```text
  Made-with: Codex
  ```

## Code review

### Pull-request context

- Before implementation review, require the pull-request description to state the change's intent, expected behavior, behavior that must remain stable, relevant invariants or failure behavior, and validation evidence. Keep this proportionate for small changes.
- If a repository pull-request template is added, use it and replace all guidance or placeholders with substantive content.
- Treat the description as a hypothesis to verify against canonical documentation, unchanged callers, implementation, and tests. Report contradictions or missing decisions rather than inferring requirements silently.
- Preserve real Markdown line breaks in GitHub descriptions and comments. Inspect the published result after a write and correct formatting defects promptly.

### Review method

- Review the current pull-request head and identify the reviewed revision. Re-check earlier findings against the current head; do not present findings against superseded code as current.
- Inspect relevant code beyond the changed lines, including callers, persistence paths, state transitions, cache behavior, and credible failure paths.
- Review new and modified tests independently. Look for counterexamples in which incorrect behavior would still pass, with particular attention to the financial invariants in `docs/data-model.md` and `docs/metrics.md`.
- Check fixtures, screenshots, logs, errors, and examples for real financial data or identifiers. Public-repository privacy violations are blocking findings.
- Report actionable correctness, security, privacy, data-integrity, and regression risks with precise evidence and file references. Distinguish actionable defects from uncertainty and optional suggestions; leave deterministic formatting checks to tooling.
- Reviewers remain advisory and do not approve or merge on behalf of maintainers.

### Reviewer coordination

- When Codex and Gemini review integrations are available, use Codex for the broad end-to-end and remediation review and Gemini as a complementary independent review. Do not infer review coverage from silence, elapsed time, or an unavailable reviewer.
- After a material update, request review of the new head through the integration's configured mechanism. Do not assume a trigger command or automatic review exists unless repository configuration or observed behavior confirms it.
- When Codex helped author a change, perform a separate reviewer-context pass rather than relying on the implementation conversation.
- Track each finding as accepted, duplicate, disputed with evidence, a maintainer product decision, or a deferred valid finding. A deferred item requires a linked issue only when GitHub-write authorization is available; otherwise report the follow-up needed.
- Do not describe review as complete while a validated blocking finding remains unresolved. Human maintainers retain approval and merge authority.

### Addressing feedback

- Validate each finding against the stated requirements, canonical documentation, current implementation, callers, and tests before changing code.
- For a valid finding, apply the smallest safe correction, add or update meaningful validation, and request review of the new head when the correction could affect earlier conclusions.
- Consolidate duplicate findings while preserving distinct evidence. Explain with evidence when feedback is invalid, already addressed, outside scope, disproportionate, or dependent on an unresolved product decision.
- During remediation, run checks focused on the affected behavior. Before publishing a branch and before declaring the review loop complete, run all applicable repository checks plus `git diff --check` against the intended base. Do not invent hardcoded commands before the project establishes its toolchain.
