---
id: "@km/silvery/layer-violations"
aliases:
  - km-silvery.layer-violations
  - km-silvery-layer-violations
created_by: claude:fed8de9e
created_at: 2026-03-30T05:38:57Z
closed_at: 2026-03-30T06:22:37Z
close_reason: "Fixed all layer violations. V1-V5 resolved: types moved from
  ag-term/create to ag, focus-queries moved to ag, commands decoupled via
  CommandableApp, TermDef/RenderOptions moved to ag-term. ag now has zero
  dependencies. Pattern detection clean. 4854 tests pass."
---

# [x] Fix silvery package layer violations: ag imports from ag-term @km/silvery #bug #P2

@silvery/ag has inverted dependencies and misplaced code. This blocks the multi-surface story and the ag-layout package extraction.

## All Violations (full audit 2026-03-29)

### Critical — ag importing from higher packages

V1. ag/types.ts:8 — import LayoutNode from ag-term/layout-engine
V2. ag/types.ts:9 — import MouseEventProps from ag-term/mouse-events
V3. ag/types.ts:582 — import ColorLevel from ag-term/ansi
V4. ag/focus-manager.ts:17 — import focus-queries (findByTestID, findFocusableAncestor, getTabOrder, findSpatialTarget, getExplicitFocusLink) from @silvery/create/focus-queries. RUNTIME code, not just types. These are pure tree-walking functions that only need AgNode — they belong in ag.

### High — state layer importing from surface

V5. commands/with-commands.ts:33 — import App type from ag-term/app. Commands should only import from ag.

### Medium — circular dependencies

V6. create/plugins.ts:112-127 — re-exports withInk* from @silvery/ink. Creates circular: create -> ink -> ag-react -> create.
V7. create/with-diagnostics.ts:47 — imports compareBuffers from @silvery/test. Production code depending on test package.

### Architectural — misplaced types/code

- TerminalBuffer, Cell, CellAttrs in ag/types.ts (lines 420-460) — terminal-specific, belong in ag-term
- ag-react/ui/cli/ and ui/wrappers/ import chalk from @silvery/ink/chalk — should use @silvery/ansi
- ag-react imports focus-queries, tea, effects from create — these are pure utilities that belong in ag
- ag-term/app.ts, renderer.ts, scheduler.ts import debug/mismatch from @silvery/test — production code depending on test

### Flexily isolation opportunity

Only ag-term/adapters/flexily-zero-adapter.ts imports flexily directly. When @silvery/ag-layout is created, this adapter moves there — making flexily a dep of ag-layout only. Surface adapters consume the paint list, never talk to flexily.

## Ideal ag Sub-Components

| Subpath | Contents |
|---|---|
| ag/types | AgNode, Rect, BoxProps, TextProps, Events, LayoutNode, MouseEventProps (no terminal types) |
| ag/keys | Keyboard parsing, hotkey matching (already clean, 1459 lines) |
| ag/focus | Focus manager + focus-queries (move from create) + event dispatch |
| ag/tree | Tree traversal + generic hitTest (move from ag-term) |
| ag/text-frame | TextFrame, FrameCell, RGB |

## Target Architecture

ag-layout (new) depends on: flexily, pretext (optional peer dep)
ag-term depends on: ag, ag-layout (not flexily directly)
ag-canvas depends on: ag, ag-layout (not flexily directly)
commands depends on: ag only (not ag-term)
create depends on: ag, ag-react, tea, commands, signals, scope, model (not ink, not test)

## Fix Priority

1. Move focus-queries.ts from create to ag (fixes V4, biggest impact — runtime code)
2. Move LayoutNode, MouseEventProps to ag/types (fixes V1, V2)
3. Move ColorLevel to ag (fixes V3)
4. Define AppLike interface in ag (fixes V5)
5. Move TerminalBuffer/Cell/CellAttrs to ag-term
6. Move compareBuffers from test to ag-term or a shared utils package (fixes V7)
7. Move ink re-exports out of create (fixes V6)
8. Replace ag-react ink/chalk imports with @silvery/ansi
9. Extract flexily-zero-adapter to ag-layout when that package is created

## Automated Detection

Patterns 40-41 in scripts/review-code-patterns.sh. Severity table in .claude/skills/code/review-code.md.