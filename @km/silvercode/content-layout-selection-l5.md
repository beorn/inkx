---
aliases:
  - km-silvercode.content-layout-selection-l5
  - km-silvercode-content-layout-selection-l5
created_at: 2026-05-08T15:28:53.978Z
closed_at: 2026-05-08T16:59:42.617Z
closeReason: "Expanded content-layout regression gate for prompt/composer/agents
  drawer right-edge alignment and body-to-code-card spacing; notification-block
  tests normalized to ChatEvents with existing projection changes. Tests:
  content-layout + notification-block (82), root tsc."
---

# [x] L5: Silvercode content layout selection regression gate #P2

Lock Silvercode chat content layout against the selection/layout regressions that surfaced in cards view and content blocks.

Acceptance criteria:

- Expand apps/silvercode/tests/content-layout.test.tsx or nearby fixtures to cover body block spacing, body-to-card spacing, card-to-card spacing, right-aligned metadata, prompt/composer/drawer alignment, and structural blank rows.
- Assert both visible layout and selectable/copy semantics where the fixture includes text selection.
- Include a regression fixture where content after a selected row does not inherit selected background/selectability.
- Keep this as an app-level gate; Silvery cell semantics belong in @km/silvery/selection-focus-plateau children.

