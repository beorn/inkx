# km-tui

The terminal UI for km — React components rendered via `@silvery/ag-react` into Silvery's TUI reconciler. All board views, modals, omnibox, and keybinding glue live here.

See the repo root [CLAUDE.md](../../CLAUDE.md) for the km-wide architecture, commands, and boundaries. This doc only covers the km-tui pre-flight.

## STOP — walk the Silvery Resolver first

**Editing anything under `apps/km-tui/src/views/`, `apps/km-tui/src/state/omnibox*`, or `vendor/silvery/packages/` is enforced by a PreToolUse hook** (`.claude/hooks/silvery-read-gate.sh`). Edit/Write will be **blocked** until you've Read `vendor/silvery/docs/guide/the-silvery-way.md` in the current session.

The gate exists because silvery is core architecture — not a generic framework. Operating inside it requires reprogramming out of Ink/blessed intuition (ANSI flatness, closed presets) into silvery's actual model (cascading inheritance, prop-spread override, semantic tokens).

**Session-start protocol:**

1. `Read vendor/silvery/docs/guide/the-silvery-way.md` — the canonical primer (always). Unlocks the Edit gate.
2. Walk [`.claude/skills/tui/silvery-resolver.md`](../../.claude/skills/tui/silvery-resolver.md) — the decision tree tells you which OTHER silvery docs to read for today's task.
3. Only then start coding.

## Reference links

- [`vendor/silvery/CLAUDE.md`](../../vendor/silvery/CLAUDE.md) — canonical components, hooks, theme tokens
- [`.claude/skills/tui/silvery-components.md`](../../.claude/skills/tui/silvery-components.md) — audit gate for every list/picker/modal/input
- [`vendor/silvery/docs/guide/the-silvery-way.md`](../../vendor/silvery/docs/guide/the-silvery-way.md) — 10 principles
- [`vendor/silvery/docs/guide/styling.md`](../../vendor/silvery/docs/guide/styling.md) — tokens, typography, theme

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
