---
title: Token Taxonomy
description: Sterling's channel-role-state grammar — every token, when to use it, and how the flat and nested forms compose.
---

# Token Taxonomy

<p class="page-tagline">Channel · Role · State — Sterling's grammar and every token it emits.</p>

Sterling uses a **channel-role-state** grammar borrowed from GitHub's Primer, with Material's vocabulary (`error` / `warning` / `success` / `info` / `accent`). Same shape across terminal, web, and canvas targets.

```
<channel>-<role>[-<state>]
   │         │        │
   │         │        └─ hover / active / selected / disabled / focus
   │         └────────── accent / error / warning / success / info / muted
   └──────────────────── fg / bg / border / cursor
```

`fg-accent`, `bg-error`, `bg-accent-hover`, `fg-on-error`, `border-focus`. Reads left-to-right as English.

## The grammar, in full

### Channels

| Channel   | What it colors                            |
|-----------|-------------------------------------------|
| `fg-*`    | Text, icons                               |
| `bg-*`    | Area fills, surfaces                      |
| `border-*`| Borders, outlines, dividers               |
| `cursor-*`| Cursor fg / bg                            |

### Roles

| Role      | Communicates                              | Interactive? |
|-----------|-------------------------------------------|--------------|
| `accent`  | Interactive brand / links / focus         | yes          |
| `info`    | Neutral information                       | bg only      |
| `success` | Completed, passing, OK                    | bg only      |
| `warning` | Caution, deprecation                      | bg only      |
| `error`   | Failure, invalid                          | bg only      |
| `muted`   | Secondary text, captions                  | no           |

### Surface levels

Surfaces are hierarchical, independent of role:

| Level            | Use                                   |
|------------------|---------------------------------------|
| `surface-default`| Default app background (== `bg`)      |
| `surface-subtle` | Hover rows, inline muted chips        |
| `surface-raised` | Panels, dialogs, cards                |
| `surface-overlay`| Tooltips, dropdowns, toasts           |

Each surface has `$bg-surface-*`; they all pair with the default `$fg`.

### States

| State       | When                                       |
|-------------|--------------------------------------------|
| `-hover`    | Mouse hover                                |
| `-active`   | Pressed / held                             |
| `-selected` | Selected item (kept for future use)        |
| `-disabled` | Inactive                                   |
| `-focus`    | Keyboard focus                             |

State variants apply to **interactive surfaces**. Only `accent` emits `fg-*-hover/-active` (interactive text); status-role text isn't interactive.

### Emphasis / kind

| Modifier     | Use                                                            |
|--------------|----------------------------------------------------------------|
| `fg-on-<r>`  | Text color when placed on a `bg-<role>` fill (e.g., `fg-on-error`) |
| `-subtle`    | De-emphasized variant                                           |
| `-muted`     | Muted variant                                                   |
| `-emphasis`  | High-emphasis variant                                           |

## Every token Sterling ships

### Foreground (text)

| Token               | Use                                           |
|---------------------|-----------------------------------------------|
| `$fg`               | Default body text                             |
| `$fg-muted`         | Secondary — captions, hints                   |
| `$fg-disabled`      | Inactive                                      |
| `$fg-accent`        | Interactive brand — links, selected, headings |
| `$fg-accent-hover`  | Accent text on hover                          |
| `$fg-accent-active` | Accent text on press                          |
| `$fg-info`          | Info text (non-interactive)                   |
| `$fg-success`       | Success text                                  |
| `$fg-warning`       | Warning text                                  |
| `$fg-error`         | Error text                                    |
| `$fg-on-accent`     | Text on `$bg-accent`                          |
| `$fg-on-info`       | Text on `$bg-info`                            |
| `$fg-on-success`    | Text on `$bg-success`                         |
| `$fg-on-warning`    | Text on `$bg-warning`                         |
| `$fg-on-error`      | Text on `$bg-error`                           |

### Background (fills)

| Token                     | Use                                     |
|---------------------------|-----------------------------------------|
| `$bg`                     | Default app background                  |
| `$bg-surface-subtle`      | Subtle surface (hover rows, chips)      |
| `$bg-surface-raised`      | Elevated surface (panels, dialogs)      |
| `$bg-surface-overlay`     | Overlay (tooltips, dropdowns, toasts)   |
| `$bg-surface-subtle-hover`| Surface-subtle hover state              |
| `$bg-surface-raised-hover`| Surface-raised hover state              |
| `$bg-accent`              | Accent fill (primary buttons, tags)     |
| `$bg-accent-hover`        | Accent fill hover                       |
| `$bg-accent-active`       | Accent fill active                      |
| `$bg-info`                | Info fill                               |
| `$bg-info-hover`          | Info fill hover                         |
| `$bg-info-active`         | Info fill active                        |
| `$bg-success`             | Success fill                            |
| `$bg-success-hover`       | Success fill hover                      |
| `$bg-success-active`      | Success fill active                     |
| `$bg-warning`             | Warning fill                            |
| `$bg-warning-hover`       | Warning fill hover                      |
| `$bg-warning-active`      | Warning fill active                     |
| `$bg-error`               | Error fill                              |
| `$bg-error-hover`         | Error fill hover                        |
| `$bg-error-active`        | Error fill active                       |

### Borders

| Token             | Use                                        |
|-------------------|--------------------------------------------|
| `$border-default` | Structural dividers (1.5:1 contrast)       |
| `$border-muted`   | Faint secondary divider                    |
| `$border-input`   | Input / button border (3:1)                |
| `$border-focus`   | Focus ring                                 |
| `$border-accent`  | Accent border                              |
| `$border-error`   | Error border                               |
| `$border-warning` | Warning border                             |
| `$border-success` | Success border                             |
| `$border-info`    | Info border                                |

### Cursor

| Token        | Use                           |
|--------------|-------------------------------|
| `$cursor-fg` | Text under cursor             |
| `$cursor-bg` | Cursor block / line color     |

### Raw ANSI palette

| Token                | Use                                         |
|----------------------|---------------------------------------------|
| `$color0`–`$color15` | User's ANSI slots verbatim (for tagging / syntax / diff) |

## Decision tree — picking the right token

```
What are you coloring?
│
├── Body text? → $fg
│
├── Secondary text? → $fg-muted
│
├── Disabled text? → $fg-disabled
│
├── Interactive / branded text (links, selected, headings)? → $fg-accent
│
├── Status text (non-interactive)? → $fg-success / $fg-warning / $fg-error / $fg-info
│
├── Filled role (button, chip, alert background)?
│     background: $bg-accent / $bg-error / …
│     text:       $fg-on-accent / $fg-on-error / …
│
├── Elevated / floating surface? → $bg-surface-raised / $bg-surface-overlay
│
├── Subtle surface (hover tint)? → $bg-surface-subtle
│
├── Border?
│     structural: $border-default
│     input:      (auto — set borderStyle on TextInput)
│     focus:      $border-focus
│     semantic:   $border-error / $border-warning / $border-success
│
├── Tag / category / chart series (data, not UI)?
│     → $color1 / $color2 / … (ANSI palette)
│
└── Hierarchy emphasis (heading, fine print)?
     → <H1>, <H2>, <Muted>, <Small> typography presets
```

## Two shapes, same tokens

Every token has a **flat form** (the user-facing string) and a **nested form** (programmatic access). Same object, same string reference.

### Flat — the everyday surface

```tsx
<Text color="$fg-accent">Click me</Text>
<Box backgroundColor="$bg-accent-hover">...</Box>
<Alert tone="error">Something failed</Alert>     // resolves internally
```

Programmatic:

```ts
theme["fg-accent"]         // "#0969da"
theme["bg-accent-hover"]   // "#0550ae"
theme["fg-on-error"]       // "#ffffff"
theme["border-focus"]      // "#58a6ff"
```

### Nested — typed, iterable

```ts
theme.accent.fg                    // "#0969da"
theme.accent.hover.bg              // "#0550ae"
theme.surface.subtle               // "#f6f8fa"
theme.error.fgOn                   // "#ffffff"

for (const [state, pair] of Object.entries(theme.accent)) {
  // "fg", "bg", "fgOn", "hover", "active"
}
```

### Round-trip rule

```
theme.{role}.{kind}               →  {kind}-{role}
theme.{role}.{kind}.{state}       →  {kind}-{role}-{state}
theme.{role}.{state}.{kind}       →  {kind}-{role}-{state}      (same)
theme.{role}.fgOn                 →  fg-on-{role}
```

| Nested                           | Flat                         |
|----------------------------------|------------------------------|
| `theme.accent.bg`                | `bg-accent`                  |
| `theme.accent.fg`                | `fg-accent`                  |
| `theme.accent.fgOn`              | `fg-on-accent`               |
| `theme.accent.hover.bg`          | `bg-accent-hover`            |
| `theme.accent.active.bg`         | `bg-accent-active`           |
| `theme.surface.subtle`           | `bg-surface-subtle`          |
| `theme.surface.subtle.hover`     | `bg-surface-subtle-hover`    |
| `theme.border.focus`             | `border-focus`               |
| `theme.error.bg`                 | `bg-error`                   |

Both populated at derive time; no runtime lookup penalty.

## Intent vs role — `destructive`

Sterling's roles are **status tokens**: they describe what's happening. UIs also need **intent tokens** for what an action will do.

The classic case: a "Delete repository" button isn't an error — it's a destructive intent. `<Button tone="error">Delete</Button>` reads wrong.

Sterling provides `destructive` as a **component-layer intent alias**, not a base role:

```tsx
<Alert tone="error" />        // status — something failed
<Button tone="destructive" /> // intent — this will delete
<Callout tone="warning" />    // status — heads up
```

By default, `destructive` aliases to `error` (same hex). Apps can override per-component. Keeps `error` / `destructive` / `danger` / `critical` from sprawling into four near-duplicate roles.

## Anti-patterns

- **`$fg-error` for anything that isn't an error** — delete buttons, red tags. Use `tone="destructive"` on components, or `$color1` for a red category tag.
- **`$color1` for everyday UI** — palette is the user's raw ANSI, not contrast-adjusted. Use `$fg-error` / `$fg-accent` for UI, `$color*` only for data.
- **Hardcoded hex for a tinted surface** — use `$bg-surface-subtle` / `mix($bg, $bg-error, 15%)`.
- **`dim` / `dimColor` in view code** — rendering detail. Use `$fg-muted` / `<Small>` / `$fg-disabled`.
- **`backgroundColor="$bg-accent"` without `$fg-on-accent` text** — contrast will break under a theme swap.
- **`$fg-success` / `$fg-error` without an icon** — ANSI 16 users can't distinguish the hues.

## Defining your own tokens

Sterling's tokens cover the common ground. For app-specific needs (priority levels, calendar accents, brand overlays), extend with a custom DesignSystem or a token pack layered on top of Sterling. See [Custom Tokens](./custom-tokens).

## See also

- [Sterling](./sterling) — the default design system.
- [Styling](./styling) — ten principles for using these tokens.
- [Color Schemes](./color-schemes) — 22-slot scheme model + derivation rules.
- [Custom Tokens](./custom-tokens) — writing your own DesignSystem.
- [`@silvery/design` reference](/reference/theme) — Theme type and DesignSystem contract.

<!-- TODO: verify after 0.19.0 ships — confirm full list of border tokens (are `border-error/-warning/-success/-info` shipped?), exact hover/active variants for surfaces, the `destructive` default mapping location. -->
