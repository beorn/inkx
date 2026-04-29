---
id: "@km/silvercode/simplify-supervisor"
aliases:
  - km-silvercode.simplify-supervisor
  - km-silvercode-simplify-supervisor
created_by: claude:2405c72e
created_at: 2026-04-26T19:54:19Z
closed_at: 2026-04-26T20:03:10Z
close_reason: "Shipped 4f9e9ebb5: -898 LOC. Deleted process-supervisor.ts +
  pidfile/reaper/clampLayoutForResume/onSpawn-onExit callbacks +
  acquireSupervisor wiring + 3 test files. Added MAX_LIVE_SESSIONS=8 hard cap in
  controller + spawn-cap.test.ts. Kept detached:true (kernel-standard pgroup,
  parallel SIGTERM <200ms). 571/576 silvercode tests green."
---

# [x] Simplify silvercode supervisor: process owns subs, no detached, no reaper @km/silvercode #task #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

Replace 715-line supervisor edifice (process-supervisor.ts + pidfile + children.jsonl + reaper + clampLayoutForResume) with standard process-group ownership.

# Decision

**Option 1: process owns subs via standard process groups.**

Option 2 (singleton daemon over Unix socket) is sound architecture but solves problems silvercode does not have today (multi-UI sharing one agent, TUI-restart preserves session). YAGNI — revisit if a product reason surfaces.

# Why Option 1

Audit confirms: every `spawnSession` callsite in silvercode is an explicit user action (initial bounded loop, Ctrl+G v/s, header +, /spawn, handoff). There is NO reactive auto-respawn / onExit→spawn / ensure-session-alive loop. The original fork-bomb cause is upstream of this codebase or was cross-launch accumulation per the original bead — not a within-launch live spawn loop.

So the "strong supervisor" Pro recommends solves the SIGKILL/OOM orphan window, which is rare for an interactive TUI. Cost (out-of-process daemon, lifeline FD, worker shim) >> benefit. Delete the band-aids; trust standard process groups.

# Deletions (~715 LOC)

1. `apps/silvercode/src/process-supervisor.ts` — entire file (328 LOC)
2. `apps/silvercode/tests/process-supervisor.test.ts` — entire file (322 LOC)
3. `apps/silvercode/tests/resume-clamp.test.ts` — entire file (63 LOC)
4. `apps/silvercode/src/index.tsx` — remove `acquireSupervisor` / `releaseSupervisor` import + call site, remove `clampLayoutForResume` function + its call site
5. `apps/silvercode/src/controller.ts` — remove `registerChild` import + `onSpawn` callback wiring
6. `apps/silvercode/packages/agent-harness/src/spawn.ts` — drop `detached: true`; drop `onSpawn` / `onExit` ledger callbacks (keep AgentEvent emission); replace `process.kill(-pgid, SIGTERM)` cleanup with `proc.kill(SIGTERM)` then `SIGKILL` after grace

# Minimal in-process discipline (additive, ~50 LOC)

Add to controller.ts:

- Idempotent spawn per sessionId (state machine: idle/spawning/running/exited)
- Set `spawning` synchronously BEFORE awaiting any async work (closes async-race duplicate-spawn class)
- Hard cap: max 8 live sessions per silvercode invocation; rejection surfaces as explicit error
- Process-exit handler: SIGINT/SIGTERM/uncaughtException → SIGTERM all live sessions → 200ms grace → SIGKILL

# Tests to add (~80 LOC)

- SIGINT to silvercode → all claude children dead within 500ms
- Ctrl+D normal exit → all claude children dead
- 9 rapid /spawn calls → 9th rejected with explicit error, first 8 alive
- Concurrent duplicate spawn for same sessionId → only one process

# Tests to delete

- process-supervisor.test.ts (entire file — feature gone)
- resume-clamp.test.ts (entire file — clampLayoutForResume gone)

# What this does NOT solve

- SIGKILL/OOM of silvercode itself: standard process groups don't tie children to parent on hard kill (Linux `PR_SET_PDEATHSIG` would, macOS has no clean equivalent). Acceptable: rare for interactive TUI; user will reap manually with `pkill claude` if needed. Future work tracked separately.

# Order of operations

1. Add tests for new behavior (TDD: SIGINT-kills-children, hard-cap, idempotent spawn)
2. Delete supervisor wiring in index.tsx + controller.ts
3. Drop `detached:true` in spawn.ts; switch close() to standard kill
4. Delete process-supervisor.ts + its tests + resume-clamp.test.ts
5. Run full silvercode suite + smoke-test bun km silvercode (start/quit/Ctrl-C with claude alive — verify children die)
6. Commit

# Acceptance

- bun vitest run apps/silvercode/ — green
- After `silvercode` quits (any path: q, Ctrl+C, Ctrl+D, terminal close), `pgrep claude` shows zero children spawned by that silvercode
- 9 rapid spawn requests → 8 succeed, 9th explicit-fails
- Net LOC change: -715 +130 = -585 lines