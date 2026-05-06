---
mentions:
  - km
id: "@km/silvery/sgr-pixel-mouse-scrollbar-drag"
aliases:
  - km-silvery.sgr-pixel-mouse-scrollbar-drag
  - km-silvery-sgr-pixel-mouse-scrollbar-drag
created_at: 2026-05-05T00:00:00.000Z
type: feature
priority: P1
status: wip
assignee: codex
---

# [ ] [feature] SGR-pixel mouse coordinates for smoother scrollbar drag @km/silvery #feature #P1

blocks:: [[@km/silvery]]
related:: [[@km/silvery/listview-visible-content-anchoring]]

## Problem

Silvery currently enables xterm mouse tracking with modes `1003` and `1006`.
That gives us all mouse motion events, but coordinates arrive in terminal cell
rows/columns. For long scroll surfaces, one cell of vertical thumb movement can
map to several transcript rows, so dragging the scrollbar feels chunky even
after fixing drag recentering and mid-drag geometry remapping.

Terminals that support SGR-Pixels mode `1016` can report mouse positions in
pixels using the same SGR response shape as `1006`. Silvery should use this
when available and feed higher-resolution coordinates to scrollbar dragging,
at minimum.

## Acceptance Criteria

- [x] Add a capability-gated way to enable xterm SGR-Pixels mouse mode `?1016h`
      together with existing `1003`/`1006` mouse tracking.
- [x] Settle and implement the public mouse coordinate API before wiring the
      runtime. Decision after user review: `mouse.x`/`mouse.y` remain Silvery
      layout coordinates, matching `Rect.x`/`Rect.y`, and may be fractional;
      `mouse.clientX`/`mouse.clientY` carry physical pixel coordinates only
      when SGR-Pixels mode is active.
- [x] Extend mouse parsing/types to preserve both fractional cell coordinates
      and raw high-resolution pixel coordinates when pixel mode is active.
- [x] Convert pixel coordinates into fractional cell coordinates using terminal
      text metrics where available, falling back cleanly to integer cells.
- [x] Make `run()` default to the best safe mouse coordinate mode: probe
      terminal cell metrics for `mouse: true`, enable `1016` when sane, and
      keep the existing `1003`/`1006` behavior when probing fails.
- [x] `Scrollbar` uses fractional terminal-cell `y` coordinates for thumb
      dragging, so slow drags can update more finely than one terminal row.
- [x] Track clicks and wheel scrolling keep existing behavior.
- [x] Unsupported terminals keep current `1003`/`1006` behavior with no broken
      mouse input.
- [x] Termless/test helpers can synthesize pixel-mode mouse events or otherwise
      cover the parser and scrollbar drag path.
- [x] Focused tests cover:
      - `1016` enable/disable sequence selection;
      - parsing pixel-mode SGR mouse events;
      - scrollbar consumes layout `event.y` rather than cell-only
        `event.clientY`;
      - fallback path remains cell-granular and stable.

## Implementation Notes

- Current code paths to inspect first:
  - `vendor/silvery/packages/ansi/src/terminal-control.ts`
  - `vendor/silvery/packages/ag-term/src/mouse.ts`
  - `vendor/silvery/packages/ag/src/mouse-event-types.ts`
  - `vendor/silvery/packages/ag-term/src/mouse-events.ts`
  - `vendor/silvery/packages/ag-react/src/ui/components/Scrollbar.tsx`
  - `vendor/silvery/packages/test/src/index.tsx`
- Do not assume every terminal supports `1016`. Prefer capability/profile
  gating or a conservative opt-in first.
- Existing immediate fixes should remain: scrollbar hover hitbox stays mounted,
  thumb mousedown preserves grab offset, and drag geometry is frozen for the
  duration of a drag.

## 2026-05-05 Status Notes

- Trigger: scrollbar drag in long Silvercode sessions still moves in coarse
  terminal-cell increments. Earlier fixes removed drag recentering and frozen
  geometry jumps, but terminal mouse granularity remains the limiting factor.
- Current Silvery mouse stack:
  - `enableMouse()` enables xterm `1003` all-motion tracking and `1006` SGR
    coordinate encoding.
  - `ParsedMouse.x`/`ParsedMouse.y` currently mean 0-indexed terminal-cell
    coordinates.
  - `SilveryMouseEvent.clientX`/`clientY` currently also mean terminal-cell
    coordinates, despite DOM naming.
- API direction under review:
  - Avoid `row`/`col` for mouse events for now because Silvery geometry is
    consistently `x`/`y` (`Rect`, `boxRect`, `screenRect`, `scrollRect`,
    hit-testing).
  - Prefer `x`/`y` as Silvery-space pointer coordinates: terminal cells,
    fractional when pixel mode is active.
  - Prefer `clientX`/`clientY` for physical pixels because that matches DOM
    expectations and future canvas/DOM/native backends.
  - This may be a breaking public mouse event API cleanup; the user explicitly
    does not want compatibility aliases if the old naming is wrong.
- `/pro` review completed for this API decision. It preferred `row`/`col` for
  terminal grid coordinates and `clientX`/`clientY` for pixels. User pushed
  back that DOM also has `rect.x`/`rect.y`, and Silvery already uses `x`/`y`
  pervasively for layout rects. Final decision: prioritize the Silvery layout
  invariant over DOM event aliasing:
  - `event.x`/`event.y`: Silvery layout coordinates, comparable to `Rect.x`/
    `Rect.y`; fractional terminal cells in SGR-Pixels mode.
  - `event.clientX`/`event.clientY`: physical pixel coordinates, optional.
  - Context bundle: `/tmp/silvery-sgr-pixels-api-pro-context.md`
  - Output file:
    `/var/folders/x6/0j792q0d0411wgsxyr1bqkp40000gn/T/llm-manual-review-the-proposed-sgr-pixels-mnhm.txt`
- A provisional failing test file was started at
  `vendor/silvery/tests/features/sgr-pixels-mouse.test.ts`; revise it to the
  final `x`/`y` + optional `clientX`/`clientY` contract before implementation.

## 2026-05-05 Implementation Notes

- Implemented explicit SGR-Pixels opt-in:
  - `enableMouse({ pixels: true })` emits `1003h + 1006h + 1016h`.
  - `disableMouse()` always emits `1016l + 1006l + 1003l`.
  - `modes.mouse("pixel")`, `run({ mouse: { coordinateMode: "pixel", cellSize } })`,
    `createApp(..., { mouse: { coordinateMode: "pixel", cellSize } })`, and
    `render(..., { mouse: { coordinateMode: "pixel", cellSize } })` all wire
    parser + terminal mode consistently.
- Final event contract:
  - `ParsedMouse.x`/`y` and `SilveryMouseEvent.x`/`y` are Silvery layout
    coordinates, comparable to `Rect.x`/`Rect.y`.
  - In SGR 1006 mode they are integer terminal cells.
  - In SGR-Pixels 1016 mode they are fractional terminal cells derived from
    `clientX`/`clientY` and the supplied cell size.
  - `clientX`/`clientY` are optional physical pixel coordinates.
- Implemented safe defaulting in `run()`:
  - For `mouse: true` or omitted fullscreen mouse config, Silvery probes text
    area pixels (`CSI 14 t`) and text area cells (`CSI 18 t`), validates sane
    positive cell metrics, and enables SGR-Pixels automatically.
  - If either probe fails or reports implausible metrics, Silvery keeps the
    previous cell-mode `1003`/`1006` behavior.
  - Explicit `mouse: false`, `mouse: { coordinateMode: "cell" }`, and
    `mouse: { coordinateMode: "pixel", cellSize }` remain deterministic.
- Updated Silvery docs:
  - `docs/reference/input-features.md`
  - `docs/reference/terminal-capabilities.md`
  - `docs/api/term-modes.md`
  - `docs/reference/terminal-matrix.md`
  - `docs/guide/event-handling.md`
  - `docs/reference/lifecycle.md`
  - `docs/guide/input-limitations.md`
- Verification:
  - `bun vitest run --project vendor vendor/silvery/tests/features/sgr-pixels-mouse.test.ts vendor/silvery/tests/features/scrollbar-component.test.tsx vendor/silvery/tests/features/listview-scroll-to-bottom-button.test.tsx vendor/silvery/tests/features/modes.test.ts vendor/silvery/tests/runtime/render-mouse.test.tsx vendor/silvery/tests/runtime/run-mouse-pixels-auto.test.tsx vendor/silvery/tests/features/inline-mouse-default.test.tsx`
    -> 7 files, 53 tests passed.
  - `npx tsc --noEmit` from `apps/silvercode` passed.
  - `bun x oxfmt --check ...` for touched Silvery source/test files passed.

