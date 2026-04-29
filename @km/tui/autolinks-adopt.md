---
id: "@km/tui/autolinks-adopt"
aliases:
  - km-tui.autolinks-adopt
  - km-tui-autolinks-adopt
created_by: claude:2405c72e
created_at: 2026-04-26T04:54:59Z
closed_at: 2026-04-26T06:38:18Z
close_reason: "Shipped: 0d2cb7ccc + 0b963a328 + 83f982bff. InlinePlainText is
  the leverage point covering DetailView/CardColumn/NodeView/OmniboxRow.
  Session: km-session.0425-evening"
---

# [x] km-tui adopts @km/autolinks for inline text @km/tui #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode/autolinks-extract-to-package]], [[@km/tui]]

After packages/@km/_orphan/autolinks lands. Wire autolinks pattern detection into @km/tui's text rendering (likely DetailView text render path). Per-vault config cascade. Depends on @km/silvercode/autolinks-extract-to-package. Parent: @km/tui.