---
id: "@km/silvery/selection/2-selection-extensibility-design-open-sub-selection-"
aliases:
  - km-silvery.selection.2
  - km-silvery-selection-2
  - "@km/silvery/selection/2"
created_by: Bjørn Stabell
created_at: 2026-04-04T15:40:00Z
closed_at: 2026-04-04T21:20:34Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Selection extensibility design — open sub-selection registry, per-node signal architecture, pointer state extensibility @km/silvery #task #P2 @Bjørn Stabell

## Context

The current @silvery/selection implementation is a correct minimal first cut for km. But the extensibility points identified in code review need design decisions before the system can serve canvas/diagramming use cases.

## Questions to resolve

### 1. Open vs closed sub-selection registry

Current: SubSelection is a closed union (TextSelection | PathSelection | CropSelection). Adding edge, gap-cursor, or cell-rect requires editing types.ts.

Options:
- **A: Open union** — `{ kind: string; [key: string]: unknown }` with typed accessor factories: `createSubAccessor<T>(sel, kind)`. Apps register new kinds without editing the package.
- **B: Keep closed, extend via forking** — km owns the package, edits directly. Canvas apps fork or extend.
- **C: Generic type parameter** — `createSelection<Sub extends SubSelection>(app)` where Sub is app-defined.

Recommendation: C — generic type parameter. The store stays typed, apps define their union. No runtime registration, no stringly-typed dispatch.

### 2. Pointer state extensibility

Current: PointerState is a fixed union of 7 phases. Adding pointing-handle, pointing-edge (from landscape doc) means editing the union.

Options:
- **A: Open phases** — pointer state as `{ phase: string; hit: PressHit; origin: Point }`. App provides phase-specific transition logic.
- **B: Nested state machines** — core handles pointing/dragging lifecycle, apps nest sub-states (like tldraw crop sub-state machine).
- **C: Keep closed, add phases as needed** — the 7 phases cover tree/text. Canvas adds pointing-handle etc. when built.

Recommendation: B — nested state machines. Core handles idle→pointing→dragging lifecycle. Apps can nest tool-specific states within each phase without changing the core union.

### 3. Per-node signal architecture

Current: Not implemented. Design doc describes fixed property bag (selected, hovered, armed, focused, dropTarget).

Options:
- **A: Fixed property bag on ag node** — `agNode.selected`, `agNode.hovered` etc. as alien-signals. Simple, discoverable. Limited to predefined signals.
- **B: Open signal map on ag node** — `agNode.signals.get("selected")`. Extensible (apps add custom signals). Less discoverable. Keyed by string.
- **C: External map per system** — selection store keeps `Map<ID, Signal<boolean>>` separately. Pointer system keeps its own. No modifications to ag node shape. Most compositional.
- **D: Hybrid** — fixed core signals (selected, hovered, focused) as properties on ag node + open `agNode.meta` signal map for app-specific state (pinned, validationError, etc.).

Recommendation: D — hybrid. Core interactive signals are typed properties (discoverable, auto-styled by theme). App-specific signals go in an open meta map.

Key design decisions for D:
- **Lifecycle**: reconciler creates/destroys signal properties when ag nodes mount/unmount. Selection store writes on change. On remount, store re-applies from its internal set.
- **Multiple writers**: each system (selection, pointer, focus) writes its own signal. No coordination needed — signals are independent.
- **Theme integration**: silvery default theme reads core signals (node.selected → highlight, node.hovered → subtle highlight, node.focused → focus ring). Apps override via custom styles.

### 4. SelectionSnapshot extensibility

Current: fixed shape with cursor/anchor/ids/sub/root. No slot for app-specific metadata (km visualMode, curswantX/Y).

Options:
- **A: Extra state slot** — `SelectionSnapshot & { meta?: Record<string, unknown> }`. Apps store anything. Not typed.
- **B: Keep it out** — app-specific state lives outside the selection store (km already handles visualMode/curswantX as app code). Selection store stays generic.

Recommendation: B — keep app-specific state outside. The selection store is the SHARED selection state. App-specific navigation hints (sticky cursor) and mode flags (visual mode) are app concerns.

### 5. op() proxy for mutation interception

Current: not implemented. Designed in vendor/internal/silvery/design/v15-tea/app.md.

When implemented: `op(sel).node.select([id])` routes through apply() for logging/undo/replay. This IS the extensibility mechanism for mutation observation — no need for a separate middleware pattern.

## /complete
- Design decisions documented in selection-model.md
- Types updated if option C (generic type param) chosen for sub-selections
- Per-node signal architecture specified in enough detail to implement