---
id: "@km/silvery/dashboard-snapshot-test"
aliases:
  - km-silvery.dashboard-snapshot-test
  - km-silvery-dashboard-snapshot-test
created_by: claude:db326126
created_at: 2026-03-29T23:18:45Z
closed_at: 2026-03-29T23:27:33Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] Dashboard snapshot test: termless render vs approved mockup @km/silvery #task #P2

Add a termless snapshot test for the dashboard example that:
1. Renders Dashboard at 137x43 in termless (no real terminal)
2. Captures the initial frame (before useInterval fires)
3. Compares structural elements against the approved mockup
4. Runs as part of test:fast so regressions are caught automatically

Motivation: After refactoring dashboard.tsx (LV helper extraction, -89 lines), there was no automated way to verify the output still matched the approved design. Manual TTY verification was the only option.

The test should compare STRUCTURE (borders, panel titles, labels, layout geometry) not values (CPU percentages jitter via useInterval).

Approved mockup reference: vendor/silvery-internal/design/mockups/dashboard-mockup.ansi