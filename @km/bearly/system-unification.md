---
id: "@km/bearly/system-unification"
aliases:
  - km-bearly.system-unification
  - km-bearly-system-unification
created_by: Bjørn Stabell
created_at: 2026-04-17T22:31:13Z
closed_at: 2026-04-18T03:04:14Z
close_reason: "Phase 4 shipped 2026-04-17: daemon-internal RPC migrated to
  tribe.* namespace. Lore daemon proto v2→v3. Both daemons accept legacy names
  as silent aliases (removal 0.10). bearly commit ee5dbb01, km commit 3fbd6fc3.
  All phases complete."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-bearly.system-unification
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-17T15:31:25Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Tribe system unification — fold lore into tribe, unify CLI/MCP/env @km/bearly #task #P2 @Bjørn Stabell

blocks:: [[@km/bearly]]

Major restructure from /big audit. Three packages remain:

- @bearly/tribe = coordination + memory daemon + CLI + all MCP tools (absorbs @bearly/lore)
- @bearly/recall = standalone FTS primitive (separate for now, may absorb later)
- @bearly/llm = standalone LLM dispatcher (permanent separation)

## Phases

Phase 0 — Fold @bearly/lore into @bearly/tribe
  - plugins/lore/src/* → plugins/tribe/src/lore/* (or flat under plugins/tribe/src/)
  - Remove @bearly/lore package.json; remove from npm-packages.md
  - Update all imports (recall hooks, km .mcp.json, km CLAUDE.md references)

Phase 1 — tribe install + hook rename
  - Add 'tribe hook <event>' subcommands (session-start, prompt, session-end, pre-compact)
  - Add 'tribe install' / 'tribe uninstall' / 'tribe doctor' — one-shot setup
  - Deprecate 'bun recall session-start' etc. (keep as shims)

Phase 2 — MCP namespace unification under tribe.*
  - lore.ask → tribe.ask, lore.current_brief → tribe.brief, etc.
  - tribe_send → tribe.send, etc. (dot convention)
  - Deprecation window: both names work with old names logged as deprecated

Phase 3 — Env prefix TRIBE_*
  - LORE_* + RECALL_* → TRIBE_* with compat aliases (one warning per daemon startup)

Out of scope: @bearly/llm and @bearly/recall stay separate. @bearly/refactor, tty, worktree unchanged.