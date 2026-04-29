---
id: "@km/silvery/dev-redesign"
aliases:
  - km-silvery.dev-redesign
  - km-silvery-dev-redesign
created_by: Bjørn Stabell
created_at: 2026-04-17T23:10:17Z
---

# [ ] silvery.dev design system rollout — Tier 2 (tokens + logo + terminal hero) @km/silvery #feature #P2

blocks:: [[@km/silvery]]

Implement the locked silvery.dev design system (hub/silvery/design/silvery-dev-design-system.md) at the minimum useful scope that makes silvery.dev distinctive.

## Scope (Tier 2 — ~150 LOC)
Stay on stock VitePress default theme. Use the built-in `home-hero-image` slot. No layout overrides.

### Phase 1 — fonts + tokens
- @import Rubik + Inter Tight + JetBrains Mono in custom.css
- Override `--vp-c-brand-*` and related VitePress CSS variables for silvery palette
- Set body/heading font-family tokens

### Phase 2 — SilveryTerminal.vue component
- Custom Vue component rendering the terminal mockup: macOS-style title bar (traffic lights + left-aligned title), thin chrome bezel, ANSI-fidelity interior
- 7-9 lines of hardcoded coding-agent content in JetBrains Mono
- Interior stays dark in both site modes
- No cursor inside terminal

### Phase 3 — Layout.vue slot wiring
- Fill `home-hero-image` slot with <SilveryTerminal />
- Register component in theme/index.ts

### Phase 4 — index.md hero config
- name: lowercase "silvery" (logo context)
- text: "React for modern terminal apps."
- tagline: "Powerful apps. Polished UIs. Proudly terminal."
- actions: Get started (brand) / The Silvery Way (alt) / GitHub (alt)
- Add blinking cursor at end of tagline via CSS

### Phase 5 — logo swap
- Replace docs/public/logo.svg with new lockup (lowercase silvery + >_ icon, Rubik Bold)

### Phase 6 — verification
- bun run docs:dev, inspect at http://localhost:5173
- Verify both modes render correctly
- No VitePress console warnings

## Deferred to later cycles (NOT this bead)
- Chrome gleam animation (decorative, adds CSS complexity)
- Custom shiny/tarnished callouts (wait until docs content demands them)
- `>` glyph arrow link restyling (simple CSS add later)
- Feature card Rubik propagation (stock VitePress features look fine)
- Ecosystem cards custom component

Those items live in `hub/silvery/design/silvery-dev-design-system.md` and can be picked off one-by-one as follow-up beads.

## Acceptance criteria
- [ ] silvery.dev renders with Rubik/Inter Tight/JetBrains Mono fonts
- [ ] Brand colors (silver, charcoal, silver-blue accent) replace VitePress indigo-violet defaults
- [ ] Logo shows lowercase "silvery" wordmark + >_ icon
- [ ] Hero right side shows SilveryTerminal mockup with ANSI-fidelity interior
- [ ] Tagline has blinking cursor at end
- [ ] Both dark and light modes look clean
- [ ] No structural VitePress customization (image slot only)
- [ ] <= 250 LOC net additions across custom.css + one Vue component + index.md + theme/index.ts

## Related
- Parent design-system bead: @km/silvery/design-system
- Decision doc: hub/silvery/design/silvery-dev-design-system.md