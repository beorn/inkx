---
mentions:
  - km
id: "@km/tui/storybook-styling-coverage"
aliases:
  - km-tui.storybook-styling-coverage
  - km-tui-storybook-styling-coverage
created_by: Bjørn Stabell
created_at: 2026-04-07T05:43:43Z
owner: bjorn@stabell.org
---

# [ ] Audit and refresh bun storybook — visualize all current styling states @km/tui #task #P2

## Why

`bun storybook` (apps/@km/tui/tests/storybook.tsx, 1868 lines) is the visual component catalog. It already covers Rich Text Rendering, Status & Type Icons, Layout, View Modes, and a Visual Language Section — but several styling features added in recent sessions are missing or out of date:

- **Broken wikilinks** (47a7945ab + 7d5721ba6) — dashed `\$error` underline, cursor-safe by construction. No section currently demonstrates this.
- **Symlinks** (b78137bbc, 3d2a9c2ec) — display layer was renamed embed → symlink. Storybook may still use embed-era patterns or omit symlink rendering entirely.
- **Selection states** redesign (this session) — cursor inverse, card/column/board tint cascades, multi-select bg tint, parent indicators, dim cascade. selection-style.ts is the rulebook; storybook should mirror its 8 rules.
- **stripKnownMentions** (2e42f18ed) — card title rendering with sigils preserved, known @mentions stripped. Worth a fixture row.
- **Stable body classification** (ed99dec6d) — body cascade is now data-derived. Demo a card with body+structural sibling mix.
- **Done / dropped task styling** — strike+dim with decoration markers (broken wikilink underline) still visible.
- **Sticky-fold marker** (@km/tui/sticky-fold Phase 2 — agent in flight) — when it lands, the sticky fold visual cue needs a section.

## Goal

Audit the existing storybook against the **current** styling rules in `apps/km-tui/src/views/selection-style.ts` and `apps/km-tui/fixtures/styling-showcase/`. Add missing sections, update stale ones, and add at least:

1. **Selection States** section showing cursor inverse, multi-select tint, card/column/board tint, parent indicators
2. **Broken Wikilink** subsection in Rich Text Rendering — both standalone and inside cursor-active row
3. **Symlink Display** subsection — symlink as a card vs as a sub-item, with both resolved and broken targets
4. **Task State Matrix** — todo/done/dropped/in-progress/blocked × { plain / with broken link / with code / inside body context }
5. **Body Dim Cascade** — card with heading sibling + tasks + body paragraphs
6. **Sticky Fold Markers** — once @km/tui/sticky-fold Phase 2 lands

## Acceptance

- `bun storybook --inline` opens cleanly in inline mode (existing)
- `bun storybook` opens cleanly in fullscreen alt-screen
- Each new/updated section lands ALL of its example variants on the same screen so the user can see them side by side
- No regressions in existing sections
- Visual Language Section is updated to reference the current selection-style.ts rules verbatim
- Cross-reference: storybook contents stay aligned with `apps/km-tui/fixtures/styling-showcase/` (the standalone visual fixture). Both should cover the same matrix; storybook is component-level, the fixture is vault-level.

## Companion fixture

This bead's sibling is `apps/km-tui/fixtures/styling-showcase/` (just landed in this session) — a runnable km vault with the same matrix. The two are complementary:

- **Storybook**: component-level rendering, requires no real vault, fast iteration, lives in tests/
- **Showcase fixture**: vault-level integration, shows real cursor/board behavior across the matrix, runnable via `scripts/show-styles.sh`

When updating storybook, also update the fixture (or vice versa) so they stay in sync.

## Files

- apps/@km/tui/tests/storybook.tsx (the catalog)
- apps/@km/tui/tests/storybook-smoke.test.tsx (regression test, must keep green)
- apps/@km/tui/src/views/selection-style.ts (the rulebook to follow)
- apps/@km/tui/fixtures/styling-showcase/ (the companion vault fixture)

## Related

- @km/silvery/examples-components (P1) — silvery's own component showcase, separate
- @km/silvery/variant-style-system (P2) — when it lands, every storybook example will exercise the variant resolver, and the storybook becomes the canonical visual regression target
- @km/infra/style-precedence-lint (P3) — would prevent regressions in styling code; storybook catches them visually

