# Silvery v1.x Public Launch Checklist

**Internal document. Not published.**

Operational checklist for taking silvery from "technically ready" to "publicly launched." This is the execution companion to [positioning-2026.md](positioning-2026.md) (the narrative) and [launch-strategy.md](launch-strategy.md) (multi-launch strategic phasing). Update as items land.

**Owner**: Bjørn
**Last updated**: 2026-04-09
**Target**: Silvery v1.x release (inline incremental + Ink 7.0 compat + atomicity story)

## Where we are now

| Area                | State                                                                       | Verified           |
| ------------------- | --------------------------------------------------------------------------- | ------------------ |
| Silvery core        | Ag renderer, long-lived reconciler, dirty-node tracking, inline incremental | ✓ 2026-04-09       |
| Ink 7.0 compat      | ~918/931 tests (~98.6%) after parallel agent sweep                          | Needs re-run       |
| Benchmarks          | 2.5-5.2x faster than Ink 7.0 on mounted scenarios (post STRICT bug fix)     | ✓ 2026-04-09       |
| Bundle size         | silvery/runtime 114.9 KB gzipped vs Ink+yoga 116.6 KB = **0.99x parity**    | ✓ 2026-04-09       |
| Bundle build step   | tsup pre-built dist/ for npm consumers, raw TS for Bun                      | ✓ landed           |
| Atomicity narrative | Time / space / content framing captured in blog post                        | ✓ 2026-04-09       |
| Positioning doc     | positioning-2026.md updated with atomicity + Claude Code proof-point        | ✓ 2026-04-09       |
| Blog post           | claude-code-rendering-dilemma.md in internal, draft-quality                 | Pending pro review |

## Bundle comparison (measured 2026-04-09)

The bundle parity result is significant — Silvery has structural advantages (cell-level buffer, layout-first pipeline, pure-TS flexbox) without any size penalty vs Ink+yoga. Numbers:

| Package                                                            | Minified + Gzipped | vs Ink+Yoga baseline |
| ------------------------------------------------------------------ | ------------------ | -------------------- |
| Ink 7.0 + Yoga WASM (baseline)                                     | 116.6 KB           | 1.00x                |
| `silvery/runtime` (ag + ag-react + ag-term + flexily + essentials) | 114.9 KB           | **0.99x (tied)**     |
| `silvery/ink` (Ink compat layer)                                   | 119.2 KB           | 1.02x (+2.2 KB)      |
| `silvery` (full barrel — theme, commands, tea, signals, headless)  | 277.0 KB           | 2.38x (kitchen sink) |

**Take:** Runtime parity is the number we publish. The full barrel is for people importing the kitchen sink (understandable overhead for the extra feature surface). Ink compat is +2.2 KB over baseline Ink — a rounding error.

**Caveat:** WASM-shipped Yoga includes the engine in the ~45 KB bundle figure. silvery's Flexily is pure TS (~2 KB) and ships as part of the main bundle. The comparison is apples-to-apples on wire size, but Flexily adds zero warm-up time while Yoga has one-time WASM init cost.

## Phase 1 — Stabilize silvery main (verification gates)

**Must pass before any release:**

- [ ] `bun run test:all` green across all 3 vitest projects
- [ ] Ink 7.0 compat suite — confirm exact count, target ≥918/931 (98.6%)
- [ ] `bun run bench` — confirm 2.5-5.2x canonical range holds
- [ ] Bundle build runs clean via `tsup` — dist/ is valid ESM
- [ ] No uncommitted work in vendor/silvery main (1 small useLayout.ts fix pending as of 2026-04-09)
- [ ] Typecheck clean: `bun run typecheck` → 0 errors outside vendor/ baseline
- [ ] Lint clean: `bun fix`

**Known risks:**

- `useLayout.ts` has an uncommitted fix for callback ref stability — verify with vitest
- CJK commit history — confirm all parallel agent work landed on main (some commits may have stayed in worktrees)
- Missing `bun run test:ci` verification (comprehensive: typecheck + lint + fast + slow + vendor + fuzz)

## Phase 2 — Content update (docs + READMEs)

**Internal (already done):**

- [x] `hub/silvery/launch/positioning-2026.md` — atomicity + Claude Code proof
- [x] `hub/market/blogs/silvery/claude-code-rendering-dilemma.md` — atomicity framing
- [ ] Incorporate pro review feedback once received (task bsfm8haxf in background)

**Public docs (pending):**

- [ ] `vendor/silvery/docs/index.md` — homepage hero: swap "100x faster" → "2.5-5.2x faster on mounted workloads" + atomicity callout
- [ ] `vendor/silvery/README.md` — npm landing page: same numbers, add bundle parity bullet
- [ ] `vendor/silvery/docs/guide/silvery-vs-ink.md` — complete rewrite with atomicity section + bundle parity + 918/931 compat
- [ ] `vendor/silvery/docs/guide/why-silvery.md` — use-case framing, replace synthetic benchmarks with canonical mounted numbers
- [ ] `vendor/silvery/docs/guide/faq.md` — replace all "100x" mentions with 2.5-5.2x
- [ ] `vendor/silvery/docs/getting-started/migrate-from-ink.md` — add "when should I migrate" section, reference compat %
- [ ] Promote blog post from internal → `vendor/silvery/docs/blog/claude-code-rendering-dilemma.md` (after pro review)

**Framing to apply uniformly:**

1. "React for modern terminal apps" — the core claim
2. "2.5-5.2x faster on mounted workloads" — retire "100x"
3. "99% Ink 7.0 compatible (918/931 tests)" — compat first, performance second
4. "Bundle parity with Ink+Yoga" — neutralize the "silvery is bigger" counterargument
5. "Atomic layout-first rendering" — the architectural differentiator (via blog post)

## Phase 3 — Release cut (requires user approval)

**Decisions needed:**

- [ ] Which packages get version bumps? All, or only changed?
  - Recommendation: bump all `@silvery/*` packages together for simplicity (single-version release train)
- [ ] Major / minor / patch?
  - Recommendation: **minor** (new features: backgroundContext, maxFps shim, wrap="hard", pre-built dist, atomicity story)
  - Rationale: no breaking API changes but substantial new surface
- [ ] CHANGELOG updates per package or monorepo-level?
- [ ] Release notes — highlights for GitHub release page

**Release artifacts:**

- [ ] CHANGELOG.md updated (per-package)
- [ ] Version bump committed
- [ ] Git tag pushed
- [ ] `npm publish` for each package (respect workspace topo order)
- [ ] GitHub release created with highlights
- [ ] silvery.dev docs rebuilt and deployed

**Do NOT release until:** all Phase 1 gates pass + user explicitly approves scope.

## Phase 4 — Pre-public polish (low-hanging fruit + must-haves)

**Must-have before going public:**

- [ ] **AI coding assistant demo** — working example in `vendor/silvery/examples/ai-chat/`
  - Inline scrollback mode with streaming responses
  - Shows graduation of completed messages into native scrollback
  - Demonstrates atomic rendering (no flicker, no component dropout)
  - Runs with `bun examples/ai-chat`
- [ ] **Termless .tape recording of AI chat demo** — 15-30 second clip showing:
  - User scrolling while AI streams (the signature atomic-pipeline demo)
  - Cmd+F working in graduated scrollback
  - Clean streaming without stutter
- [ ] **Termless .tape recording of kanban card edit** — shows incremental cell updates (vs full-redraw baseline)
- [ ] **silvery.dev homepage with embedded recordings** — above-the-fold GIF/SVG of the AI chat demo
- [ ] **Working "60-second install" flow** — `npm create silvery` or equivalent, producing a runnable hello-world
- [ ] **Screenshots** of kanban board + AI chat + dashboard in README

**Low-hanging fruit (nice to have, low effort):**

- [ ] Side-by-side Ink vs Silvery tape recording of identical app (the visual punch)
- [ ] "Components appearing/disappearing on scroll" reproduction demo — specifically to show atomic-pipeline advantage
- [ ] Benchmark page on silvery.dev with canonical numbers + methodology link
- [ ] `vendor/silvery/examples/` audit — every example has a README, runs, and is linked from docs
- [ ] Pretty stack traces / error messages for common mistakes (e.g., `<Box>` outside `<App>`)
- [ ] Starter template that works with `bun create silvery` (not just cloning examples)

**Larger items (track but defer if needed):**

- [ ] Interactive web playground at silvery.dev/playground (xterm.js + silvery running in-browser)
- [ ] Cheng Lou outreach re: Pretext (per launch-strategy.md)
- [ ] Proportional text rendering demo (for horizon v1.5+)

**Things NOT blocking launch:**

- Canvas target (v2.0)
- WebGL/SVG targets (v3.0)
- SolidJS integration (v1.5)
- AI agent mode (v3.0)

## Phase 5 — Public launch

**Gated on Phases 1-4 complete + user explicit go:**

- [ ] Publish blog post at silvery.dev/blog/claude-code-rendering-dilemma (promoted from internal)
- [ ] Announce on Hacker News — "Show HN: Silvery — React for modern terminal apps"
- [ ] X/Twitter thread with embedded tape recordings
- [ ] Reddit r/javascript, r/reactjs, r/commandline
- [ ] Monitor comments for technical questions, have responses ready
- [ ] `km-market.claude-code-outreach` — human-gated, NOT auto-execute. Only if user explicitly approves word-by-word draft.

## Proposed execution order (what to do in which order)

1. **Now:** Phase 1 stabilization + Phase 2 internal doc polish (in parallel)
2. **Next (this week):** Phase 2 public docs update + AI chat demo prototype (in parallel)
3. **After demos work:** Phase 3 release cut (requires user approval)
4. **After release lands:** Phase 4 polish items (tape recordings, homepage embeds, 60s install flow)
5. **Final gate:** Phase 5 public launch after user signs off on everything

## Open questions (answer as we go)

1. **Release scope:** Which packages? Single train or per-package?
2. **Domain/hosting:** Is silvery.dev live? If not, where's the hold-up?
3. **Install flow:** `bun create silvery`, `npm create silvery`, or both?
4. **Demo hosting:** asciinema.org, cast recordings on silvery.dev directly, or both?
5. **Announcement timing:** Ship blog separately from release, or together?
6. **Flexily separate launch:** Per launch-strategy.md this should go first — does that constraint still hold, or are we shipping silvery+flexily together?

## Related docs

- [positioning-2026.md](positioning-2026.md) — narrative strategy, honest numbers, messaging per horizon
- [launch-strategy.md](launch-strategy.md) — two-launch phasing (flexily standalone → silvery+pretext)
- [blog-launch.md](blog-launch.md) — blog launch tactics
- [ink-issues-research.md](ink-issues-research.md) — competitive analysis vs Ink
- [hub/market/blogs/silvery/claude-code-rendering-dilemma.md](../../market/blogs/silvery/claude-code-rendering-dilemma.md) — the headline blog post
- bead `km-silvery.positioning` — epic tracker
- bead `km-market.claude-code-outreach` — outreach action (human-gated)

## Update log

- **2026-04-09** — Created. Phase 0 (Ink-compat gap closure + bundle parity + atomicity narrative) complete. Silvery main clean (1 small uncommitted fix). Blog post + positioning doc updated. Pro review launched in background.
