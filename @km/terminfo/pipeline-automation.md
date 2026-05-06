---
mentions:
  - km
  - Bjørn
id: "@km/terminfo/pipeline-automation"
aliases:
  - km-terminfo.pipeline-automation
  - km-terminfo-pipeline-automation
created_by: Bjørn Stabell
created_at: 2026-04-06T09:10:07Z
closed_at: 2026-04-06T09:13:49Z
close_reason: >-
  All 3 automation scripts shipped:

  1. bun run update --full — single pipeline runner with 8 steps + human
  checkpoints

  2. bun run sync-probe-status — auto-derives probeStatus from probe code (233
  automated, 21 partial)

  3. bun run watch-releases — checks GitHub/Codeberg for new terminal versions
  (8 terminals tracked)

  Also: /terminfo-update skill updated with vterm upgrade bead generator.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] terminfo.dev pipeline automation — single runner, auto-probeStatus, release watcher @km/terminfo #task #P2 @Bjørn Stabell

From /big analysis of /terminfo-update workflow. Three improvements:

1. SINGLE PIPELINE RUNNER — bun terminfo update --full
   Wraps all 9 refresh steps into one orchestrated flow with --pause-at triage
   for human checkpoints. Like CI with manual approval gates.
2. DERIVE probeStatus FROM PROBE CODE
   Script scans probe-defs/*.ts. If termless callback is non-null, probeStatus=automated.
   If null, probeStatus=partial. Eliminates manual sync between probe code and features.json.
3. GITHUB RELEASE WATCHER
   Cron or scheduled trigger checking GitHub releases API for tracked terminals
   (Kitty, Ghostty, WezTerm, foot, Alacritty, iTerm2, Windows Terminal, mintty).
   When new version detected: update terminals.json version, create bead, optionally
   trigger re-probe.

Also: annotation templates for predictable failures (VT420 ops, xterm-only queries)
so new annotations are auto-generated instead of hand-written.

