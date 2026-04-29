---
id: "@km/inkx/ci-strict"
aliases:
  - km-inkx.ci-strict
  - km-inkx-ci-strict
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:22Z
closed_at: 2026-02-23T11:42:08Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Fix CI continue-on-error flags in inkx @km/inkx #task #P2 @claude:ee8efc0f

Fix CI continue-on-error flags in inkx GitHub Actions.

## Problem
The inkx CI workflow has continue-on-error: true on test steps. This means CI never actually fails — broken tests show as green. No adopter will trust a package whose CI always passes regardless of test results.

## Tasks
- [ ] Audit .github/workflows/*.yml for continue-on-error usage
- [ ] Remove continue-on-error from test steps (unit, integration, type-check)
- [ ] Keep continue-on-error only where genuinely appropriate (e.g., optional platform matrix entries)
- [ ] Fix any tests that are currently failing (which is why continue-on-error was added)
- [ ] Verify CI goes red when a test is deliberately broken

## Impact
High — this is a trust signal. A package with meaningful CI is taken more seriously by evaluators.