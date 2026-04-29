---
id: "@km/tui/column-top-tall-terminal-variant"
aliases:
  - km-tui.column-top-tall-terminal-variant
  - km-tui-column-top-tall-terminal-variant
created_by: claude:8b5b9e1c
created_at: 2026-04-21T00:33:02Z
closed_at: 2026-04-21T02:29:19Z
close_reason: "FIXED: verified at 240×117 on ~/Bear/Vault/@next.md after
  km-silvery.virtualizer-from-layout activation (silvery 80d8bcdb, 6d74de86,
  ddb2551b) + km-tui body-block paddingTop fix (8e8fac337). Before:
  /tmp/bug-repro-117rows-initial.png. After:
  /tmp/repro-240x117-POST-ACTIVATION.png +
  ~/Desktop/km-verified-column-top-FIXED.png. Column 3 top renders Task board
  body block cleanly, no ghost text, no phantom gaps."
---

# [x] [bug] Column-top-disappears variant: body block missing from adjacent column top at tall terminal (>100 rows) @km/tui #bug #P1 @claude:8b5b9e1c

blocks:: [[@km/tui/column-top-disappears]]

NEW VARIANT observed after Fix 1 (forward-walk height-aware) + gap-accounting parity + body-card clamp. User screen height 117 rows: top body block in the adjacent column renders blank. Screenshot in ~/Desktop/Screenshot 2026-04-20 at 17.21.37.png shows 5 @next columns with a blank region at top of adjacent column. Dependent on terminal height — specifically manifests at tall terminals (>100 rows). Parent: @km/tui/column-top-disappears.