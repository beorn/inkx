# Styling Showcase

A fixture vault for visually auditing km's inline styling in all states at once.

## Usage

```bash
# From km repo root — convenience runner (inits on first run, then opens view):
scripts/show-styles.sh

# Or manually, first time only:
cd apps/km-tui/fixtures/styling-showcase
bun km init --force .   # creates .km/ runtime state (gitignored)
bun km view .
```

The fixture has its own nested `.km/` directory so it doesn't inherit the km repo's own vault state. First run needs `init --force` because the parent km repo already has a `.km/`.

Navigate with `j`/`k`/`h`/`l` (or arrow keys) to move the cursor across each row. Every styling state should remain visually consistent between "cursor on this row" and "cursor elsewhere".

Press `D` to open the detail pane on any item — styles must also survive the detail-pane rendering path.

## What to check

For each inline construct, the cell should look correct in ALL of these contexts:

1. **Cursor NOT on the row** — the native inline style applies
2. **Cursor ON the row** — cursor inverse takes over fg/bg, but decoration attributes (dashed underline for broken wikilinks, dotted underline for resolved wikilinks) must remain visible
3. **Row is in a multi-selection** — subtle bg tint, no cursor inverse
4. **Row is body content under a heading sibling** — dim cascade applies
5. **Task is done/dropped** — inline colors stripped, dim, strikethrough where applicable

If any cell looks inconsistent across those contexts, that's a styling precedence bug — refer to `apps/km-tui/src/views/selection-style.ts` for the precedence rules, and file against `km-silvery.variant-style-system` (the long-term reframe) or `km-infra.style-precedence-lint` (the short-term guard).

## Files

- `01-inline-formatting.md` — bold, italic, strikethrough, inline code
- `02-links.md` — resolved wikilinks, broken wikilinks, bare URLs, markdown links
- `03-sigils.md` — tags, projects, known @mentions, unknown @mentions, inline fields, block refs
- `04-tasks.md` — todo, done, dropped, blocked, in-progress
- `05-body-dim.md` — body content under heading siblings (dim cascade)
- `06-mixed.md` — combinations: bold inside task inside body, broken wikilink in done task, etc.

## Adding new cases

When a styling bug is fixed, add a row here that demonstrates the fixed behavior. This file becomes a visual regression corpus — run it after any styling-adjacent change.
