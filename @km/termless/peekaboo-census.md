---
mentions:
  - km
  - claude
id: "@km/termless/peekaboo-census"
aliases:
  - km-termless.peekaboo-census
  - km-termless-peekaboo-census
created_by: claude:4929065a
created_at: 2026-03-23T23:38:11Z
closed_at: 2026-03-23T23:46:11Z
close_reason: "Done: app-harness.ts (30 probes, runs inside terminal) +
  app-runner.ts (launches via AppleScript). 5 apps detected: Ghostty, iTerm2,
  Terminal.app, Kitty, Warp. Usage: bun census:apps"
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Peekaboo census: probe real terminal apps (iTerm2, Terminal.app, Kitty, Ghostty, Warp) @km/termless #feature #P2 @claude:4929065a

Run census probes against real macOS terminal apps via peekaboo MCP. Tests what users actually see, not library reimplementations.

Architecture:

- Launch terminal app via peekaboo (open -a)
- Feed data: type escape sequences into the terminal
- Read screen: use peekaboo 'see' to extract text via accessibility/OCR
- Verify: compare extracted text with expected output

Approach: create a new backend type 'app' that wraps peekaboo MCP calls. Each app backend is parameterized by bundle ID:

- com.googlecode.iterm2 (iTerm2)
- com.apple.Terminal (Terminal.app)
- net.kovidgoyal.kitty (Kitty.app)
- com.mitchellh.ghostty (Ghostty.app)
- dev.warp.Warp-Stable (Warp)

Key difference from library backends: we can't read per-cell attributes (bold, color). We CAN verify:

- Text output (feed bytes, read screen text)
- Cursor position (via cursor position report \x1b[6n)
- Mode support (feed mode sequence, verify behavior)
- Scrollback (feed many lines, scroll up, verify old content)

Available apps: Ghostty.app, iTerm.app, kitty.app, Warp.app, Terminal.app

