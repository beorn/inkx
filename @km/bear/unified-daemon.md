---
id: "@km/bear/unified-daemon"
aliases:
  - km-bear.unified-daemon
  - km-bear-unified-daemon
created_by: Bjørn Stabell
created_at: 2026-04-19T04:28:35Z
closed_at: 2026-04-27T07:20:43Z
close_reason: Already shipped 2026-04-17 as part of 0.10.0 namespace purge.
  @bearly/lore was folded into @bearly/tribe; lore.* MCP names removed; single
  daemon hosts both coordination + memory. Documented in hub/architecture.md
  ('Lore was a separate daemon until April; absorbing it into tribe means each
  new capability gets JSON-RPC, hot-reload, idle-quit, and registration for
  free') and vendor/bearly/CLAUDE.md ('@bearly/lore was folded into
  @bearly/tribe on 2026-04-17'). Bead premise no longer holds.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bear.unified-daemon
    depends_on_id: km-tribe.refactor
    type: parent-child
    created_at: 2026-04-27T00:17:30Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] km-bear: unified daemon merging tribe (coordination) and lore (memory) into one process @km/bear #feature #P2

blocks:: [[@km/tribe/refactor]]

Phase 5 of @km/tribe/plateau — now the plateau's only remaining REFRAME.

## Motivation

After Phases 1-4, the tribe system is at ~75% of its quality plateau. The remaining 25% is structural: two daemons still run.

- @bearly/tribe coordination daemon — Unix socket, coordinates Claude Code sessions, messaging + chief derivation + plugins (git, beads, github, health, accountly)
- @bearly/tribe lore memory daemon (plugins/tribe/lore/) — separate Unix socket, owns focus cache + LLM summarizer + hook-dedup state, powers lore.ask / lore.brief / lore.plan / lore.session / lore.workspace / lore.inject_delta MCP tools

Both are auto-spawned via SessionStart hooks (two paths, two opportunities to fail — @km/tribe/autostart was literally the bug of one autostarting the other). Both have their own databases, config files, sockets, pidfiles (lore still has a pidfile post-Phase 3), and lifecycles.

The "bear" vision is one daemon hosting both capabilities behind one socket, one SQLite database (or clearly separated namespaces in one), one autostart path, one crash, one reconnect.

## Scope

1. Create a @bearly/bear package structure, or fold lore code into the existing @bearly/tribe daemon process.
2. Merge the two SessionStart hooks into one.
3. Unify the SQLite schemas (or keep two file-backed DBs but served by one process).
4. Merge the socket protocols — tribe.* and lore.* coexist as RPC methods on one daemon.
5. Delete the separate lore daemon.ts, lore cli.ts, lore pidfile code (parity with Phase 3).
6. Fold lore autostart config into tribe autostart config.
7. MCP surface: one MCP exposing both tribe.* and lore.* tools, no more dual-config in .mcp.json.

## What this solves

- Eliminates two-autostart-can-diverge class of bugs (root of @km/tribe/autostart).
- One process, half the RAM + disk footprint.
- One crash to recover from, not two.
- Cursor recovery + focus cache + LLM summary can share the same session identity.
- Lore pidfile deletion (Phase 3 parity) happens naturally.
- CI can spin up one daemon, exercise both coordination and memory, in one test.

## Dependencies / sequencing

- @km/tribe/plateau (all 4 phases) — LANDED.
- Should land AFTER the integration-test harness (currently being dispatched to a sub-agent) so behavioral parity is provable.

## Design questions

- Does "bear" become a new package, or does tribe absorb lore entirely? (The packaging already folded; the question is process + socket.)
- Separate DBs (tribe.db + lore.db on one server) or one DB? Probably separate DBs served by one daemon — cursor-recovery tables are orthogonal to lore's focus cache.
- Naming: @bearly/bear as a new package? Or keep @bearly/tribe as the single surface and delete @bearly/lore entirely? (Current packaging already did the latter conceptually — this is the process-level equivalent.)

## Effort

~1-2 days in a worktree. Additive + deletions, no rewrite.

## Not in scope

- Phase 1.5 stable session identity (sibling bead)
- Phase 1.6 message durability across restart (sibling bead)
- Phase 1.7 proxy reconnect-on-disconnect (already implemented — just needs integration test)