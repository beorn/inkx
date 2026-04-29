---
id: "@km/silvery/ink-compat-upgrade"
aliases:
  - km-silvery.ink-compat-upgrade
  - km-silvery-ink-compat-upgrade
created_by: Bjørn Stabell
created_at: 2026-04-09T14:53:26Z
closed_at: 2026-04-09T16:07:50Z
close_reason: "Upgraded to Ink 7.0. 871/931 passing (99.0% effective). New
  shims: useAnimation, useIsScreenReaderEnabled. 48 intentional divergences
  documented. Commit d9ff769e."
---

# [x] Ink 7.0 compat upgrade — systematic workflow for staying current @km/silvery #task #P0 @Bjørn Stabell

Silvery has an excellent Ink compat test infrastructure but it's pinned to Ink 5.2.1 (last updated 2026-03-12). Ink 7.0 is current and has added useAnimation, useBoxMetrics, useCursor, usePaste, useIsScreenReaderEnabled, kitty keyboard, incrementalRendering, and more. We need a systematic process for upgrading against new Ink releases.

## Current state (2026-03-12 audit, stale)

**Total: 804/813 passing (98.9%)** against Ink 5.2.1

Test infrastructure at vendor/silvery/tests/compat/ink/:
- generated/ — hand-ported test files (vitest)
- helpers/ava-shim.ts — AVA → vitest translator
- ANALYSIS.md, AUDIT.md, RESULTS.md — status docs
- bun run compat (vendor/silvery/packages/ink/scripts/compat-check.ts) — Layer 1: clones upstream Ink, runs its 813 AVA tests against silvery's compat layer

9 remaining failures are architectural differences (Flexily W3C spec vs Yoga, aspectRatio exposure, etc.), not bugs.

## What Ink 7.0 added

Features that need new compat coverage:
- useAnimation (new hook, minimal implementation)
- useBoxMetrics (replaces our useContentRect — compat exists in packages/ink/src/ink-hooks.ts but needs testing)
- useCursor (cursor positioning)
- usePaste (paste event handling)
- useIsScreenReaderEnabled (a11y)
- useFocus with isActive option (we have autoFocus/id, not isActive)
- incrementalRendering option on render()
- Kitty keyboard protocol support
- React Concurrent Rendering mode
- maxFps option
- waitUntilRenderFlush helper

## The compat upgrade workflow

### Process for each major Ink release

**1. Update the pinned version**
- vendor/silvery/packages/ink/scripts/compat-check.ts likely pins a version
- Bump to latest Ink release
- Run `bun run compat` and see the damage

**2. Categorize failures**
- A. Real bugs in silvery's compat layer (fix them)
- B. New Ink features we haven't implemented (add them)
- C. Architectural differences (document as intentional divergences)

**3. Update compat layer for new hooks**
- vendor/silvery/packages/ink/src/ink-hooks.ts — add shims for new hooks
- vendor/silvery/packages/ink/src/ink.ts — update render() API surface

**4. Port new test files**
- For hand-ported layer: add new .test.tsx files to tests/compat/ink/generated/
- For AVA shim layer: it should auto-pick-up new tests from upstream Ink

**5. Update RESULTS.md + ANALYSIS.md**
- New total, new failures, new categories
- Document any new intentional divergences

**6. Update docs/guide/silvery-vs-ink.md**
- New feature parity table
- Update "what Ink has that silvery doesn't" (should shrink)

### Tooling to build

**compat-upgrade.ts script** — semi-automated upgrade:
```bash
bun run compat:upgrade latest  # bumps to latest
bun run compat:upgrade 7.0.0   # bumps to specific version
```

Does:
1. Updates pinned Ink version in compat-check.ts
2. Runs `bun run compat` to get new failure count
3. Diffs old vs new RESULTS.md
4. Generates a report showing: new features, new failures, regression count
5. Prompts developer to categorize each new failure
6. Auto-updates RESULTS.md template

### Scheduled check

Add to tribe scheduler:
```bash
tribe schedule "bun run compat:check-latest" --every 7d
```

Weekly check: is there a new Ink release? If yes, broadcast and create an issue.

## Immediate action items (this upgrade)

1. **Update pinned Ink version** from 5.2.1 → 7.0 (whatever's latest)
2. **Run bun run compat** and document new failure count
3. **Add compat shims** for missing Ink 7.0 hooks:
   - useAnimation
   - useBoxMetrics (verify existing shim still works)
   - useCursor
   - usePaste
   - useIsScreenReaderEnabled
4. **Update RESULTS.md** with Ink 7.0 numbers
5. **Document new intentional divergences** if any
6. **Update silvery-vs-ink.md** feature parity table

## Longer-term

- **Automate the compat upgrade** via compat-upgrade.ts
- **Weekly check** via tribe scheduler
- **CI gate** — block silvery releases if compat % drops below threshold (e.g., 95%)
- **Migration guide updates** — whenever a new hook is added, update migrate-from-ink.md

## Files
- vendor/silvery/packages/ink/scripts/compat-check.ts (runs the AVA suite)
- vendor/silvery/packages/ink/src/ink-hooks.ts (compat shims)
- vendor/silvery/packages/ink/src/ink.ts (render API)
- vendor/silvery/tests/compat/ink/generated/ (hand-ported tests)
- vendor/silvery/tests/compat/ink/helpers/ava-shim.ts (AVA→vitest)
- vendor/silvery/tests/compat/ink/RESULTS.md (scorecard)
- vendor/silvery/tests/compat/ink/AUDIT.md (current state)
- vendor/silvery/docs/guide/silvery-vs-ink.md (public comparison)

## Effort
- Update to Ink 7.0 + new shims: 1-2 days
- Build compat-upgrade tooling: 1 day
- Set up scheduled check: 2 hours
- Total: ~3-4 days

## Priority
**P0** — staleness undermines silvery's "Ink compat" positioning claim. If users migrate from Ink 7.0 and their code breaks because we only support 5.2.1, the compat story dies.