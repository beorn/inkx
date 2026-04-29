---
id: "@km/silvery/theme-fake-cursor"
aliases:
  - km-silvery.theme-fake-cursor
  - km-silvery-theme-fake-cursor
created_by: Bjørn Stabell
created_at: 2026-04-18T05:07:26Z
closed_at: 2026-04-18T18:27:52Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
---

# [x] Theme fake cursors — wire SelectList / Picker / TextInput / Board to cursorColor/cursorText @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Switch silvery's in-app cursors to use palette cursorColor/cursorText instead of $primary / $selection-bg — native feel per user's scheme.

## Targets

- SelectList / PickerList highlighted row
- ModalDialog focus indicator
- TextInput insertion point when not focused
- Board / canvas arrow cursor
- Outline current-node marker
- Kanban column-active indicator
- Omnibox selected row

## Inline mode

Real cursor handles shell interaction; rendered UI blocks still use fake cursors (TextInput in a form, etc). Same tokens apply.

## Acceptance

- [ ] Every fake cursor uses $cursor or $cursorbg tokens
- [ ] Visual test across Dracula / Tokyo Night / Solarized / Gruvbox confirms match
- [ ] Inline + fullscreen modes both use scheme cursor colors
- [ ] Styling guide documents the pattern

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system
Depends on: @km/silvery/theme-auto-detect (ensures cursorColor populated)
