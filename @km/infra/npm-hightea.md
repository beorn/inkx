---
id: "@km/infra/npm-hightea"
aliases:
  - km-infra.npm-hightea
  - km-infra-npm-hightea
created_by: claude:2ce3230f
created_at: 2026-03-05T07:45:30Z
closed_at: 2026-03-09T18:28:40Z
close_reason: "All naming decided: @silvery (registered), omlog (available),
  @bearly (registered), silvery.dev (acquired). Tracked under km-silvery epic."
---

# [x] npm naming: hightea scope + logger + misc scope @km/infra #task #P2

Research and decide npm names for three concerns:

## 1. TUI Framework Scope — DECIDED: @silvery

**@silvery** scope registered on npm. Bare `silvery` package also available (all-in-one bundle).

### Packages

```
silvery          — All-in-one bundle (re-exports react + term + theme + ansi)
@silvery/react   — Core framework (reconciler, components, hooks, pipeline, focus)
@silvery/term    — Terminal target (buffer, ANSI protocols, run(), input)
@silvery/ansi    — Chalk replacement (createTerm, styling, detection, extended underlines)
@silvery/theme   — Design tokens, $token resolution, withTheme plugin (optional, was: swatch)
@silvery/tea     — TEA state machine store (optional)
@silvery/ui      — Component library (shadcn-style, optional)
@silvery/test    — Testing utilities (createRenderer, locators, assertions)
@silvery/dom     — DOM target (future)
@silvery/canvas  — Canvas target (future)
```

### User journey
- Level 1 (ink+chalk replacement): `import { Box, Text, render, createTerm } from 'silvery'`
- Level 2 (add theming): already included via bundle, or `@silvery/theme` + `withTheme(tokens)`
- Level 3 (component library): `@silvery/ui`
- Level 4 (TEA state machine): `@silvery/tea`
- Level 5 (browser target): swap `@silvery/term` for `@silvery/dom`

## 2. Logger Name (replacing decant)

decant is too far removed from logging/observability. Need a new standalone name.

### Shortlist
| Name | Pkg | @org | Notes |
|------|-----|------|-------|
| 3log | avail | avail | "3 things: logging, debug, spans" |
| oklog | avail | avail | Simple, approachable |
| clarilog | avail | avail | Clarity + log |
| omlog | avail | avail | om prefix |
| loggily | avail | avail | Playful |

(loggish pkg taken, @org avail)

## 3. Misc Utilities Scope — @bearly

For non-framework packages (tools, utilities, etc.) that don't belong under @silvery.