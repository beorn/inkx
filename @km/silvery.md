---
id: "@km/silvery"
aliases:
  - km-silvery
  - "@km/_orphan/silvery"
created_by: claude:55df8ef1
created_at: 2026-03-09T18:27:29Z
owner: bjorn@stabell.org
---

# [ ] Silvery ecosystem (v1.0): packaging, release, adoption @km/silvery #epic #P2

Master tracking bead for the silvery ecosystem.

## Completed (migration)

- [x] hightea → @silvery/* package rename + npm org
- [x] silvery.dev domain
- [x] Monorepo setup (beorn/silvery with bun workspaces + changesets)
- [x] Package split (hightea monolith → @silvery/react, @silvery/term, @silvery/tea, @silvery/ansi, @silvery/ui, @silvery/theme, @silvery/test, @silvery/compat)
- [x] decant → loggily (npm published, GitHub renamed, vendor renamed)
- [x] flexture → flexily (npm published, GitHub renamed, vendor renamed)
- [x] swatch → @silvery/theme (absorbed into silvery/packages/theme, swatch repo deleted)
- [x] GitHub repos: hightea→silvery, decant→loggily, flexture→flexily
- [x] km codebase migration (190+ files, all imports updated)
- [x] ink/chalk subpath compat (silvery/ink, silvery/chalk)

## Remaining (migration cleanup)

- [ ] **@km/silvery/compat-refactor** — Move ink/chalk compat from @silvery/react to @silvery/compat
- [ ] **@km/silvery/ansi-merge** — Merge @silvery/ansi into @silvery/term
- [ ] **@km/silvery/beorn-codes** — Update beorn.codes with new project names
- [ ] **@km/silvery/site** — silvery.dev restructure for multi-target + compat messaging
- [ ] **@km/silvery/theme** — swatch web app → @silvery/theme web app

## 1.0 Release (from roadmap)

Release sequence: tree-shaking → bundle audit → border overflow fix → migration validation → terminal compat → tag + publish.

- [ ] **@km/silvery/ink-compat-audit** — Clone Ink's 31 test files, measure gaps, fix failures (P1)
- [ ] **@km/silvery/api-audit** — Remove accidental public exports (P2)
- [ ] **@km/silvery/tree-shaking** — Verify layered entry points tree-shake correctly (P3)
- [ ] **@km/silvery/bundle-audit** — Bundle size measurement + Ink comparison (P3, blocked by tree-shaking)
- [ ] **@km/silvery/border-overflow** — Fix border text overflow bug (P3)
- [ ] **@km/silvery/memory-test** — Long-running memory test, 10k+ render cycles (P3)
- [ ] **@km/silvery/migration-validate** — Test migration guide against 3+ real Ink apps (P3)
- [ ] **@km/silvery/npm-pack** — npm pack --dry-run clean tarball (P3)
- [ ] **@km/silvery/changelog** — CHANGELOG.md for 1.0 (P4)
- [ ] **@km/silvery/publish-1/0-publish-silvery-1-0-0-to-npm** — Tag and publish silvery@1.0.0 (P2, blocked by all above)
- [ ] **@km/infra/terminal-matrix** — Cross-terminal testing matrix (P4, under @km/infra)

## Testing infrastructure

- [ ] **@km/silvery/perf-bench** — Performance benchmarks: render, layout, diff, memory + Ink comparison (P3)
- [ ] **@km/silvery/unicode-tests** — CJK, emoji, combining chars, RTL (P3)
- [ ] **@km/silvery/flicker-tests** — useContentRect no-flicker, render coalescing (P3)
- [ ] **@km/silvery/visual-regression** — Visual regression via termless (P3, blocked by @km/termless)
- [ ] **@km/silvery/ci-pipeline** — GitHub Actions: unit, compat, visual, perf, cross-platform (P3, blocked by ink-compat-audit + perf-bench)
- [ ] **@km/silvery/stability-tests** — 60s sustained rendering, resize handling (P4)
- [ ] **@km/silvery/test-fixtures** — Shared fixtures for compat/visual/perf (P4)

## Positioning

silvery = the shiny new renderer. Better ink/chalk (drop-in compat), with a path to cross-platform rendering. TEA is optional gradual migration, not a prerequisite.