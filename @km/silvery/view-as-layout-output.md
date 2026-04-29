---
id: "@km/silvery/view-as-layout-output"
aliases:
  - km-silvery.view-as-layout-output
  - km-silvery-view-as-layout-output
created_by: claude:2405c72e
created_at: 2026-04-25T06:08:01Z
closed_at: 2026-04-25T21:16:56Z
close_reason: "All 6 phases shipped. Phase 1: audit doc at
  docs/audit/use-layout-rect-callers.md. Phase 2: cursor (bd6a94f8 + fc798f8c).
  Phase 3: ListView (72b8fa52 + d28ae1d2). Phase 4a: focus (7b56b5c2). Phase 4b:
  selection (da040837). Phase 5+6: sweep + doc + lint heuristics (9c052c4b). km
  bump: 761eb68bc. Substrate complete; TEA can build on top. Lint passes 0
  violations across 569 files."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.view-as-layout-output
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-24T23:08:05Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Treat cursor/selection/focus as layout outputs (not effect outputs) @km/silvery #feature #P1

blocks:: [[@km/silvery/selection-focus-plateau]]

## Problem reframe

Components in km / silvercode / @km/tui call `useBoxRect` / `useScrollRect` / `useScreenRect` / `useCursor` to read layout dimensions at React render time. The signal-effect bridge (alien-signals → useLayoutEffect → forceUpdate) inherently has 1-frame stale-read latency: the FIRST render of a consumer sees `{height: 0, width: 0}` (or `null` cursor state) because layout hasn't run yet. Subsequent renders settle, but tests, fast UI moments, and conditional-mount paths show the wrong output.

Every consumer of these hooks is a candidate for "X returns 0 on first render":

- `km-silvercode.cursor-startup-position` (P1, open) — useCursor → useScrollRect chain returns null/0 on conditional CommandBox mount → cursor parks at side-panel
- `km-silvercode.message-wrap-truncation` (P1, open) — MessageList reads `useBoxRect().height = 0` on first render → passes `height={1}` to ListView → content clipped to 1 visual line
- `km-silvery.selection-focus-plateau` (P0 epic) — selection rect derivation suffers same async lag
- `km-silvery.focus-ink-parity` (P0 epic) — focus dispatch/highlight same pattern
- Future bugs in the same class — every new useBoxRect caller is a candidate

The narrow framing (just add cursorRect/selectionRange/focusedNodeId signals) addresses 3 specific consumers but leaves the underlying anti-pattern in place. New `useBoxRect` callers will keep hitting the same wall.

## The deep reframe

**Components don't read layout dimensions in their render.** They describe semantic intent via props; the layout engine fills in dimensions. The `useBoxRect` family becomes refs+onLayout-only (which fire AFTER layout — no stale reads possible) for the rare imperative-measurement use cases.

| Today (broken) | After (correct) |
|---|---|
| `MessageList` reads `useBoxRect().height`, passes to ListView | ListView is `flex-grow=1 overflow=scroll`, virtualizes by INDEX RANGE around cursor (not pixel-height) |
| `useCursor` reads `useScrollRect`, computes absolute coords | TextArea sets `cursorOffset={col,row}` prop on its Box; layout phase computes absolute |
| `useSelection` reads node rects to position highlights | Selection range declared as AgNode metadata, layout computes absolute rects |
| `useFocus` reads node rect for focus ring | Focus state declared as AgNode metadata, layout computes |
| Modal popover reads parent rect to position | Position via flex (sticky, anchor=, absolute+top/right) — no pixel math in components |
| Tooltip / hover popover reads cursor rect | Layout-phase output: cursor is a known position; popover anchors to it via flex |

Layout-signals get NEW peer signals (peer of `boxRect`/`scrollRect`/`screenRect`):
- `cursorRect: WritableSignal<Rect | null>` — computed in layout from AgNode's `cursorOffset` + parent's `scrollRect`
- `selectionRange: WritableSignal<SelectionRange | null>` — computed from AgNode's `selectionState`
- `focusedNodeId: WritableSignal<string | null>` — computed from focus tree

The scheduler reads these signals (instead of cursor / selection / focus stores) when emitting ANSI. The signals update as layout updates — sync, no effect chain.

## Phased plan (deep — ~1 week)

### Phase 1 — Audit (½ day)

`grep -rn "useBoxRect\|useScrollRect\|useScreenRect\|useCursor" apps/ vendor/silvery/` and classify each caller:
- (a) Replaceable with flex/CSS props (most — wrap, viewport, layout containers)
- (b) Replaceable with ref + onLayout (some — components that need imperative measurement post-mount)
- (c) Genuinely needs reactive dimension at render time (rare — keep with a doc-tagged caveat and the documented "first frame returns 0" expectation)

Output: `docs/audit/use-layout-rect-callers.md` with classification.

### Phase 2 — Cursor as layout output (1-2 days)

1. Add `cursorOffset?: {col: number, row: number, visible?: boolean, shape?: CursorShape}` to `AgNode` props (vendor/silvery `packages/ag/src/types.ts`)
2. Add `cursorRect: WritableSignal<Rect | null>` to `LayoutSignals` (peer of boxRect/scrollRect)
3. In `notifyLayoutSubscribers` / `syncRectSignals`: compute cursorRect from `node.cursorOffset` + parent's `scrollRect`
4. Scheduler reads `layoutSignals.cursorRect()` instead of `cursorStore.getCursorState()`
5. TextArea/TextInput pass `cursorOffset` as prop instead of calling `useCursor`
6. Deprecate `useCursor` (one-cycle wrapper that internally sets the prop via reconciler injection) — delete in next cycle
7. Closes `km-silvercode.cursor-startup-position` end-to-end (test process-harness regression goes green)

### Phase 3 — ListView height-independence (2 days)

Rewrite `vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx` to NOT depend on `useBoxRect()`-derived `height`:

1. Drop the `height` prop entirely (or keep as optional override). Default behavior: `flex-grow=1 overflow=scroll`, fills parent's available height naturally.
2. Replace pixel-height virtualization with **index-window virtualization**: render N items around the cursor (e.g., `cursor-overscan` to `cursor+overscan`), let parent's `overflow=scroll` clip what doesn't fit. N defaults to a generous bound (~50) so most lists never feel virtualized.
3. Keep `MeasuredItem` for the per-item layout reporting that callers like grid/onLayout still want.
4. `MessageList` stops calling `useBoxRect()`; just renders `<ListView items={...}>` and lets flex propagate.
5. Closes `km-silvercode.message-wrap-truncation` end-to-end (regression test goes green).

### Phase 4 — Selection + focus as layout outputs (2 days)

Same pattern as cursor:
- Add `selectionRange` / `focusedNodeId` to LayoutSignals
- Components declare via props (not via store + hook)
- Selection-renderer + focus-renderer read from signals
- Deprecate `useSelection` / `useFocus` hooks (one-cycle back-compat wrappers)
- Closes leaf bugs under `km-silvery.selection-focus-plateau` and `km-silvery.focus-ink-parity`

### Phase 5 — Migration of remaining useBoxRect callers (1 day)

Walk through Phase 1 audit's (a) and (b) classifications, migrate each:
- (a): replace with flex props (wrap, flex-grow, sticky, etc.)
- (b): keep ref+onLayout pattern (already correct — fires after layout)

Document the rare (c) callers with `// LAYOUT_READ_AT_RENDER: <reason>` comments + lint rule that warns on new uses.

### Phase 6 — Lint rule + docs (½ day)

- Lint rule in @km/infra: warn on `useBoxRect` / `useScrollRect` / `useScreenRect` callers in render (allow in refs + onLayout). Rule docs link to migration guide.
- `vendor/silvery/docs/guide/layout-as-output.md` explaining the pattern + migration examples.

## Acceptance

- [ ] `km-silvercode.cursor-startup-position` test process-harness regression: cursor lands at command region on first frame after CommandBox mount
- [ ] `km-silvercode.message-wrap-truncation` regression test passes (long paragraphs wrap to multiple lines through MessageList → ListView)
- [ ] All Phase 1 audit (a)+(b) callers migrated
- [ ] Lint rule warns on new useBoxRect-in-render uses
- [ ] No regressions in existing tests (`bun run test:fast` clean)
- [ ] silvercode + @km/tui consume the new model with zero `useState`+`setNode` propagation dances
- [ ] Pattern doc at `vendor/silvery/docs/guide/layout-as-output.md`

## Effort summary

~1 week sequential. Phases 2-4 are independent and could parallelize across worktree-isolated agents.

## What this UNBLOCKS

- TEA can adopt the same primitives (signals as source of truth, declarative props) without re-doing this work
- Authoring elegance (`km-silvery.authoring-elegance`) becomes simpler — plugin authors don't deal with useBoxRect timing
- Future selection / focus / cursor / popover work all sit on the same substrate

## What this is NOT

- NOT a full TEA migration — that's separate. This is the layout-output substrate that TEA can build on.
- NOT a deletion of layout-signals — the signals stay; we just stop bridging them through React effects in components.
- NOT a rewrite of yoga / flexily — the underlying layout engine is unchanged; we change WHO reads its outputs.

## References

- `apps/silvercode/tests/visual/message-wrap-truncation.test.tsx` — failing regression test pinning the bug
- `vendor/silvery/tests/features/cursor-conditional-mount.test.tsx` — failing regression test for cursor-startup
- `vendor/silvery/packages/ag/src/layout-signals.ts` — current layout-signals module (where new peer signals go)
- `vendor/silvery/packages/ag-term/src/pipeline/layout-phase.ts:381` — `notifyLayoutSubscribers` (where new signals get computed)
- `vendor/silvery/packages/ag-term/src/scheduler.ts:564-576` — current cursor-suffix emission (would read from layout-signals)
- `hub/silvery/design/v15-tea/DESIGN.md` — TEA design doc (this work is independent of TEA but compatible)
- `km-session.0424-silvercode` /big analysis (2026-04-25) — surfaced the deep reframe over the narrow original