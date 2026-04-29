---
id: "@km/inkx/scrollback-resize"
aliases:
  - km-inkx.scrollback-resize
  - km-inkx-scrollback-resize
created_by: claude:891e3ce1
created_at: 2026-03-02T15:56:07Z
closed_at: 2026-03-02T18:05:56Z
---

# [x] Inline mode resize: frozen scrollback items disappear on terminal resize @km/inkx #bug #P1 @beorn

## Bug

When resizing the terminal while running an inline-mode app with frozen scrollback items (e.g., static-scrollback.tsx), the frozen items that were written to terminal scrollback disappear.

## Repro

1. bun vendor/beorn-inkx/examples/interactive/static-scrollback.tsx
2. Let it run until several exchanges are frozen (pushed to scrollback)
3. Resize the terminal (drag window edge)
4. Frozen items vanish - only live content remains

## Investigation (3+ sessions, 40+ turns)

### What was implemented (all passing tests, failing in real app)

1. Reactive width tracking in ScrollbackView - useState + useEffect on process.stdout resize
2. Resize re-emission path in useScrollback - useLayoutEffect([width]) clears screen, re-emits frozen items
3. Double-write prevention - resize useLayoutEffect syncs prevFrozenCountRef
4. resetInlineCursor wiring - Runtime interface, create-runtime.ts, run.tsx StdoutContext
5. Output phase resetInlineState - callable interface with forceFirstRender flag

### Deep Research Finding (O3)

The output phase first-render path (after resetInlineCursor) receives scrollbackOffset but does NOT use it. After reset: prevCursorRow=-1 means no clear prefix, forceFirstRender=true means prev=null, and updateInlineCursorRow sets tracking WITHOUT accounting for frozen items above.

### Testing Gap

Tests use createRenderer (pipeline only, no output phase stdout writes). The real app uses run() which goes through doRender -> reconciler -> flushSyncWork -> executeRender -> runtime.render -> outputPhaseFn. The interaction between useScrollback stdout writes (during flushSyncWork) and output phase stdout writes (during runtime.render) is NEVER tested.

### Event Sequence on Resize

1. process.stdout emits resize
2. Synchronous: ScrollbackView setTermWidth, example compact() (freezes all), runtime pushes resize event
3. Event loop: processEvent(resize) -> prevTermBuffer=null, invalidate, scheduleRender
4. doRender: reconciler applies state, flushSyncWork fires useLayoutEffect:
   - useScrollback detects width change
   - resetInlineCursor (resets output phase)
   - Writes ESC[9999A CR ESC[J (clear visible screen)
   - Re-emits ALL frozen items to stdout
   - notifyScrollback(N) sets scrollbackOffset=N
5. runtime.render: consumes scrollbackOffset=N, calls outputPhaseFn(null, buf, inline, N, termRows)
   - Output phase: forceFirstRender, prev=null, no clear prefix
   - Writes bufferToAnsi from cursor position (after frozen items)

## Key Files

- useScrollback.ts - resize re-emission useLayoutEffect
- output-phase.ts - first render path, cursor tracking, updateInlineCursorRow
- run.tsx - event loop, doRender, resize handling
- create-runtime.ts - runtime.render, scrollbackOffset, resetInlineCursor
- ScrollbackView.tsx - width tracking, renderFrozen
- scrollback-resize.test.tsx - unit tests (pass but no output phase coverage)
- static-scrollback.tsx - repro app

## Next Steps

1. Add DEBUG_LOG instrumentation to see ACTUAL bytes written during resize
2. Write integration test through run() with ScrollbackList + resize capturing all stdout writes
3. Fix based on actual byte trace