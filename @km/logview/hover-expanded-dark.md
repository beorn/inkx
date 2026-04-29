---
id: "@km/logview/hover-expanded-dark"
aliases:
  - km-logview.hover-expanded-dark
  - km-logview-hover-expanded-dark
created_by: claude:96f29185
created_at: 2026-04-24T07:32:23Z
closed_at: 2026-04-24T07:37:10Z
close_reason: "Expanded body skips colorize() — avoids C_BRK ($fg-muted)
  brackets on grey subtle-bg. Test: expanded-hover-contrast.test.tsx asserts
  uniform body fg. Commit 8b562691e."
owner: bjorn@stabell.org
assignee: claude:96f29185
dependencies:
  - issue_id: km-logview.hover-expanded-dark
    depends_on_id: km-logview
    type: parent-child
    created_at: 2026-04-24T00:32:38Z
    created_by: claude:96f29185
    metadata: "{}"
---

# [x] Hover on expanded body renders black-on-grey (unreadable) @km/logview #bug #P1 @claude:96f29185

blocks:: [[@km/logview]]

When hovering an expanded multi-line body row in claude-log viewer, text appears as black-on-grey — hard to read. Expanded bg is $bg-surface-subtle (blend(bg, fg, 0.05)); hover triggers colorize() which wraps plain-text tokens in nested <Text> without a color prop. The inner Text reset drops the parent $fg cascade on subtle-grey bg.