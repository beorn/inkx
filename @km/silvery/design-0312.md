---
id: "@km/silvery/design-0312"
aliases:
  - km-silvery.design-0312
  - km-silvery-design-0312
created_by: claude:e4e70c9a
created_at: 2026-03-12T17:05:04Z
closed_at: 2026-03-13T17:05:06Z
close_reason: Architecture overview doc created (146 lines). Plugin composition
  (generic accumulation via intersection types) and op() ergonomics (semantic
  contract, enforcement modes) documented in app-composition.md. All
  cross-references updated.
---

# [x] Design docs: driver-on-handle, fx.from(), timers/streams, scope policies @km/silvery #task #P2 @claude:c9beade3

Design iteration on silvery-internal docs (2026-03-12/13 sessions).

## Completed work

### App composition v2 (2026-03-12)
- Rewrote `app-composition.md` — two concerns (model + runtime), `op()` proxy, plugin composition
- Updated `state-api-redesign.md` — Sip 4-6 aligned with new architecture, architecture diagram replaced
- Updated `command-centric.md` — resolved canonicality contradiction, added `CommandDef` type, connected to `op()`
- Updated `scope-tree.md` — v1/future split, narrowed scope, deferred advanced features to appendices
- Added prototype at `vendor/silvery-internal/prototype/aichat-v2/`

### GPT 5.4 Pro critique (2026-03-13)
- Full critique of all 4 design docs (coherence, conciseness, value prop)
- Trimmed ~350 lines net across 3 docs (state-api-redesign, command-centric, scope-tree)
- Resolved terminology contradictions (commands as metadata, not canonical behavior)
- Narrowed v1 scope in scope-tree.md (defer fx.from(), advanced plugins)

### Earlier work (2026-03-12)
- Driver-on-handle pattern, fx.from() wrapping, serialization/execution policies
- Timer/interval effects, async iterables/streams
- signals vs Zustand decision (★ pivotal — createModel resolves the tension)

## Open items
- Architecture overview doc (one-page entry point — recommended by GPT critique, not yet created)
- Type-safe plugin composition (generic accumulation vs builder pattern)
- op() ergonomics finalization