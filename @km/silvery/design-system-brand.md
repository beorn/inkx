---
id: "@km/silvery/design-system-brand"
aliases:
  - km-silvery.design-system-brand
  - km-silvery-design-system-brand
created_by: Bjørn Stabell
created_at: 2026-04-18T05:37:43Z
closed_at: 2026-04-18T05:43:08Z
close_reason: Merged into km-silvery.theme-custom (brand is a use-case of
  defineTokens fixed-rgb path)
---

# [x] Brand colors — conventions for app-specific identity tokens that resist scheme flex @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

## Why

Apps need identity colors that MUST NOT change when the user switches terminal schemes:
- Corporate brand hex values (km's own color identity)
- Product-specific accents (a partner-branded white-label)
- External design-guide compliance

The fixed-rgb custom-token mechanism (@km/silvery/theme-custom) provides the technical hook, but the *pattern* — when to use brand tokens vs derived tokens — needs formal guidance.

## Conventions

### When to use brand tokens
- Logo glyphs and marks
- App chrome with identity meaning (top bar logo strip)
- Signature accent (km's primary brand hue in @km/_orphan/specific UI)
- External-facing elements where users expect the brand color regardless of their theme

### When NOT to use brand tokens (prefer derived)
- Semantic state (error/warning/success) — always derive, never brand
- Body text, backgrounds — derive
- Selection, cursor, borders — derive
- Anything that should match the user's terminal aesthetic

### Naming convention
`$<app>-<role>` — e.g., `$km-brand`, `$km-shine`, `$notion-primary`. The app prefix prevents collision with silvery built-ins and signals 'this is app-identity, not derived'.

### Fallback guidance
Every brand token MUST specify ansi16 fallback:

```ts
defineTokens({
  '$km-brand': { rgb: '#5B8DEF', ansi16: 'brightBlue' },
  '$km-shine': { rgb: '#F5C542', ansi16: 'brightYellow' },
})
```

Choose ansi16 slot to match brand's hue family. At ANSI 16 tier the user's theme paints it — accept that brand identity degrades at that tier (impossible to preserve exact hex without 256+).

## Scope

- Document conventions in hub/silvery/design/v10-terminal/terminal-color-strategy.md (done — brand section added)
- Formalize naming in Silvery styling guide
- Consider: should silvery expose a '$silvery-brand' token itself? Probably NOT — silvery is palette-agnostic, shouldn't impose a brand identity on consumers

## Acceptance criteria

- [ ] Naming convention $<app>-<role> documented
- [ ] 'When to use vs not' guidance in docs
- [ ] Required ansi16 fallback for every brand token (validator or type-level)
- [ ] Style guide updated

## Related

- Parent: @km/silvery/design-system
- Companion: @km/silvery/theme-custom (provides the mechanism)
- Reference: hub/silvery/design/v10-terminal/terminal-color-strategy.md
