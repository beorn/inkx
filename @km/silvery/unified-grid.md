---
mentions:
  - km
  - claude
id: "@km/silvery/unified-grid"
aliases:
  - km-silvery.unified-grid
  - km-silvery-unified-grid
created_by: claude:fed8de9e
created_at: 2026-03-24T17:14:36Z
closed_at: 2026-03-25T18:02:44Z
close_reason: "This was the original era2a tracking bead. All work completed
  across era2a Phases 1-6 + cleanup: TextFrame (Phase 1), term.paint (Phase 2),
  createAg (Phase 3), tree mutation (Phase 4), compose plugins (Phase 5), barrel
  cleanup (Phase 6), withReact + withTest (cleanup). The 'unified grid' =
  TextFrame, which is now the universal output type across silvery and
  termless."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Unified grid type across silvery + termless — same shape everywhere @km/silvery #feature #P1 @claude:fed8de9e

## Era 2a: Rendering Foundation

Decompose silvery's fragmented rendering API into clean primitives. No TEA, no commands, no signals — just the core.

### Problems solved

- 6+ types for 'styled text rectangle' → one TextFrame type everywhere
- 3 confusing return types (App, RunHandle, AppHandle) → one app from render()
- Testing API inconsistency (createRenderer vs createTermless vs run) → render(element, term)
- Monolithic App → ag (tree + engine), term (I/O), TextFrame (output)
- Opaque runPipeline → layout() → render() → paint(), each independently useful
- No shared silvery ↔ termless type → both produce TextFrame

### Core objects

- **ag** = createAg({ engine? }) — tree + layout engine + ag.layout(dims) + ag.render() → TextFrame
- **term** = createTerm(process | TermDef) — dims + optional paint/events/caps/cursor/screen
- **TextFrame** = immutable cell grid output — .text, .lines, .cell(), .containsText()

### Plugin composition

create() → withAg() → withTerm(term) → withReact({ view })

### Design doc

vendor/silvery/docs/design/app-composition.md

### Deferred to era2b

Commands, keymaps, signals, withScope, withApp, domain plugins

