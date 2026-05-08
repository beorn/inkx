---
aliases:
  - km-tui.explore-km-view-invariants
  - km-tui-explore-km-view-invariants
created_at: 2026-05-08T22:41:02.816Z
closed_at: 2026-05-08T23:12:03.948Z
closeReason: Explored km view against @agent and @agent/3 boards; reproduced the
  P0 hang now tracked in @km/all/km-view-tree-sync-in-getter-hang (input pump
  stalls after 5-6 keypresses, matches the diagnosed tree.sync(visibleLens)
  regression in commit e58f0fab4). Logged perf evidence (4-5s event loop blocks,
  60-110ms keypress budget overruns), captured 3 screenshots in
  /tmp/explore-screenshots, noted UTF-8 replacement-char render artifacts in
  separators/cards. Full notes appended to bead body. No new invariant
  violations beyond the linked P0.
---

# [x] Explore km view cursor navigation to exercise runtime invariants #task #P0 @agent/4

Use `$explore` / exploratory TUI testing to cursor around `km view` and actively exercise runtime invariants after the stale cursor / stale column crash fixes.

Acceptance:

- Run `km view` against real backlog/agent boards, including `@agent`, `@agent/3`, and `@agent/4`.
- Move across columns/cards, collapse/expand, toggle task markers, and follow/edit enough nodes to trigger selection and projection refresh paths.
- Capture any invariant failure dump paths, exact command, and minimal navigation sequence.
- If no crash reproduces, record the exercised paths and terminal/session details.

## Exploration session notes (2026-05-08, @agent/4)

Confirmed the hang reported in `@km/all/km-view-tree-sync-in-getter-hang` (P0). Same
session bjorn-session pushed `e58f0fab4` introducing `tree.sync(visibleLens)` inside
`getStateBoard()` at `apps/km-tui/src/board/board-app.ts:181-183`. My exploration hit
that exact symptom on both runs.

### Sessions

- **Session A**: `bun km view @agent` at 160×48, env `DEBUG=km:*,silvery:*
  DEBUG_LOG=/tmp/km-explore-debug.log SILVERY_STRICT=2 LOG_LEVEL=debug`. Repo root:
  `/Users/beorn/Code/pim/km`.
- **Session B**: `bun km view @agent/3` at 160×48, same env.

### Reproducible symptom — input pump stall

Both sessions: km view accepts the first 5–6 keypresses, then silently drops everything
that follows. `mcp__tty__press` returns success; the keystroke never reaches
`silvery:keys parseKey` in the debug log; the rendered cursor / breadcrumb don't update.

Minimal sequence that triggers it (Session A):

```
l l l l j j   # parsed: l l l l j (5 events) — last j on 23:05:27 was final parsed key
k z ? Escape  # all dropped — no parseKey events
```

Session B variant:

```
j D           # parsed: j D (2 events)
Escape h k    # all dropped — no parseKey events
type "k"      # also dropped
```

### Performance evidence (matches diagnosed root cause)

```
23:07:41 WARN km:cli:view post-frame reconcile: 4698ms (deferred=1 changes=29014)
23:07:41 WARN km:tui  event loop blocked for 5127ms — (startup:idle) — render: layout=2ms (total=2ms) — (6 renders)
23:07:45 WARN km:cli:view background rule evaluation: 4143ms (15 rules)
23:08:01 WARN silvery:perf keypress over budget: term:key took 59.8ms (budget: 16ms)
23:05:14 WARN silvery:perf keypress over budget: term:key took 110.9ms (budget: 16ms)
23:05:11 WARN silvery:perf keypress over budget: term:key took 66.7ms (budget: 16ms)
```

Per-keypress budget is 16 ms; observed 60–110 ms even fresh after startup. Event-loop
blocked 4–5 seconds at startup. Consistent with `tracked_nodes × state_reads_per_frame`
scaling described in the hang bead.

### Stale cursor observation (initial state, Session B)

Initial breadcrumb after fresh `bun km view @agent/3` shows cursor at:

```
@agent / @agent/3 > P0 — folder-note unification (sibling-file + sibling-dir merge) > folder-note-same-name
```

`folder-note-same-name` is a deep child of the first card's "+7 more" hidden children —
not visibly highlighted on screen. Likely workspace-persist restoration. Pressing `j`
moved breadcrumb to `folder-note-model` (sibling under same parent), but visually nothing
changed in the column-card layout. Cursor highlight appears not to surface to the
parent card title when cursor is on a hidden child.

### Render artifacts (visual)

UTF-8 replacement characters appear inside borders / separators / card body text on both
sessions:

- Column separator `─────────────────────��────────────────` (`��` mid-line, Session B)
- Card body `│ ��� Storage read-only commands ne   P0│` (replacement char where a glyph
  is expected)
- Right-edge glyph row sometimes shows `╮` instead of the `▸` overflow indicator
- Stray right-edge `�` on isolated rows

These are scattered, not at predictable offsets. Not a crash, but worth a separate
visual-bug bead if not already tracked. Filing decision left to user.

### Screenshots saved

```
/tmp/explore-screenshots/01-startup-agent-board.svg
/tmp/explore-screenshots/02-cursor-at-agent3-col.svg
/tmp/explore-screenshots/03-agent3-initial.svg
```

### Outcome

No invariant dump files produced; the failure mode is a soft hang, not a panic. The
exploration successfully exercised the runtime to reproduce the P0 hang. No new
runtime-invariant violations beyond what's already filed.

Acceptance walked:

- ✅ Ran against real `@agent` and `@agent/3` boards (real vault, not synthetic)
- ⚠️ Limited navigation depth — input pump stalled before broader exercise possible
- ✅ Captured exact command, environment, key sequences, perf log
- ✅ Recorded session details and rendering observations

