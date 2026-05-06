# Post-resize UI instability — diagnosis hypotheses

Bead: `@km/silvercode/post-resize-ui-stability`
Date: 2026-05-06
Status: hypotheses (static analysis only — live trace not yet run)

## Symptom

After a terminal resize, silvercode's UI shuffles visibly across multiple frames before settling. Should converge in ≤2 paint passes after a single SIGWINCH.

Live repro:

```
SILVERY_STRICT=1 DEBUG='silvery:*,silvercode:*' DEBUG_LOG=/tmp/silvercode-strict2.log silvercode --resume claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f
```

## Ranked suspects

These are static-analysis hypotheses from the Phase 0 Explore agent. Each one needs a failing test (Phase 1/2) before being treated as a confirmed cause.

### 1. Multi-pass layout feedback in silvery — `notifyLayoutSubscribers` (framework, HIGH)

- **Location**: `vendor/silvery/packages/ag-term/src/pipeline/layout-phase.ts:433-496` (`notifyLayoutSubscribers`).
- **Mechanism**: Resize → layout calc → notify subscribers → React forceUpdate per `useBoxRect` consumer → re-render → new `useBoxRect` calls → new rects → notify again. Multiple Pass 2-N cycles until stable.
- **Evidence corroborating**: prior bead `recent-transcript-layout-quality-plateau` already flagged a `MaxListenersExceededWarning` from "repeated `Screen` resize listeners" — listener fan-out per render is a known smell.
- **Fix shape (silvery side)**: batch notifications across a single resize tick OR move width-sensitive state out of render phase into a layout-phase effect.
- **Routing**: needs silvery agent if framework changes are required. App-side mitigations (memoizing context values, stable keys) may reduce the cascade enough that framework patch isn't needed for this bead.

### 2. SessionUpdateList key stability — `itemKey` / `renderItemKey` (app, MEDIUM-HIGH)

- **Location**: `apps/silvercode/src/components/SessionUpdateList.tsx:2176,2189`.
- **Mechanism**: if `itemKey()` or `renderItemKey()` includes a width-derived value, list items remount on resize → state loss → scroll position drift → visual shuffle.
- **Verification**: read the helper definitions, grep for `width` / `cols` / `rect` in their bodies.
- **Fix shape**: keys must be stable across resize. Width-dependent rendering goes through props, not keys.

### 3. Content.Layout context value not memoized (app, MEDIUM)

- **Location**: `apps/silvercode/src/components/Content.tsx:108-150` (`MeasuredLayoutProbe` + `MeasuredLayout`).
- **Mechanism**: `available` is computed inline per render and passed as the `ContentContext` value. Every consumer re-renders on width change because the context object identity flips. No `useMemo` on the context value.
- **Verification**: confirm absence of `useMemo` around the context value at line 145.
- **Fix shape**: `useMemo(() => ({ available, …rest }), [available, …deps])`. One-line stabilization.

### 4. Width-responsive style props triggering incremental cascade (framework, MEDIUM)

- **Location**: `vendor/silvery/packages/ag-term/src/pipeline/render-phase.ts` (incremental render dirty-flag propagation).
- **Mechanism**: if descendants choose colors / gaps / flex props based on width via React conditionals, every breakpoint crossing dirty-flags style props for many nodes simultaneously.
- **Verification**: grep silvercode components for `width >= ` / `cols >= ` / responsive-prop ternaries.
- **Fix shape**: replace render-time width conditionals with theme-per-breakpoint or CSS-class equivalents.

### 5. PaneGrid + SidePanel show/hide remount (app, LOW-MEDIUM)

- **Location**: `apps/silvercode/src/components/PaneGrid.tsx:401-442` + `SidePanel.tsx`.
- **Mechanism**: toggling sidebar may unmount the main content pane subtree (instead of hiding via display/opacity), losing scroll position and triggering a fresh mount cascade.
- **Verification**: trace prop flow when sidebar state flips — does the subtree's React identity persist?
- **Fix shape**: hide via flex/display, not conditional render.

## Coverage by prior fixes

`recent-transcript-layout-quality-plateau` removed one width-derived subtree key in Content.Layout. Suspects 2-5 are not addressed by that fix.

## Verification plan

These are hypotheses, NOT confirmed causes. To confirm each:

1. Build the stability-invariant test helper (Phase 1 of the bead's plan).
2. Author one failing cell per matrix cell (welcome × {paint, resize, sidebar}, chat × {paint, resize, sidebar}).
3. For each failing cell, instrument with `SILVERY_INSTRUMENT=1 DEBUG=silvery:render,silvery:layout` and count dirty cycles per event.
4. Apply the candidate fix from the suspect list; cell should flip green and dirty-cycle count should drop to ≤2.
5. If a fix doesn't flip the cell green, the suspect ranking was wrong — promote the next one.

This protocol is the canonical "instrument first, theorize later" loop for this bug.

## Out of scope here

- Filing /arch retro for the silvery framework changes (Suspect 1, 4) if framework patches are required. Defer until app-side fixes (Suspects 2, 3, 5) are exhausted and a framework fix is provably needed.
