---
id: "@km/silvery/pointer-interaction"
aliases:
  - km-silvery.pointer-interaction
  - km-silvery-pointer-interaction
created_by: Bjørn Stabell
created_at: 2026-04-06T03:52:04Z
---

# [ ] Pointer interaction model — userSelect, draggable, pointerEvents @km/silvery #feature #P2

BLOCKED BY @km/_orphan/7hfik (runtime refactor): ○ @km/_orphan/dfrtr · Pointer interaction model — userSelect, draggable, pointerEvents   [● P2 · OPEN]
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Owner: Bjørn Stabell · Type: feature
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Created: 2026-04-06 · Updated: 2026-04-06
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): DESCRIPTION
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Unified pointer interaction, selection, clipboard, and find system for silvery.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): REVIEWED by GPT 5.4 Pro (2026-04-06): Architecture validated. Six corrections incorporated.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): DESIGN DOC: vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): ## Design Principles (revised after Pro review)
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 1. SELECTABLE BY DEFAULT — root userSelect is text. Zero config.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 2. SELECTION MASK — bit 31 (0x80000000 >>> 0) in Uint32 packing. Abstract as mask concept.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 3. BUFFER LAYER — post-render style composition. Components never re-render.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 4. CONTAIN != OVERFLOW — explicit selection boundary, independent of overflow clipping.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 5. TWO ACCESS MODES, ONE RANGE — mouse + keyboard share SelectionRange, separate controllers.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 6. ALT+DRAG OVERRIDE — configurable modifier. Show hint when drag blocked.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 7. STYLE COMPOSITION — selection is a cell-style transform, NOT re-emitted ANSI overlay.
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): ## Key corrections from Pro review
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 1. Text extraction: add row metadata (softWrapped, lastContentCol) for correct copy
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 2. Style composition: compose selection/find as cell-style transforms before diff/output
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 3. Two-layer clipboard: framework visual copy (plain text) + optional semantic providers (rich)
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 4. Selection hitTest != pointer hitTest: separate modes (pointerEvents vs userSelect)
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 5. Configurable copy trigger: copyOnSelect option, default explicit (y/Ctrl+C)
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 6. Clipboard backend abstraction: OSC 52 default, pluggable backends
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): ## Phases
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 1 — Selection mask + visual selection + correct extraction + contain + explicit copy
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 2 — Word/line selection + visible-buffer find + keyboard copy-mode basics
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 3 — Semantic copy providers + clipboard backends + paste handling
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 4 — Virtual list find providers + advanced copy-mode
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 5 — Demos, km integration, silvery.dev docs
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 6 — Pointer state machine unification
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 7 — draggable
BLOCKED BY @km/_orphan/7hfik (runtime refactor): Phase 8 — Per-node interactive signals (@km/silvery/1)
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): ## Related beads
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): - @km/silvery/user-select — Phase 1 (userSelect prop + mouse text selection)
BLOCKED BY @km/_orphan/7hfik (runtime refactor): - @km/silvery/1 — Phase 8 (per-node signals)
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): ## Full design doc
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 
BLOCKED BY @km/_orphan/7hfik (runtime refactor): LABELS: architecture, drag-drop, selection, silvery
BLOCKED BY @km/_orphan/7hfik (runtime refactor): 

STATUS UPDATE 2026-04-05 (post /big): The text selection feature was implemented but NOT integrated — km has userSelect=contain props that do nothing because no code reads them. The API is over-engineered (37 exports, multiple providers, hooks the user must wire manually).

See @km/_orphan/7hfik for the runtime refactor that makes this actually work.

After @km/_orphan/7hfik lands:
- Phase 1 becomes trivially usable (props just work)
- Phase 5 (km integration) is already done (props are set)
- Phases 2/3/4 (find, clipboard backends, virtual lists) become runtime features, not hook chaos
- Most of the hooks and providers get deleted

Leaving this bead open as the umbrella for the pointer interaction model, but the implementation strategy has pivoted. Do not add more hooks — move everything into the runtime instead.