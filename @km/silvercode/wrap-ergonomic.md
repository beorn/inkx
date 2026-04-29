---
id: "@km/silvercode/wrap-ergonomic"
aliases:
  - km-silvercode.wrap-ergonomic
  - km-silvercode-wrap-ergonomic
created_by: claude:0940ca20
created_at: 2026-04-24T21:50:44Z
---

# [/] [epic] Ergonomic text wrapping in silvercode — flexily root fix + <Prose> primitive + migrate silvercode @km/silvercode #feature #P1 @claude:53042a7f

## End goal

Silvercode renders markdown, user messages, and assistant responses without any consumer-level flex/shrink/minWidth/overflow boilerplate. Drop a component, get correct wrapping. Zero negative-knowledge ("don't stack flexGrow") footguns.

## Problem history

This bug has surfaced at least 3 times in km across 2 months:
- 2026-02-11 — @km/tui wrap issue
- 2026-04-18 — silvercode first encounter
- 2026-04-24 — silvercode paragraph clipping into side panel (this session)

Each time the fix has been a DIFFERENT workaround. Nested `flexGrow` gets removed here, `minWidth=0` gets sprinkled there, `overflow="hidden"` lands at a boundary elsewhere. The knowledge doesn't compound because none of it matches CSS semantics and none of it is encapsulated.

## Current state (2026-04-24)

- **Workaround shipped** in silvercode at commit `363deaf6f` (SessionCard.tsx:51-57): removed inner column's `flexGrow={1}`; only outer Box carries flex-grow. Text now wraps. Documented as a comment that future developers must not touch.
- **Root bug open**: `km-silvery.wrap-measurement` — flexily's Text measurement walks to the nearest flex-grow ancestor instead of direct parent, so `flexShrink=1 minWidth=0` (CSS canonical fix) doesn't actually help grandchild Text wrap.
- **Ergonomic surface open**: `km-silvercode.prose-primitive` — silvery-level `<Prose>` component that encapsulates the correct flex config so consumers never think about it.

## Children (sequence)

1. **@km/silvery/wrap-measurement** — P1. Fix flexily's measurement so grandchild Text respects direct-parent width when `flexShrink=1 minWidth=0` is set, matching CSS semantics. Includes flexily-level test + silvery feature-test. Scale to realistic fixtures (50+ nodes) per km CLAUDE.md pipeline rules.
2. **@km/silvercode/prose-primitive** — P2. Ship `<Prose>` in silvery (not silvercode). Zero-knowledge API: `<Prose><MarkdownView source={text} /></Prose>` — encapsulates flexShrink / minWidth / overflow / wrap. Reduces the consumer cognitive load to one import.
3. **Silvercode migration** — replace the SessionCard workaround with `<Prose>` around AssistantBlock / UserMessageBlock / MarkdownView. Remove the "don't touch — restore inner flexGrow to reproduce bug" comment. Delete any scattered `flexShrink={1} minWidth={0}` that `<Prose>` now owns.
4. **Visual regression test** — tie into the silvercode visual test system landed at `e81fc6ec9`: scenario renders a 1500-char paragraph in a card alongside a side panel; invariant asserts no text occupies columns ≥ (cols - sidePanelWidth).
5. **Docs** — add `vendor/silvery/docs/components/Prose.md` + short section in `docs/guide/styling.md` on text-wrapping patterns. Frame silvery as a design system with both primitives and composites.

## Positioning context

Silvery is a multi-target UI framework with web ambitions — NOT "Ink but better" or terminal-only. Design decisions here default to the Polaris-for-TUI answer (ship high-level design primitives like `<Prose>`), not the TUI-idiom answer. See `docs/silvery-positioning-brief.md`. This bead's goal isn't just to unblock silvercode — it's to give silvery the ergonomic text-wrapping story any serious design system needs.

## Definition of done

- Flexily measurement matches CSS semantics for nested flex-grow columns + text wrap
- `<Prose>` exported from silvery, documented, used in silvercode
- Silvercode has ZERO `flexShrink={1}` / `minWidth={0}` on intermediate text-wrapping Boxes — they all flow through `<Prose>`
- Visual regression test catches the original failure mode automatically
- SessionCard.tsx "no nested flexGrow" comment is deleted; inner Box restored to normal flex config
- `bd close` with close reasons linking the landing commits for each child

## Out of scope

- Flipping silvery's `flexShrink` default from 0 to 1 (prior silvery-expert audit flagged as high-risk — ListView + others depend on 0).
- Generalized `<Card>` / `<Stack>` / `<Section>` design primitives (future silvery work; separate initiative).