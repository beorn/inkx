# Google's Ink Fork — Strategic Analysis

The `@jrichman/ink` fork is the single most informative artifact about Ink's gaps. Google's Gemini CLI team — with engineers who built Flutter DevTools — hit those gaps and patched them. Every patch is evidence for silvery's thesis.

See also: [general reference page on the fork](../../../../../Bear/Journal/ref/tui-frameworks/jrichman-ink-fork.md).

## Gap-by-gap: silvery status vs jrichman's patches

| Gap Google patched | Silvery status | Notes |
|---|---|---|
| Scrollback (stableScrollback, scroll animation backbuffer) | ✅ Shipped | Silvery has scrollback tiers and incremental pipeline |
| Sticky headers | ✅ Shipped | Silvery has sticky-children as a first-class concept |
| Dirty regions / nested static render | ✅ Shipped | Dirty-flag pipeline + incremental rendering is silvery core |
| Alternate buffer / alt-screen | ✅ Shipped | Silvery supports inline vs fullscreen modes |
| StyledLine perf | ✅ Equivalent | Silvery has its own text pipeline |
| measure-text perf | ✅ Equivalent | Flexily caches measure results via fingerprinting |
| Yoga flex-shrink workaround | ✅ Obsolete | Silvery uses Flexily, not Yoga — no workaround needed |
| Border on 0-width content | ⚠️ Verify | Check silvery handles this |
| Integer rounding for layout values | ⚠️ Verify | Check Flexily behavior |
| npx deploy render-process | N/A | Bundling concern, not framework |
| iTerm-specific fix | ⚠️ Verify | Check silvery's iTerm testing |

## What the fork tells us about the market

1. **The market wants these features.** Google wouldn't patch them in if the Gemini CLI team could live without them.
2. **Ink can't ship them.** Single maintainer + 7.0.x release line moving slowly. Forks are the only viable path.
3. **Forking is expensive.** 20+ in-flight branches, no upstreaming plan. Google is paying engineering salaries to maintain a fork.
4. **Framework-level is the right layer.** You can't patch scrollback into an app; it has to live in the renderer.

## Where silvery wins

- **All the features Google patched are already in silvery.** Not an implementation race — silvery is ahead by design.
- **Better layout engine** (Flexily > Yoga for these workloads).
- **Design system bundled** — OpenTUI has none, Ink has none, silvery has tokens + components + themes.
- **React 19 idiomatic** — doesn't fight React 18 assumptions.

## Where silvery is behind / unclear

- **Distribution**. @jrichman/ink is shipped in the #2 coding agent by stars. Silvery is shipped in km only.
- **Native perf moat** (OpenTUI's Zig). Silvery bets pure TS is fast enough; OpenTUI bets native is needed. Still TBD.
- **Ink API compat story**. If silvery exposed an Ink-compatible surface, the gemini-cli fork chain could drop silvery in. Worth prototyping.

## Recommended actions

1. **Diff `jacob314/ink` vs `vadimdemedes/ink`** — produce a full patch inventory, cross-check against silvery features. Bead candidate: `km-silvery.ink-fork-audit`.
2. **Write a "Why silvery, not Ink" page** for the silvery website — reference the fork as evidence.
3. **Prototype Ink-compat adapter** — `@silvery/ink-compat` package. If it works, it's a direct migration path for gemini-cli users.
4. **Engage Jacob Richman** — open an issue/discussion on the fork, mention silvery, see if there's collaboration interest. Low-risk, high-info.

## Source data

- Fork repo: https://github.com/jacob314/ink
- npm package: `@jrichman/ink` (6.6.2 → 6.6.9, 7.0.0-beta series)
- Maintainer: Jacob Richman, Google (Flutter DevTools background)
- Shipped in: `google-gemini/gemini-cli` (102.1k ⭐)
- Fork activity: 27 ⭐, daily commits, 20+ branches
