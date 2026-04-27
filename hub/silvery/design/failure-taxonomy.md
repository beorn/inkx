# Failure taxonomy — fix-sweep-vendor-fuzz (G1)

Classification of every closed sub-bead under [km-all.fix-sweep-vendor-fuzz](../../../.beads/issues.jsonl) by root cause category. Output of gate G1 of [km-all.plateau-90](../../../.beads/issues.jsonl).

## Bead-count discrepancy

The parent epic's title says "49 vendor + 5 fuzz test failures" — those are **test counts**, not bead counts. The actual closed-children count is **14 beads** (each bead bundles a cluster of related test failures). The "49+5=54" framing in plateau-90's G1 description refers to tests, but the gate acceptance ("every closed sub-bead … mapped to exactly one category") is bead-level. This document classifies the 14 beads.

For reference, the 14 beads collectively cover the original 54 tests (vendor failures clustered into 13 beads + 1 fuzz bead).

## Counts

| Category | Beads | Share |
|---|---:|---:|
| test infrastructure | 7 | 50% |
| render-phase ordering | 3 | 21% |
| upstream-bug | 1 | 7% |
| layout convergence | 1 | 7% |
| other (packaging / feature wiring) | 2 | 14% |
| lifecycle/ownership | 0 | 0% |
| **Total** | **14** | **100%** |

## Dominant category

**Test infrastructure (7/14, 50%)** — half of the sweep was test code mismatched with current API/runtime, not production code defects. This includes test-API drift (AsyncDisposableStack rewrite), Bun-runtime gaps (`globalThis.gc` undefined), matcher-override last-write-wins, missing test setup options (`handleTabCycling: false`), tests that never passed from creation, and stray debug `console.log` lines tripping vitest's console-quiet harness.

**Render-phase ordering** is the dominant **production-code** category (3/14, 21%) — all three traced to a single seam: `clearExcessArea` and Tier 1 buffer shifts firing in the wrong order relative to absolute-child cascades. A single guard (`hasPrevBuffer`) closed both `km-all.fuzz-failures` and `km-silvery.ai-chat-incremental-mismatch`; a related Tier-1-shift gate fixed `km-silvery.listview-test-failures`.

**Lifecycle/ownership: 0 beads.** No bead in this sweep was rooted in resource ownership, scope cleanup, or handle leaks. The closest neighbour — `km-silvery.scope-test-failures` — was a test-API rewrite for the AsyncDisposableStack-shaped Scope API, not an ownership defect; the Scope mechanism itself was already correct. Implication for plateau-90 R1/C1: the ownership-as-deepest-seam hypothesis (Kimi) is **not** supported by this dataset. Render-phase ordering is the only production-code seam that recurs.

## Per-category breakdown

### test infrastructure (7)

- **km-flexily.silvercode-gutter** — leftover debug `console.log` in NARROW + MINIMAL tests; vitest setup throws on per-test console output. Real layout fix had already shipped (flexily c34237b). Test-only delta.
- **km-silvery.examples-tests** — Tab→submit failure fixed by passing `handleTabCycling: false` in test setup so Tab reaches `useKeyBindings.fillOrSubmit`. Test-setup option, not a pipeline change. (The other two failures in this bead were split out as production-code bugs — see render-phase / layout-convergence sections.)
- **km-silvery.feature-test-cluster** — `AIChat run()` opts + test setup pass `handleTabCycling: false` (test setup); `box-in-text-warning.test.tsx` updated to handle loggily's `console.warn(prefix, message, ...args)` signature using `mock.calls.some()` (test-API match). `pipeline-bugfixes` and `text-frame` already passed on main.
- **km-silvery.hooks-memory-perf** — `getHeapUsedMB()` called `globalThis.gc()` (undefined on Bun, no GC ran); tests needed JIT/allocator warmup before measuring; intermediate GC during loop; termless harness threshold 300→600 KB/iter to clear Bun mimalloc chunk-grant noise. All in test-measurement code; no production memory leaks.
- **km-silvery.scope-test-failures** — 15 tests in `scope.test.ts` rewritten for AsyncDisposableStack API. Production Scope behaviour was correct; tests were on the old API surface.
- **km-silvery.use-ag-node-signals** — tests had wrong expectations from creation (commit 953afc44, never passed). Production `useAgNode` reads parent NodeContext correctly; tests assumed function components own AgNodes. Fix: invoke Inspector inside the Box.
- **km-termless.matcher-locator-shape** — km-tui's `matchers.ts` overrode termless's `toHaveText`/`toContainText` (last-write-wins in `expect.extend`). Incomplete delegation to termless for RegionView/TerminalReadable shapes. Test-helper architecture defect, not production behaviour.

### render-phase ordering (3)

- **km-all.fuzz-failures** — `clearExcessArea` firing for absolute-positioned children even after parent's `absoluteChildMutated` cascade had re-rendered siblings; clearExcessArea then stomped fresh sibling pixels with the absolute child's inherited `bg=null`. Fix: gate on `hasPrevBuffer` (silvery 168b4989). Closed all 6 fuzz failures including listview-scroll-properties INV-2, render-fuzz scrolling-tiny seed=42, and the persistent nested seed=1337 incremental-mismatch.
- **km-silvery.ai-chat-incremental-mismatch** — same root cause as above (`clearExcessArea` post-cascade ordering). Reproducer was `ai-chat.test.tsx:110` ("Enter 1") tripping SILVERY_STRICT at (118, 36) on render #20 with `bg=null` vs `bg=[obj]`. Same fix in silvery 168b4989.
- **km-silvery.listview-test-failures** — Tier 1 buffer shift was firing without checking for overlapping absolute siblings + popover updates. Fix: gate Tier 1 shift on absence of overlapping absolutes (silvery d0c8a5dd). Distinct mechanism from the `clearExcessArea` ordering, but same category — incremental-render phase running before its preconditions are satisfied.

### layout convergence (1)

- **km-silvery.listview-resize-scroll-target** — during multi-pass layout convergence (resize → contentHeight grows as items measure → cached offset clamped far above target), `scrollToChanged===false` blocked ensure-visible from re-firing in `calculateScrollState`, leaving the target off-screen and tripping STRICT INV-2. Fix: same-intent recovery branch — re-fire ensure-visible when cached offset has the target completely off-screen (zero intersection with raw viewport). Plus 15-iter single-pass cap. Direct convergence/feedback-edge bug — what plateau-90 C3a (renderer-feedback-trace) and C3b (bounded-convergence) target.

### upstream-bug (1)

- **km-bearly.test-failures-vendor-fuzz** — primary fix: Bun 1.3.x's `http.Server` does NOT fire server-side socket close events when a keep-alive client disconnects after a completed response ([oven-sh/bun#7716](https://github.com/oven-sh/bun/issues/7716)). MCP plugin tracked leases via `connection`/`close`/`error`, which silently froze the lease counter on Bun. Workaround: refactored lease tracking to active in-flight HTTP responses, listening on both `res.on('close')` and `req.on('close')`. (Secondary fix — `parser.test.ts` warning silencing — was test infrastructure but is a sub-issue of this bead; the primary code change was the upstream-driven workaround.)

### other (2)

- **km-silvery.editcontext-export** — missing dev exports for `ui/components` subpaths in `vendor/silvery/packages/ag-react/package.json`. The `publishConfig.exports` + `tsdown.entry` already listed them; only the dev `exports` field was missing them, and the wildcard fallback `./*: ./src/*.ts` doesn't match `.tsx` files. Package-config defect, not test-infrastructure or production-code behaviour.
- **km-silvery.hybrid-output-phase3** — feature-wiring task, not a bug fix. Reconciled hybrid-output cost constants with design doc (12/10/2/8/2) and wired `SILVERY_HYBRID_OUTPUT=1` flag through `output-phase.ts`. Forward-progress work, not a regression repair.

## Implications for plateau-90

1. **Ownership-as-seam (Kimi C1 hypothesis): not supported.** Zero ownership-rooted beads in this sweep. The strongest production-code seam is render-phase ordering (3/14), not lifecycle. Recommendation: treat C1 (scope-resource-ownership) as **prophylactic hardening**, not as remediation of observed failures — the case for it must come from the slow memory canary work, not from the fix-sweep history.

2. **Render-plan-commit (C2) priority should rise.** All three render-phase beads have the same shape: an incremental-render step running with stale assumptions about what the cascade has already done. C2's render-plan-commit / double-buffer-swap / damage-list-composition options each make the wrong-order call site impossible. This validates the C2 promotion to P1 in plateau-90.

3. **Test-infrastructure dominance is real, but not a plateau-90 target.** Half the sweep was test-code work. That's a healthy signal (production code was less broken than the failure count suggested) but it means plateau-90's structural-hardening framing applies to ~6 of 14 beads, not all 14. The G2 rubric should explicitly mark test-infrastructure beads as L0 (workaround/threshold/env tweak) — they are by definition not architectural hardening, and the program shouldn't pretend they are.

4. **Layout convergence (C3a/C3b) has only 1 datapoint here.** Don't over-fit. The C3a renderer-feedback-trace instrumentation is exactly the right next step — it produces the data needed to decide whether C3b's bounded-convergence work targets a real recurring class or this single resize-edge case.

5. **Upstream-waiting registry (R2) needs a Bun-keepalive entry.** The `km-bearly` MCP fix is currently coded as a permanent local refactor, but the lease-tracking-on-responses change was driven by an open Bun bug. R3 already calls this out (split into bun-keepalive-url-shim + mcp-lease-tracking). Confirmed by taxonomy.
