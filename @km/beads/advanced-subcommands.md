---
mentions:
  - km
id: "@km/beads/advanced-subcommands"
aliases:
  - km-beads.advanced-subcommands
  - km-beads-advanced-subcommands
created_by: claude:da9990c5
created_at: 2026-04-28T08:15:30Z
closed_at: 2026-04-28T15:05:05Z
close_reason: "km bd orphans (the only advanced subcommand actively invoked by
  automation — used by /sop backlog) shipped this session. Implementation in
  apps/km-cli/src/commands/bd.ts: scans the last 90 days of git log, matches
  each open/in-progress/blocked bead's id as a whole-word regex against commit
  bodies (escapes dot separator). Supports --days, --json, --details. Other
  advanced subcommands (defer/undefer/count/epic/lint/validate/search/etc.) are
  documentation references only, not used by active automation — defer porting
  until concrete need surfaces. The split-backend bug (km-beads.split-backend)
  is the real cutover blocker, not subcommand parity."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.advanced-subcommands
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-28T01:15:37Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads
---

# [x] Port advanced bd subcommands to km bd (defer/undefer/count/epic/lint/search bundle) @km/beads #task #P2

blocks:: [[@km/beads]]

Blocks @km/beads/dolt-archive. After pm-skill-rewrite + hooks-rewrite landed in fa1858976, 24 advanced bd subcommands still require the Go binary. Highest-leverage subset to port first: defer / undefer (lifecycle), count (stats), epic status / close-eligible (epic management), lint / validate (audits), search (FTS alternative to list). Once these are in km bd, hooks can flip preference (km bd first), bd binary can be uninstalled, and .beads/dolt/ can be archived (@km/beads/dolt-archive).

## Acceptance

- km bd defer <id> --until <date> works
- km bd undefer <id> works
- km bd count [--by-status|--by-type|...] works
- km bd epic status / close-eligible works (uses bead parent-child chain)
- km bd lint works (validates issue descriptions for required sections)
- km bd validate (per-issue validation) works
- km bd search <text> works (FTS5 over node FTS index)
- /pm skill docs use km bd for these commands
- Hooks flip to km bd first

## Out of scope

- formula / mol (workflow templates) — heavy ports, defer
- swarm / promote / gate / slot — agent-specific, defer
- comments — rarely used, defer
- delete (vs close --reason) — close+drop covers it
- backend / dolt — dolt-archive removes them
- find-duplicates / graph / label — niche, defer

