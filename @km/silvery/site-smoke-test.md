---
mentions:
  - km
  - claude
id: "@km/silvery/site-smoke-test"
aliases:
  - km-silvery.site-smoke-test
  - km-silvery-site-smoke-test
created_by: claude:491faf6c
created_at: 2026-03-25T19:23:01Z
closed_at: 2026-03-25T23:56:04Z
close_reason: "Created 174-line Playwright smoke test at
  tests/site-smoke.test.ts: 7 categories, ~35 tests covering doc pages,
  screenshots, iframe demos, gallery interaction, static HTML demos, broken
  links."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Automated smoke test for silvery.dev — verify all live demos and embedded apps @km/silvery #task #P2 @claude:19080504

Create a Playwright-based smoke test (or AI skill) that:

1. Navigates to every page on silvery.dev that has embedded live apps
2. For each app: verifies the terminal renders (not blank/error), checks all tabs/views
3. Takes screenshots for visual comparison
4. Reports broken demos, console errors, missing content

Locations to test:

- /examples/ — ShowcaseGallery with 5 demos (dashboard, kanban, components, dev-tools, textarea)
- / (homepage) — viewer iframe
- /examples/ai-chat — individual example page
- /examples/components — individual example page
- Any other pages with embedded viewers

Should run as a CI check or on-demand skill.

