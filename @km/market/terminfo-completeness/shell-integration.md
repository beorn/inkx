---
mentions:
  - km
  - Bjørn
id: "@km/market/terminfo-completeness/shell-integration"
aliases:
  - km-market.terminfo-completeness.shell-integration
  - km-market-terminfo-completeness-shell-integration
created_by: Bjørn Stabell
created_at: 2026-04-06T06:08:20Z
closed_at: 2026-04-06T07:02:35Z
close_reason: Completed in /max batch — 93 new features added, annotated,
  re-probed, rebuilt, pushed. See km-market.terminfo-completeness epic for
  summary.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Split OSC 133 / OSC 633 into sub-command probes @km/market #task #P2 @Bjørn Stabell

Current tracking of shell integration is too coarse.

OSC 133 (FinalTerm semantic prompts):

- 133;A — prompt start
- 133;B — prompt end (command start)
- 133;C — command executed
- 133;D[;exit] — command finished
- 133;P;key=value — properties/metadata

OSC 633 (VS Code shell integration, superset of 133):

- 633;A/B/C/D — same as 133
- 633;E;commandline;nonce — explicit command with nonce
- 633;P;key=value — VS Code-specific properties (Cwd, git status, etc.)

Each sub-command should be a separate feature with separate probe.
Support varies: iTerm2, WezTerm, VS Code, kitty, Ghostty, foot, Windows Terminal.

