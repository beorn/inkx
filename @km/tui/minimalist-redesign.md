---
mentions:
  - km
id: "@km/tui/minimalist-redesign"
aliases:
  - km-tui.minimalist-redesign
  - km-tui-minimalist-redesign
created_by: Bjørn Stabell
created_at: 2026-04-16T19:47:00Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.minimalist-redesign
    depends_on_id: km-silvery.design-review
    type: blocks
    created_at: 2026-04-16T12:47:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.minimalist-redesign
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-16T12:47:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.design-review
      - type: link
        target: km-tui
---

# [ ] km: try a minimalist opencode-inspired design variant @km/tui #feature #P3

blocks:: [[@km/silvery/design-review]], [[@km/tui]]

Experiment: give km a minimalist design variant inspired by opencode — panes-over-borders, restricted palette, dim-rest-of-app modals. Dog-foods the design system work in @km/silvery/design-review.

## Why this bead exists

Opencode proves a restrained, panes-first design reads cleanly and feels modern in a terminal. km today is borders-heavy and full-palette. This bead captures a specific experiment: can @km/tui look and feel better with a minimalist variant? We keep the current design as the default until the experiment is reviewed; the variant ships behind a theme/mode flag.

This is also the best way to pressure-test the design system changes landing in `km-silvery.design-review` against a real, non-trivial app.

## Design intent

### Demarcation — surfaces, not borders

- Two background colors only: **black** (app bg) and **grey** (elevated surface — prompt box, side bar, command output area)
- Columns, cards, panels demarcated by bg tint + padding, not by box-drawing characters
- **Modal pattern**: when a dialog opens, it renders on the grey surface and the rest of the app **dims** (alpha-blend-to-bg / reduced-contrast overlay). Nice cue from opencode, worth adopting broadly.

### Palette — restricted, semantic

- **Chrome text**: always white or light grey. No rainbow labels.
- **Blue**: most interactive chrome — focus border, activity indicator, current mode label
- **Yellow bg**: selection highlight (full-row bg fill, dark fg paired). Note: slight inconsistency with blue-for-interactive, but opencode does this and it reads well. Accept for now; revisit in the design review if it grates.
- **Content highlights**: purple, yellow, (others TBD during implementation)
- **`code`**: green
- **No bottom status bar** — empty space at the bottom. Relies on mode indicator and activity state being visible elsewhere.
- **Search box under title**: no border. Minimalist/compact. Just the input on the surface.

### Dialogs — flat, simple chrome

- Bold white title in top-left
- Grey keybinding hint (`esc`) in top-right
- No border around the dialog body — elevation via the grey surface
- Underlying app dims (see modal pattern above)

### Open questions

- **No scrolling indicator?** Opencode appears not to show one. Do we drop km's scroll indicators in this variant, or keep a minimal one? Resolve during implementation.
- **Selection vs focus color consistency** — yellow selection + blue focus is the opencode choice. Worth trying; if it feels off in km's dense kanban, revisit.
- **Board-specific components** — column headers, card states (cursor / selected / ancestor-muted / done / editing) all need a minimalist treatment. The current node-visual-spec.md matrix was designed for bordered cards. It will need a parallel minimalist column.

## How this ties into @km/silvery/design-review

This bead is a **consumer** of the design system work:

- Uses `demarcation: "panes"` axis (panes-over-borders)
- Uses `breadth: "one-accent"` (blue) plus `content-highlight` exceptions (purple/yellow/green)
- Uses `source: "hardcoded"` or a specific palette choice — TBD whether the variant overrides the user's terminal palette
- Consumes the new `<Dialog variant="flat">`, per-side border control, density tokens, and dim-rest-of-app modal pattern
- Depends on the design-review landing component primitives (particularly flat Dialog + dim-backdrop modal pattern)

Ideally scheduled **after** `km-silvery.design-review` Phase 3 (new components) has shipped primitives we need.

## Acceptance

- [ ] A km theme/mode flag exists to switch between current and minimalist variants
- [ ] Minimalist variant implements: two-bg demarcation (black + grey), blue-for-interactive, yellow-bg selection, green `code`, purple/yellow content highlights
- [ ] Modal dim-rest-of-app pattern implemented and used for all km dialogs
- [ ] Dialogs: bold white title top-left, grey esc-hint top-right, no border
- [ ] Search box borderless under titles
- [ ] Decision + implementation on scrolling indicators (keep/minimal/drop)
- [ ] Node visual spec extended with minimalist variant column (or a parallel minimalist-node-visual-spec.md)
- [ ] Side-by-side screenshots vs current km (and vs opencode) for review
- [ ] User (Bjørn) approves the variant as at-least-as-good as current km; doesn't have to be the default

## Scope boundaries

**In scope**

- @km/tui views (Board, CardColumn, Dialogs, Omnibox, DetailView, HelpOverlay, Toast, PaneBar)
- The state×role matrix for cards/columns in minimalist mode
- Modal/overlay chrome across the app

**Out of scope**

- Changes to silvery primitives (those land in @km/silvery/design-review)
- Changes to markdown rendering / inline styles (styling-showcase fixtures)
- Replacing the current km design wholesale (this is a variant, not a migration)

## References

- Parent epic: `km-tui`
- Design system work: `km-silvery.design-review`
- Current visual spec: `docs/design/node-visual-spec.md`
- Selection style rules: `apps/km-tui/src/views/selection-style.ts`
- Current storybook: `apps/km-tui/tests/storybook.tsx`
- Competitive reference: opencode (screenshots in notes; command palette, message blocks, dialogs, status bar, prompt modes all studied)

