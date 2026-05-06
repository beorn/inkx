---
mentions:
  - km
  - claude
id: "@km/tui/col-header-dup"
aliases:
  - km-tui.col-header-dup
  - km-tui-col-header-dup
created_by: claude:23485adf
created_at: 2026-02-24T08:47:15Z
closed_at: 2026-02-25T20:09:50Z
owner: bjorn@stabell.org
assignee: claude:23485adf
---

# [x] Column header rendered twice when cursor at column level @km/tui #bug #P1 @claude:23485adf

Column header 'beowa' appears twice when cursor is at column level — once without highlight (old card-level style: yellow text, no bg) and once with highlight (column-level style: black text, yellow bg). Only affects first column where cursor transitions. Other columns render correctly.

Screenshot: ~/Desktop/Screenshot 2026-02-24 at 08.46.15.png

Investigation:

- TUI tests with checkIncremental=true all pass — no mismatch detected in virtual buffer
- TTY emulator (xterm-headless) renders correctly — header appears once, properly highlighted
- Cannot reproduce in any test environment
- Hypothesis: Ghostty-specific incremental rendering artifact when backgroundColor transitions from undefined→yellow on the header Box (content-phase may not properly invalidate the old cells when bg is added)
- getHeaderStyle() transitions: card-level={color:yellow,bg:undefined} → column-level={color:black,bg:yellow}
- The stale frame (card-level style) persists alongside the new frame (column-level style)

Needs: User verification — is this transient (flashes then corrects) or persistent? Does it happen on every k-press or intermittently? Running latest code with textSizing:auto fix?

