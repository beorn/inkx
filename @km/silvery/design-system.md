---
mentions:
  - silvery
  - km
id: "@km/silvery/design-system"
aliases:
  - km-silvery.design-system
  - km-silvery-design-system
created_by: Bjørn Stabell
created_at: 2026-04-17T21:04:14Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.design-system
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-17T14:04:38Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] @silvery/design — standard-aligned design system (Polaris-structured, W3C Tokens Format, multi-target bindings) @km/silvery #feature #P2

blocks:: [[@km/silvery]]

## Why

Silvery's theme system today is color-only (@silvery/theme: 22-color palette, 33 semantic tokens). Missing: typography tokens, spacing tokens, border/density/motion tokens, component specs, foundations (accessibility, content voice, patterns) — the full vocabulary every modern web design system has.

Opportunity: Claude Design just generated a Polaris-structured design system for silvery.dev (Type / Colors / Spacing / Components / Brand). That web-side system can become the web binding of a broader abstract design package, with a terminal binding (and future canvas binding) as peer render targets.

This positions silvery uniquely: **the first TUI framework with a complete, standard-aligned design system.**

## Package name: @silvery/design

Not @silvery/tokens — the package covers tokens AND component specs AND foundations AND patterns. "Design" is accurate, concise, and mirrors "Claude Design" the tool that's generating silvery's web system.

## Package structure

```
@silvery/design
├── tokens/           — color, typography, space, border, density, motion, shadow
├── components/       — component specs (Button, Card, Hero, Callout, TextInput, ...)
├── foundations/      — accessibility, content voice, patterns
└── bindings/
    ├── term.ts       — tokens → ANSI + box-drawing + padding cells
    ├── web.ts        — tokens → CSS (exact match to Claude Design output)
    └── canvas.ts     — tokens → Canvas 2D fonts + metrics
```

Consumer API:

```ts
import { tokens, components, foundations } from "@silvery/design"
import { terminalTheme } from "@silvery/design/bindings/term"
import { webTheme } from "@silvery/design/bindings/web"
```

## Taxonomy — Polaris-structured, W3C-compliant

### Tokens layer

- **color**: brand.primary, brand.accent, neutral.fg, neutral.bg, neutral.muted, surface.default, surface.inverse, semantic.success/warning/error/info
- **typography**: display.hero-lg, display.hero-text, display.tagline, heading.h1-h4, body.default, body.meta, code.inline, code.block, code.mono
- **space**: scale (compact/default/loose), gap, pad
- **border**: weight (plain/emphasis/focus), style (line/double/thick Unicode)
- **radius**: none/sm/md/lg (terminal maps to box-drawing corner chars)
- **density**: compact / cozy / spacious (cascades across space + border + padding)
- **motion**: duration, cubicBezier (web-only; terminal maps to instant/animated flag)
- **shadow**: web-only; terminal maps to emphasis border variant
- **z-index**: web-only; terminal maps to layer presets

### Components layer

Aligned with standard design-system inventories: Button, Badge, Card, Callout, Form controls, Nav, Modal/Dialog, Tabs, Toast, Spinner, ProgressBar, Table, VirtualList, SelectList, TextInput, CommandPalette, Tree, Hero (landing).

Each component declares:

- Which tokens it consumes
- Its anatomy (sub-parts and their token bindings)
- States it supports (rest, hover, focus, disabled, loading)
- Terminal-specific behaviors (keyboard shortcuts, focus ring mapping to inverse)

### Foundations layer

- **Accessibility**: focus management rules, contrast requirements, keyboard patterns, screen reader announcements
- **Content**: voice/tone (iA-quiet, confident, developer-respecting), word choice, grammar
- **Patterns**: empty states, loading states, error states, command palette conventions, shiny/tarnished editorial callouts

## W3C Design Tokens Format compliance

Token JSON follows https://tr.designtokens.org/format/ — enables export to Style Dictionary, Figma Tokens Plugin, Supernova, etc. Format:

```json
{
  "color": {
    "brand": {
      "primary": { "$type": "color", "$value": "#..." }
    }
  },
  "typography": {
    "display": {
      "hero-lg": {
        "$type": "typography",
        "$value": {
          "fontFamily": "Outfit",
          "fontWeight": 700,
          "fontSize": "72px",
          "letterSpacing": "-0.03em"
        }
      }
    }
  }
}
```

Tokens ship as: raw TypeScript objects (for type-safe consumption), W3C JSON (for tool interop), CSS custom properties (via @silvery/design/bindings/web).

## Terminal binding — where silvery differs

Web tokens with no terminal equivalent (shadow, z-index, motion) become **feature flags** in the terminal binding. E.g., `elevation.emphasis` maps to double-line border in terminal vs. box-shadow in web. `motion.duration-fast` maps to "instant" on terminals without animation; actual timing on Kitty/Ghostty with sixel.

Terminal-specific additions NOT in web:

- **box-drawing weight tokens**: light (─), heavy (━), double (═), dashed (┄)
- **ANSI style flags**: bold, dim, italic, underline, inverse, blink, strikethrough
- **OSC protocol flags**: OSC 66 text sizing where available (graceful fallback)

These live in the @silvery/design/bindings/term module, not in the abstract tokens namespace.

## silvery.dev as the canonical web binding

Whatever Claude Design generates for silvery.dev = @silvery/design/bindings/web. silvery.dev hosts the /design page that renders the abstract tokens through the web binding. The same tokens render as terminal TUI in any silvery app via a `<DesignSystem />` component.

## Relationship to existing work

- Supersedes parts of `km-silvery.design-review` (which focused on Stage 1→Stage 2 color derivation). That bead remains valid for the color subsystem; this bead adds the full taxonomy on top.
- Pairs with Claude Design generation currently underway — when silvery.dev lands, extract it into @silvery/design/bindings/web.

