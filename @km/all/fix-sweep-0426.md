---
id: "@km/all/fix-sweep-0426"
aliases:
  - km-all.fix-sweep-0426
  - km-all-fix-sweep-0426
created_by: claude:2405c72e
created_at: 2026-04-26T19:13:02Z
started_at: 2026-04-26T19:13:33Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-all.fix-sweep-0426
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-26T12:13:33Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [/] Fix sweep 2026-04-26 — supervisor redesign + 83 test failures + 210 typecheck errors @km/all #epic #P1 @claude:2405c72e

blocks:: [[@km/all]]

Tracking epic for the multi-area fix pass started 2026-04-26.

## Scope

### A. Supervisor redesign — DEFERRED to @km/silvercode/parent-death-orphan-gap (P4)

**Status (2026-04-26)**: superseded.

- Original supervisor edifice (898 LOC pidfile/reaper) was DELETED in commit `4f9e9ebb5` — Quarantine-and-Delete; the within-launch fork bomb it defended against doesn't actually exist.
- Graceful exit hardened in commit `08a0989b9` (sentTerm + exitPromise + 10s SIGKILL fallback through pgroup) covers Ctrl+C / app quit / planned shutdown.
- Remaining gap (parent SIGKILL/OOM/panic leaks orphan claude+MCP grandchildren) is now `km-silvercode.parent-death-orphan-gap` at **P4** (long-term roadmap). YAGNI: no real-world report; revisit only on user-reported orphan accumulation, measurable resource leak, or deployment to a context where parent crashes are routine.

----

Original section A context (preserved for history):

User question (paraphrased): why did the original fork-bomb happen at all?
We control silvercode's spawn graph; it's in our hands, not the user's.
And: the current pidfile-based defense only kicks in on the NEXT launch
of the same vault — there's a gap between hard parent death (SIGKILL,
OOM, panic, machine off) and the next start during which orphans live.

Audit performed (this session):
- spawnSession() callers: controller initial spawn (loop bounded by
  initialSessions=1/2/4), Ctrl+G v split, Ctrl+G s split, header '+'
  button, /spawn slash command, /fork slash command. NONE of these is
  in a reactive/auto-respawn path. Within-launch spawn budget is
  bounded at ~initialSessions × claude × ~5 MCP grandchildren ≈ 20
  processes per launch.
- No setInterval / setTimeout / event-handler spawn.
- The original fork-bomb diagnosis (cross-launch accumulation via
  SIGKILL → orphans + own children) appears correct.

But the user is right that the defense is weak in another sense:
the orphan reap window is hours/days. We need a structural primitive
that closes that window.

Recommend: PR_SET_PDEATHSIG on Linux + pid-watcher process on macOS
(kqueue NOTE_EXIT) so children self-terminate when parent dies.
Optional follow-up.

(GPT-5.4 Pro review was launched but didn't return — recover via
/tmp/llm-*.txt or bun llm recover post-compact.)

### B. Test failures — bun run test:all results 2026-04-26 12:01

83 failures / 22443 total (99.6% pass). Breakdown:

- vendor: 53 failures across 20 files
  - vendor/bearly/plugins/llm/tests/* (4 files, ~10 failures)
  - vendor/silvery/tests/features/{click-to-position, pipeline-bugfixes,
    scope, text-frame, use-ag-node, box-in-text-warning,
    inline-scrollback-promotion}.test.tsx
  - vendor/silvery/tests/examples/{ai-chat, aichat-inline-bugs}.test.tsx
  - vendor/silvery/tests/{hooks/useBoxMetrics, memory/memory,
    perf/termless-memleak-harness}.test.tsx
  - vendor/flexily/tests/silvercode-gutter-bug.test.ts
  - vendor/termless/{packages/viterm/tests/matchers, tests/integration}.test.ts
  - vendor/bearly/plugins/recall/tests/history/recall.test.ts

- slow: 30 failures across ~7 @km/tui files
  - apps/@km/tui/tests/card-rendering.slow.test.ts (~9: borders + date badge)
  - apps/@km/tui/tests/board-zoom.slow.spec.ts (~2: incremental mismatch +
    selection bg)
  - apps/@km/tui/tests/board-features.slow.spec.ts (~3: search, truncation)
  - apps/@km/tui/tests/inline-edit.slow.spec.ts (~1: indentation parity)
  - apps/@km/tui/tests/detail-pane.slow.test.ts (~1: header bar fallback)
  - apps/@km/tui/tests/production-entry.slow.spec.ts (~3: keypress latency
    perf, td chord)

- fuzz: 7 failures
  - apps/@km/tui/tests/navigation-fuzz.fuzz.ts (4: comprehensive, basic,
    zoom, view-mode)
  - apps/@km/tui/tests/render-fuzz.fuzz.ts (1: scrolling-tiny seed=42 ×2)
  - vendor/silvery/tests/features/listview-scroll-properties.fuzz.tsx
    (property: 4 invariants under random combinations)

### C. Typecheck errors

- 210 non-vendor TS errors (apps/ + packages/)
- 361 vendor TS errors

## Already shipped this session (post-trigger)

- f23bd709 silvery + cee5d97b6 km: ListView thumb size honors measured
  total when items taller than estimate (silvercode chat thumb fix)
- a1753a726: /raw debug view — inline hidden context on user messages
- 1c9d52116: assistant text + tool calls derived from blocks on replay;
  bullet trailing-space stable
- f5c1f3257: parse.ts strips system-reminder + command wrapper tags
- 316d8dbbf: bun run format:check — fail-loud wrapper around oxfmt --check
- c4574472d: tree-wide oxfmt sweep + 4 submodule sweeps + pointer bumps

## Plan

1. Spawn parallel Task agents per cluster (3-5 max concurrent)
2. Worktree-isolate any agent touching vendor/silvery or vendor/bearly
   (multiple may need same submodule)
3. TDD where appropriate; for fuzz failures, capture the seed first
4. Report to this bead; close child beads as they ship
5. Re-run test:all when most clusters done; surface remaining

## Dependencies

- (B) and (C) are largely orthogonal — typecheck doesn't depend on test
  fixes (and vice versa)
- (A) is a single-author rewrite, not a parallel-agent target
- Some test failures may BE typecheck failures masquerading; cross-check