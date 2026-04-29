---
id: "@km/silvery/consolidate-design-demos"
aliases:
  - km-silvery.consolidate-design-demos
  - km-silvery-consolidate-design-demos
created_by: claude:c56dc5d6
created_at: 2026-04-23T17:47:51Z
closed_at: 2026-04-25T16:41:33Z
close_reason: Closed
started_at: 2026-04-25T15:26:31Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.consolidate-design-demos
    depends_on_id: km-silvery.sterling-no-negative-surprises
    type: blocks
    created_at: 2026-04-25T08:49:33Z
    created_by: claude:22c2717d
    metadata: "{}"
  - issue_id: km-silvery.consolidate-design-demos
    depends_on_id: km-silvery.sterling-storybook
    type: parent-child
    created_at: 2026-04-24T16:16:10Z
    created_by: claude:5e447b66
    metadata: "{}"
---

# [x] Consolidate design/theme viewer demos into one; document sterling tokens @km/silvery #feature #P2 @claude:22c2717d

blocks:: [[@km/silvery/sterling-no-negative-surprises]], [[@km/silvery/sterling-storybook]]

Silvery currently ships FOUR overlapping design/theme viewer apps. Consolidate into one canonical Sterling Storybook (already chosen as the chassis), absorb unique features from the others, generate docs from a single source of truth, then delete duplicates.

**This bead now depends on `km-silvery.sterling-no-negative-surprises`** — Tier 1 completeness must ship first, otherwise this work would consolidate around an incomplete system (missing disabled/backdrop tokens, mis-named StatusRole, unenforced tone-prop unions). See that bead for the foundation.

## Plan post-Pro-review (2026-04-25)

Verdict from Pro+Kimi dual review: storybook is the right chassis, but absorb 3 features before deletion. Plan revised through the asymmetric-surprise principle (no negative surprises).

## Acceptance criteria (Tier 2 + 3)

### G. tokenManifest.ts — single source of truth
- [ ] `vendor/silvery/packages/theme/src/sterling/tokenManifest.ts` (or similar)
- [ ] Per-token: `{ flat, path, family, axis, purpose, derivationKey, exampleStory, tierNotes }`
- [ ] Contract test: `Object.keys(theme).length === manifest.PUBLIC_TOKENS.length` (modulo internal helpers)
- [ ] Powers TokenTree, gen-token-docs, contrast tests, storybook examples

### H. Storybook absorbs from `design.tsx`: derivation-trace + ANSI16/256 preview
- [ ] DerivationPanel shows full trace chain with formula text (extends existing partial)
- [ ] ANSI16/256 preview as a sub-mode of TierBar — actual rendered samples, not just token list
- [ ] Verify visually that storybook now shows everything design.tsx showed

### I. Storybook absorbs from `theme.tsx`: fullscreen palette gallery (`p` mode)
- [ ] Press `p` → left pane goes fullscreen, shows all 84 palettes one-row-each
- [ ] Each row: bg-surface-default, bg-accent, fg-default, border-default
- [ ] Filters: dark/light, search by name
- [ ] Tier-collision indicator per row (helpful surprise)

### J. OKLCH triplet display in DerivationPanel
- [ ] When token selected: show `L: x.xx, C: x.xx, H: xxx° → +δ → L: x.xx`
- [ ] Reuse OKLCH math already in @silvery/color
- [ ] ~15 LOC if trace data already includes OKLCH

### K. `scripts/gen-token-docs.ts`
- [ ] Reads tokenManifest + derives Theme using a canonical doc palette (Nord)
- [ ] Emits `vendor/silvery/docs/reference/tokens.md`
- [ ] Page opens with grammar + decision tree (status vs intent, tone vocabulary, family capabilities)
- [ ] Per-family token tables with: name, hex (Nord), ANSI16 fallback, contrast vs bg, derivation rule
- [ ] Crib from Radix Colors table format

### L. CI check: docs always in sync
- [ ] `bun run docs:gen && git diff --exit-code docs/reference/tokens.md`
- [ ] Fail any PR that changes tokens without updating docs

### M. Delete duplicate apps + update aliases
- [ ] Parity verified: storybook shows everything design/theme/components showed
- [ ] Delete `examples/apps/{components,design,theme}.tsx`
- [ ] Reduce `examples/bin/registry.ts` to ONE design-system entry
- [ ] km `package.json design` script aliases to canonical app (don't rename — `bun design` still works → no negative surprise)

## Out of scope

- Cross-target preview (web/canvas) — separate bead
- Spacing/typography/density tokens — Sterling color v1 only
- Generative vs preservative mode toggle

## Dependencies

- BLOCKS ON: `km-silvery.sterling-no-negative-surprises` (must ship first)
- Sibling caps-restructure (silvery phases 7+) — wait until settled before deletion