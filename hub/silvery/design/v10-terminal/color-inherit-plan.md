# color="inherit" / "currentColor" — cascade primitive

Implementation plan for bead `km-silvery.color-inherit` (P6 from theme-system-v2-plan).

## Goal

Add `color="inherit"` / `color="currentColor"` as a first-class cascade primitive to silvery so km-tui can retire the 3-valued `colorOverride` context hack. Same idea as CSS `color: inherit` / `currentColor`.

Also extend to:

- `<Text underlineColor="currentColor">` — underline uses the resolved text fg
- `<Box borderColor="currentColor">` — border uses the resolved surrounding fg

## Observations about the existing pipeline

The silvery render phase already threads `inheritedFg` top-down through `NodeRenderState` (see `vendor/silvery/packages/ag-term/src/pipeline/types.ts:148` and `render-phase.ts:115-128`, `652-656`). This is the machinery we need — no tree walk required at render time.

Today:

- `parseColor("inherit")` already returns `null` (render-helpers.ts:73).
- `getTextStyle` computes `style.fg = props.color ? parseColor(props.color) : null`. For `color="inherit"` that is `null`.
- `renderText` and `renderNodeContent` both fall back: `if (style.fg === null && inheritedFg !== undefined) style.fg = inheritedFg` — so an `inherit` Text already picks up the parent's `inheritedFg` on its own rendering.

The bug — child propagation:

```ts
// render-phase.ts:652-656
const childInheritedFg = props.color
  ? parseColor(props.color)
  : nodeTheme
    ? parseColor(nodeTheme.fg)
    : nodeState.inheritedFg
```

With `props.color="inherit"`, `parseColor` returns `null`, so `childInheritedFg = null`. That *replaces* the grandparent's `inheritedFg` with "no color", breaking the grandchild cascade. Grandchildren no longer see the ancestor color — they see the terminal default.

## Fix

### Step 1 — Keyword recognition in `parseColor`

Add `"currentColor"` as an alias for `"inherit"`. Both return the sentinel `null`. This is purely defensive — callers that check the raw prop string still need to special-case both words. `parseColor` already returns `null` for `"inherit"`.

```ts
if (color === "inherit" || color === "currentColor") return null
```

### Step 2 — Preserve ancestor fg in `childInheritedFg`

Treat `"inherit"` / `"currentColor"` as "pass-through" for cascade purposes:

```ts
const isInheritKeyword = props.color === "inherit" || props.color === "currentColor"
const childInheritedFg = isInheritKeyword
  ? nodeState.inheritedFg           // pass-through
  : props.color
    ? parseColor(props.color)
    : nodeTheme
      ? parseColor(nodeTheme.fg)
      : nodeState.inheritedFg
```

### Step 3 — `underlineColor="currentColor"` uses resolved fg

In `getTextStyle` (render-helpers.ts), detect the keyword and resolve after fg resolution:

```ts
// inside renderText, after style.fg is resolved (including inheritedFg fallback):
if (props.underlineColor === "currentColor" || props.underlineColor === "inherit") {
  style.underlineColor = style.fg
}
```

This must happen post-fg-resolution in renderText (where `inheritedFg` is already applied), not in `getTextStyle` (which runs before inheritance). So `getTextStyle` produces `style.underlineColor = null` for the keyword; `renderText` upgrades it.

### Step 4 — `borderColor="currentColor"` uses resolved fg

`renderBorder` currently: `const color = props.borderColor ? parseColor(props.borderColor) : null`.

Thread `inheritedFg` into `renderBox` → `renderBorder`. When `props.borderColor === "currentColor" | "inherit"`, use the node's own resolved fg (`parseColor(props.color)` if set, else `nodeState.inheritedFg`).

Implementation — `renderNodeContent` already has `nodeState.inheritedFg` in scope. Pass it through to `renderBox` (which then passes to `renderBorder`). In `renderBorder`, if the keyword is set, use `parseColor(props.color)` (or the passed inheritedFg when no explicit color).

## Test plan — `vendor/silvery/tests/features/color-inherit.test.tsx`

All at `SILVERY_STRICT=2`:

1. `<Text color="inherit">` inside `<Text color="$primary">` → renders as $primary
2. `<Text color="inherit">` with no colored ancestor → undefined (terminal default)
3. Nested: grandchild's `"inherit"` finds grandparent's resolved color (not null)
4. `currentColor` is a synonym for `"inherit"` (same resolution)
5. `<Text underlineColor="currentColor">` inside `<Text color="$accent">` — underline emitted in $accent
6. `<Box borderColor="currentColor" color="$primary">` — border emitted in $primary
7. Incremental invariant: initial render + subsequent re-render both produce same output at SILVERY_STRICT=1
8. Realistic-scale: 50+ inherit chains don't stack-overflow or mis-render

## km-tui migration

The bead lists 3 consumers, but grep finds ~8. Only 3 need to change for the core bead (the 3 call sites in the bead description):

- `apps/km-tui/src/views/shared-components.tsx:544` — `context={isSelected ? { colorOverride: "$cursor" } : undefined}`. Wrapping `<Text color={isSelected ? "$cursor" : undefined}>` already sets the outer color. Inline children with `color="inherit"` Just Work — drop the override entirely.
- `apps/km-tui/src/text/InlineComponents.tsx` — inline components currently set their own colors (`$inputborder` for code, `$link` for links) even when wrapped by a cursor row. Flip them to use `"inherit"` when the parent is a cursor row — or simpler: stop applying their own color in that context.
- `apps/km-tui/src/text/link-interaction.ts:linkTextProps` — honors `colorOverride` to make links inherit the cursor color. Migrate so a cursor-row caller passes no override and links use `color="inherit"` (picking up the row's $cursor fg).

The other call sites (`NodeView.tsx`, `TreeNode.tsx`, `DetailView.tsx`, `OmniboxRow.tsx`) use `colorOverride: null` (strip all fg — cursor-safe rendering) and `colorOverride: "$selection"` (force selection color). Those are **different semantics** (strip / force), not inherit. They remain as a separate follow-up; retiring the whole context is out of scope for this bead.

## Scope de-escalation

If step-3 (`underlineColor`) or step-4 (`borderColor`) proves too invasive, ship just step-1 and step-2 (Text `color="inherit"` done correctly). That alone disables the child-propagation bug and unblocks the km-tui simplification in `shared-components.tsx`. Underline/border currentColor remain secondary follow-ups.

## Commits

1. This plan doc
2. Silvery resolver + tests — `feat(style): color="inherit"/"currentColor" cascade primitive`
3. km-tui migration — `refactor(km-tui): drop colorOverride for color="inherit" where applicable`

Every commit references `Bead: km-silvery.color-inherit`.
