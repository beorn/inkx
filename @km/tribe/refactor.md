---
mentions:
  - km
  - claude
id: "@km/tribe/refactor"
aliases:
  - km-tribe.refactor
  - km-tribe-refactor
created_by: claude:2405c72e
created_at: 2026-04-27T07:17:09Z
closed_at: 2026-04-27T09:21:06Z
close_reason: >-
  Epic complete. All originally-listed children landed plus the
  runtime-decomposition follow-on:


  PRIMARY CHILDREN (the four listed in the epic):

  - km-bear.unified-daemon — already shipped 0.10.0 (Apr 17)

  - km-tribe.composition-pipe — pipe + with* boot migration (compose agent)

  - km-tribe.bg-recall-daemon — async JIT recall daemon w/ observability
  (bgrecall agent)

  - km-tribe.event-classification — actionable/ambient classification + 4 RPCs +
  schema v10 (events agent)


  CROSS-LINKED P1 BUG (also landed):

  - km-tribe.recall-quality-gate — index + query-time quality filter (qualgate
  agent)


  DISCOVERED FOLLOW-ON (filed and landed — 'don't defer anything' mandate):

  - km-tribe.composition-pipe-runtime — runtime decomposition into 8 more withX
  factories (runtime agent). Final state: tribe-daemon.ts is 158 LOC of pure
  pipe + plugins, ZERO module-level mutable state, await tribe.run() lives in
  withRuntime.


  ACCEPTANCE — verified literally:

  - tribe daemon source uses pipe + with* end-to-end: tribe-daemon.ts is 158
  LOC; reads top-down as the architecture diagram; grep '^(const|let) [A-Z_]+'
  returns 0; await tribe.run() at line 158

  - hub/composition.md + hub/architecture.md describe live code (compose's
  a0c9bfb5b)

  - A new plugin can be added with one entry: withPlugin(...) in the pipe; no
  edits to core daemon dispatch

  - All children closed: 5/5


  VERIFICATION COMMANDS:

  - npx tsc --noEmit | grep 'error TS' | grep -v vendor/ → 1 (vendor/silvery,
  parallel-session WIP, NOT mine)

  - bun run test:vendor → 566 files, 12,284 tests pass


  VENDOR/BEARLY COMMIT WAVE (this epic's full diff):
    bec4021 quality-gate module
    20595c5 event-classification schema v10
    7e92d0a recall purge + pointer-mode default
    8444223 daemon-spine composition primitives
    842a076 events classify push/pull + 4 RPCs
    d947597 tribe.compose factory layer + fresh-install db guard
    6fac55e bg-recall daemon
    4becc9f tribe-daemon pipe boot
    508b8cb event-classification tests + bump 0.12.0
    ce27bff oxfmt polish
    0168b32 cast JSON.parse to typed shape (tsc fixes)
    716b83d oxfmt + server.mjs regen
    982ec6b withClientRegistry (Phase 1)
    8b4c7df withBroadcast (Phase 2)
    c4354ce withSocketServer (Phase 3)
    a48597d withDispatcher (Phase 4)
    8217cc1 withSignals + withHotReload (Phases 6+7)
    dbc9510 withIdleQuit (Phase 8)
    1ec8282 withRuntime + gut module state (Phases 9+10)
    d45ae9b runtime composition tests (Phase 11)

  KM COMMIT WAVE:
    34f07d080 recall index/query gate + cross-session contamination fix
    a0c9bfb5b hub/ doc cleanup (evergreen-docs)
    5de018cf7 bearly bump for tribe-refactor integration
    d7bd73684 bearly bump for runtime decomposition

  OUT OF SCOPE — separate beads if/when motivated:

  - @bearly/daemon-spine → @bearly/tribe-client rename

  - plugins/mcp → plugins/shared-mcp rename

  - tribe-proxy.ts → stdio-adapter rename

  - silvery/km adoption of pipe + with*

  - withMCPServer extraction (Phase 5 deferred — tribe-daemon has no in-process
  stdio MCP today; lives in tribe-proxy.ts. Filed as runtime-discovered work for
  when the proxy migrates in-daemon.)
started_at: 2026-04-27T07:27:23Z
owner: bjorn@stabell.org
assignee: claude:87d20187
dependencies:
  - issue_id: km-tribe.refactor
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T00:17:29Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] Tribe daemon refactor — pipe-composition + unified daemon + observable lifecycle @km/tribe #epic #P2 @claude:87d20187

blocks:: [[@km/tribe]]

Project epic tracking the tribe-daemon refactor wave. Closes when all children land.

## Scope

Refactor the tribe daemon to:

1. **Compose via pipe + with*** — codify what hub/composition.md describes. Plain factory + curried capability extensions; tools, plugins, MCP server all register via the same pattern.
2. **Unify with lore** — single daemon process owns coordination + memory (was already absorbed in 0.10.0; this confirms the API surface).
3. **Make recall observable** — bg-recall daemon, ambient vs actionable event classification, debug logs + status command + why-this-decision explainability from v1.
4. **Quality gate the index** — reject corrupted/stuck-loop sessions (@km/tribe/recall-quality-gate is P1 and stays separate; not in scope here).

## Children

- @km/tribe/composition-pipe — pipe + with* migration (foundational)
- @km/tribe/bg-recall-daemon — async JIT recall
- @km/tribe/event-classification — actionable vs ambient delivery filter
- @km/bear/unified-daemon — confirm the merged tribe+lore surface

## Cross-links (not children)

- @km/silvercode/process-mgmt (epic) — process management, MCP-as-tribe-plugin, mcp-daemon. Adjacent scope; benefits from the composition primitives this epic ships but tracked separately.
- @km/tribe/recall-quality-gate (P1, bug) — index-time + query-time corruption rejection. Standalone bug, ships independently.

## Acceptance

- All children closed
- Tribe daemon source uses the pipe + with* pattern end-to-end
- hub/composition.md and hub/architecture.md describe live code, not aspirational
- A new plugin can be added with one entry; no edits to core daemon dispatch

