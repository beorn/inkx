# km-tui

The terminal UI for km — React components rendered via `@silvery/ag-react` into Silvery's TUI reconciler. All board views, modals, omnibox, and keybinding glue live here.

See the repo root [CLAUDE.md](../../CLAUDE.md) for the km-wide architecture, commands, and boundaries. This doc only covers the km-tui pre-flight.

## Before working in km-tui

**Read first, in this order:**

1. [`vendor/silvery/CLAUDE.md`](../../vendor/silvery/CLAUDE.md) — canonical components, hooks, theme tokens
2. [`.claude/skills/tui/silvery-components.md`](../../.claude/skills/tui/silvery-components.md) — **the audit gate**. If what you're about to write matches anything on that list, use silvery's version. If silvery is missing a prop/feature, add it in `vendor/silvery/` and consume it from km-tui — never fork it here.
3. [`vendor/silvery/docs/guide/the-silvery-way.md`](../../vendor/silvery/docs/guide/the-silvery-way.md) — philosophy, canonical patterns, anti-patterns
4. [`vendor/silvery/docs/guide/styling.md`](../../vendor/silvery/docs/guide/styling.md) — semantic tokens (`$primary`, `$muted`), typography presets, theme usage

**Do NOT reimplement** (all of these already exist in silvery — consume them):

- `TextInput` / `useReadline` — text input + line editing
- `SelectList` / `PickerList` / `PickerDialog` — selection lists and modal pickers
- `ModalDialog` — modal chrome, focus trap, escape handling
- `useInput` / `useFocus` / `focusScope` — input routing and focus management
- `useBoxRect` — measured box dimensions
- `VirtualList` / `ListView` — virtualized scrolling lists

If a silvery primitive is missing a prop or behavior you need, upgrade it in `vendor/silvery/` rather than wrapping or rebuilding it in km-tui. Silvery is a git submodule — fixes propagate immediately.

**km-tui anti-patterns:**

- Manual raw-key handlers outside `@silvery/tea` or `useInput` — discrete keys must go through `@km/commands` (see [docs/lessons/input-architecture.md](../../docs/lessons/input-architecture.md))
- `Box theme={{}}` just to change background color — re-resolves every `$token`; use `backgroundColor` directly
- Hardcoded ANSI escapes or raw color values — use `$primary`, `$muted`, and typography presets from the theme
- `isSelected` as a proxy for "cursor is here" — it means "cursor is anywhere inside this card"; use `cursor === nodeId` for direct matches
- Reimplementing Ink-era patterns — this is a Silvery project, not an Ink project

**Visual bugs:** spawn the silvery agent before touching `vendor/silvery/packages/ag-term/src/pipeline/*.ts`. See the repo root CLAUDE.md "Rendering & Visual Bugs" section.
