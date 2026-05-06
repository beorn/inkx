---
mentions:
  - km
id: "@km/silvery/use-content-rect-nested"
aliases:
  - km-silvery.use-content-rect-nested
  - km-silvery-use-content-rect-nested
created_by: claude:491faf6c
created_at: 2026-03-26T00:11:07Z
closed_at: 2026-03-26T06:13:09Z
close_reason: Fixed in commit 4275ae3. useContentRect now subtracts
  padding+border via getInnerRect() helper in useLayout.ts. Dashboard uses
  ProgressBar everywhere, no manual bar calculations. 246 vendor tests pass.
owner: bjorn@stabell.org
---

# [x] useContentRect returns wrong width in nested flex layouts @km/silvery #bug #P2

useContentRect() returns the terminal width (or outer container width) instead of the inner content width when called inside a component nested in a bordered+padded flex pane. This causes ProgressBar and any width-dependent rendering to overflow pane boundaries. Reproduced in the dashboard example's wide 4-pane layout at 130 cols — bars render wider than their containing pane because useContentRect reports ~130 instead of ~59.

