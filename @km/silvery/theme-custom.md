---
mentions:
  - km
id: "@km/silvery/theme-custom"
aliases:
  - km-silvery.theme-custom
  - km-silvery-theme-custom
created_by: Bjørn Stabell
created_at: 2026-04-18T03:51:17Z
closed_at: 2026-04-18T18:27:41Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-custom
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T20:51:41Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.design-system
---

# [x] Theme custom tokens — authored themes + defineTokens for app-specific brand colors @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

defineTokens() API for extending the theme with derivation-style OR fixed-rgb brand tokens.

## Two paths

**Derivation (semantic extensions):**

```ts
defineTokens({
  '$priority-p0': { derive: (s, t) => s.brightRed },
  '$priority-p1': { derive: (s, t) => blend(t.warning, t.bg, 0.2) },
})
```

Re-derives when scheme changes.

**Fixed-rgb (brand tokens):**

```ts
defineTokens({
  '$km-brand':   { rgb: '#5B8DEF', ansi16: 'brightBlue' },
})
```

rgb at truecolor/256, ansi16 slot at ANSI 16, attrs at mono. ansi16 REQUIRED.

## Brand conventions

- Use for: logos, identity chrome, signature accents
- Avoid for: semantic state, body text, selection/cursor/borders (prefer derivation)
- Naming: $<app>-<role>
- Every brand token must specify ansi16 fallback

## Scope rules

- Can't override built-ins (throws)
- App-scoped registration
- TypeScript augmentation for autocomplete

## Acceptance

- [ ] Both paths work; mutually exclusive
- [ ] rgb without ansi16 throws
- [ ] Built-in override throws
- [ ] All tiers render correctly
- [ ] Brand conventions in styling guide

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system
Merged: design-system-brand

