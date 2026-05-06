---
mentions:
  - km
  - claude
id: "@km/silvery/era2a-6-unification"
aliases:
  - km-silvery.era2a-6-unification
  - km-silvery-era2a-6-unification
created_by: claude:fed8de9e
created_at: 2026-03-25T03:52:19Z
closed_at: 2026-03-25T06:58:41Z
close_reason: "Phase 6 complete: (1) Typed pipe() with 8 overloads + from()
  builder chain + generic with* plugins preserving accumulated types. (2)
  AppHandle removed from silvery/runtime barrel (quarantined in @silvery/tea).
  (3) RenderAdapter functions removed from ag-term and ag-react barrels (kept
  internal for browser adapters). (4) TermDef removed from all public barrels
  (ag, ag-term, ag-react) — render() still accepts it internally but it's not
  discoverable. (5) All 179 fast + 233 vendor test files pass."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2a Phase 6: Term unification — one Term type, remove old APIs @km/silvery #task #P1 @claude:fed8de9e

Final unification: one Term type across all backends, clean up remaining old APIs.

- ag-term/src/ansi/term.ts — Term is THE type (dims + optional paint/events/screen/caps/cursor)
- ag-term/src/render-adapter.ts — DELETE file (all behavior absorbed by term.paint + ag.render in earlier phases)
- ag-term/src/runtime/create-app.tsx — QUARANTINE (mark as era2b-only, no public export from silvery barrel)
- test/src/ — createTermless() returns a Term with screen/scrollback (formalize)
- All backends (ansi, emulator, headless) return same Term shape

NOTE: AppHandle deletion moves to era2b-app (it depends on withApp which is era2b). This phase focuses on Term unification + RenderAdapter elimination + barrel export cleanup.

**Delete**: Remove RenderAdapter file/type. Remove AppHandle export from silvery barrel (quarantine in create-app.tsx). Remove any TermDef shims (structural { cols, rows } accepted inline, no separate type). Remove old convenience APIs that duplicate pipe().
**/complete**: grep for RenderAdapter → 0 hits. grep for "export.*AppHandle" in barrel → 0 hits. grep for TermDef → 0 hits. grep for old TermDef imports → 0 hits. All Term backends implement same shape. Docs/examples show unified Term. README updated.

Depends on Phase 5 (plugin composition).
Design: era2a/rendering.md §Entry Points and Testing

