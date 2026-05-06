---
mentions:
  - km
  - Bjørn
id: "@km/market/terminfo-completeness/env-detection"
aliases:
  - km-market.terminfo-completeness.env-detection
  - km-market-terminfo-completeness-env-detection
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:44Z
closed_at: 2026-04-06T07:02:33Z
close_reason: Completed in /max batch — 93 new features added, annotated,
  re-probed, rebuilt, pushed. See km-market.terminfo-completeness epic for
  summary.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Track environmental detection (TERM, COLORTERM, etc) @km/market #task #P2 @Bjørn Stabell

Environmental variables set by terminals are a major missing category.

Per-terminal tracking:

- TERM actual values (xterm-kitty, wezterm, foot, ghostty, alacritty, vscode, etc)
- COLORTERM (truecolor, 24bit)
- TERM_PROGRAM, TERM_PROGRAM_VERSION
- LC_TERMINAL, LC_TERMINAL_VERSION (iTerm2)
- VTE_VERSION
- KONSOLE_VERSION
- KITTY_PID, KITTY_WINDOW_ID
- WEZTERM_PANE, WEZTERM_EXECUTABLE
- WT_SESSION, WT_PROFILE_ID (Windows Terminal)
- XTERM_VERSION

Terminfo advertisement vs reality:

- Does TERM's terminfo entry advertise capabilities that actually work?
- Does it miss capabilities that do work?
- Big missed opportunity for terminfo.dev: capability-vs-advertisement mismatch data.

Probe strategy: new probe type that reads env vars + queries terminfo database.
New category in features.json: "environment".

