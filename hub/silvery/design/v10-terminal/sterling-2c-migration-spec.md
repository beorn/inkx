# Sterling Phase 2c — km-tui migration spec

**Status**: prep (2026-04-19). Do NOT execute until `sterling-2a-data-layer` is committed and `sterling-2b-ui-components` is in flight. This spec captures the migration scope so 2c is pure execution.

**Bead**: `km-silvery.sterling-2c-km-migration`.

---

## Blast radius (measured, not estimated)

```
apps/km-tui/src/ — 44 files touched, 313 total refs:
  33 × theme.X field access      (programmatic)
  280 × $-token string refs      (JSX props)
```

Earlier planning estimates said "~145 sites" — that was half the real number. Plan for 313 refs across 44 files.

### Distribution by token

**High-frequency** (migrate with care, many call sites):

| Current | Refs | Form |
|---|---|---|
| `$muted` | 56 | single-word $-token |
| `$fg` | 40 | single-word $-token |
| `$selection` | 34 | single-word $-token |
| `$error` | 34 | single-word $-token |
| `$primary` | 26 | single-word $-token |
| `$selection-bg` | 23 | kebab $-token (half-migrated) |
| `$warning` | 17 | single-word $-token |
| `$success` | 16 | single-word $-token |
| `$focusborder` | 14 | legacy camelCase $-token |
| `$disabled-fg` | 14 | kebab $-token (half-migrated) |
| `$link` | 12 | single-word $-token |
| `$cursor` | 12 | single-word $-token |

**Low-frequency** (easy wins):
- `$popover-bg` (8), `$border` (7), `$surface-bg` (4), `$cursor-bg` (4), `$inputborder` (2), `$warning-fg` (1), `$inverse-bg` (1), `$inverse` (1), `$info` (1), `$accent-fg` (1), `$accent` (1)

**theme.X field access** (33 refs, mostly in `theme.ts`):
- `theme.bg` (9), `theme.primary` (7), `theme.focusborder` (3), remainder 1-2 each

---

## Substitution map (Sterling canonical naming)

These come from [design-system.md](design-system.md) §"Default design system" and Appendix D. Channel-role-state order throughout.

### Obvious mechanical (no ambiguity)

```
$focusborder               → $border-focus
theme.focusborder          → theme["border-focus"]
$inputborder               → $border-default
theme.inputborder          → theme["border-default"]
$selection-bg              → $bg-selected
theme.selectionbg          → theme["bg-selected"]
$selection                 → $fg-on-selected
theme.selection            → theme["fg-on-selected"]
$surface-bg                → $bg-surface
theme.surfacebg            → theme["bg-surface"]
$popover-bg                → $bg-overlay
theme.popoverbg            → theme["bg-overlay"]
$cursor-bg                 → $bg-cursor
theme.cursorbg             → theme["bg-cursor"]
$cursor                    → $fg-on-cursor
theme.cursor               → theme["fg-on-cursor"]
$disabled-fg               → $fg-disabled
theme.disabledfg           → theme["fg-disabled"]
$warning-fg                → $fg-on-warning
$accent-fg                 → $fg-on-accent
theme.muted                → theme["fg-muted"]
theme.link                 → theme["fg-link"]
theme.border               → theme["border-default"]
theme.error                → theme["fg-error"]
theme.warning              → theme["fg-warning"]
theme.success              → theme["fg-success"]
```

### Judgment-required (one-to-many depending on context)

These tokens need per-site judgment because the semantic context determines the target:

| Current | Possible targets | Judgment needed |
|---|---|---|
| `$primary` (26) | `$fg-accent` (link-like text) OR `$bg-accent` (button fill) | Check surrounding component role |
| `$muted` (56) | `$fg-muted` (dim text) OR `$bg-surface-subtle` (panel fill) | Usually `$fg-muted` for text-color props, `$bg-surface-subtle` for bg props |
| `$fg` (40) | `$fg-default` (plain text) — should just stay as `theme.fg` if Sterling keeps a `default` role | **BLOCKED ON 2a** — does Sterling expose `$fg-default` or keep `$fg` as a shortcut? |
| `$selection` | `$fg-on-selected` vs `$fg-selected` | Context: is this text ON a selected bg (→ `fg-on-selected`), or accent color for selection highlight (→ `fg-selected`)? |
| `$error` (34) | `$fg-error` (text color) — all current uses likely text | Audit: confirm none are used as a bg fill |
| `$warning`, `$success`, `$info`, `$link`, `$cursor` | same as `$error` — likely all fg use | Same audit |
| `$inverse`, `$inverse-bg` | Sterling may drop inverse entirely (use accent.bg + accent.fgOn) | **BLOCKED ON 2a** — inverse not in current Sterling spec |

### Open questions for 2a to resolve

Before 2c executes, `sterling-2a-data-layer` must lock:

1. **Does Sterling expose `$fg-default` / `$bg-default` as canonical names, or keep `$fg` / `$bg` as shortcuts?** The 40 `$fg` and `theme.bg` refs in km-tui depend on this answer.
2. **Does Sterling ship `$inverse` / inverse role?** Currently used in km-tui's status-bar-like contexts (2 refs). Options: (a) drop inverse, use `$bg-accent` + `$fg-on-accent`; (b) keep inverse as a specific role.
3. **Is `$link` a base role or an `accent` alias?** 12 refs in km-tui. Sterling spec doesn't list link as distinct. Default: alias to `accent.fg`.
4. **Cursor token shape**: `theme.cursor.fg` + `theme.cursor.bg` (nested), or `$fg-cursor` + `$bg-cursor` (flat)? Both? The table above assumes flat form.

---

## Execution plan (when unblocked)

### Step 1 — definition change (manual, 1 commit)

In km-tui's `theme.ts` (the 9 refs live here mostly):

```ts
// Change:
export type Theme = import("@silvery/theme").Theme
// to:
export type Theme = import("@silvery/design").Theme  // or whatever the final export is
```

Whatever km-tui's local Theme alias looks like, make the root import point at Sterling's new Theme type. This is 1-5 lines. Commit it. `tsc --noEmit` error count should match the blast radius (~313).

### Step 2 — batch-refactor the obvious 80%

```bash
# Command 1: focusborder → border-focus (flat + nested + $-token)
bun vendor/bearly/tools/refactor.ts pattern.replace \
  --pattern '\$focusborder\b' --replace '$border-focus' \
  --glob 'apps/km-tui/src/**/*.{ts,tsx}' --backend ripgrep \
  --output /tmp/migrate-focusborder.json
bun vendor/bearly/tools/refactor.ts editset.apply /tmp/migrate-focusborder.json

# Command 2: theme.focusborder → theme["border-focus"]
bun vendor/bearly/tools/refactor.ts pattern.replace \
  --pattern 'theme\.focusborder\b' --replace 'theme["border-focus"]' \
  --glob 'apps/km-tui/src/**/*.{ts,tsx}' --backend ripgrep \
  --output /tmp/migrate-focusborder-field.json
bun vendor/bearly/tools/refactor.ts editset.apply /tmp/migrate-focusborder-field.json

# Repeat for each obvious rename (~15 commands)
# After each: check tsc error count, expect monotonic decrease
```

See the substitution map above for the full command list. Each obvious rename gets one `pattern.replace` call.

### Step 3 — judgment-required renames (targeted agent)

For `$primary`, `$muted`, `$fg`, `$selection`, `$error` and similar — spawn a silvery agent with the context of the substitution map and this spec. The agent reads each call site and picks the correct target.

Don't batch-refactor these — the context matters.

### Step 4 — edge cases

- `theme.ts` itself (9 refs — local aliases): rewrite as a Sterling adapter if km-tui keeps a local Theme shortcut, or delete and import directly from @silvery/design.
- Test fixtures (snapshot test assertions may hardcode hex values — inspect, update if scheme changed).
- Comments / JSDoc / inline docs referencing old names — grep-sweep the 7 layers per [refactor.md](../../../../.claude/skills/refactor/SKILL.md) Rename Checklist.

### Step 5 — verify

```bash
# Type check clean
cd /Users/beorn/Code/pim/km && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | wc -l   # → 0

# No legacy patterns remaining
rg '\$focusborder|\$inputborder|\$selection-bg|\$popover-bg|\$surface-bg|\$cursor-bg|\$disabled-fg' apps/km-tui/src/   # → 0
rg 'theme\.(focusborder|inputborder|selectionbg|popoverbg|surfacebg|cursorbg|disabledfg|primaryfg|mutedbg|inversebg)\b' apps/km-tui/src/   # → 0

# Sweep 7 layers for stale names
rg -i 'focusborder|inputborder|selectionbg|popoverbg|surfacebg|cursorbg' apps/km-tui/ --glob '!dist'   # → 0 or audit remaining

# Tests green
bun run test:fast
```

### Step 6 — commit

```
refactor(km-tui): migrate to Sterling flat tokens (Phase 2c)

- ~313 refs migrated across 44 files
- All legacy camelCase theme fields removed
- All $-tokens now in channel-role-state form
- $primary/$muted/$fg/$selection/$error resolved to correct target per site

Resolves: km-silvery.sterling-2c-km-migration
```

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| 2a locks `$fg` ≠ `$fg-default` (shortcut form), invalidating 40 refs' planned target | High | Pause 2c, re-read 2a's decision, update substitution map. Don't proceed on assumption. |
| `$muted` is ambiguous between fg-text and bg-surface uses | High | Judgment-required agent reads context; if >5 sites wrong, hold for manual review |
| Test snapshots hardcode hex values that change with Sterling's new derivation | Medium | Accept snapshot changes if they match the new canonical hex; investigate if unexpected |
| `theme.ts` local Theme alias in km-tui conflicts with Sterling's Theme | Medium | Step 1 specifically resolves this before any $-token edits |
| batch-refactor over-matches (e.g., `$error` substring appears inside `$error-fg` already-kebab tokens) | Medium | Use `\b` word boundaries in patterns; dry-run each command and inspect diff before apply |
| Documentation / comments / file names reference old tokens | High | Step 5 sweep finds them; fix in the same commit as Step 4 |

---

## Dependencies

- **BLOCKED ON**: `sterling-2a-data-layer` (decides `$fg` vs `$fg-default`, `$inverse` fate, cursor shape)
- **BLOCKED ON**: `sterling-2b-ui-components` (Sterling `@silvery/ui` components must consume new tokens first; km-tui depends on them)
- **UNBLOCKS**: `sterling-2d-release` (once km-tui clean, legacy aliases can be deleted)

---

## What this spec is NOT

- NOT a plan for what Sterling tokens exist — that's in [design-system.md](design-system.md) and [sterling-preflight.md](sterling-preflight.md)
- NOT a plan for the data layer — that's [sterling-2a-data-layer bead](../../..)
- NOT a plan for public silvery.dev docs — that's `sterling-public-docs` bead, post-release
- NOT executable yet — it's the spec 2c executes against, once 2a ships

Measured 2026-04-19 from `main` at commit `2f66d7a65`. Re-measure blast radius when 2c starts to catch any drift.
