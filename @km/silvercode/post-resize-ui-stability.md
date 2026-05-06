---
mentions:
  - km
id: "@km/silvercode/post-resize-ui-stability"
aliases:
  - km-silvercode.post-resize-ui-stability
  - km-silvercode-post-resize-ui-stability
created_at: 2026-05-06T18:47:12.766Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.post-resize-ui-stability
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-05-06T18:47:12.766Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [/] Post-resize UI stability — components shuffle visibly before settling @km/silvercode #bug #P2

blocks:: [[@km/silvercode]]

After a terminal resize, the silvercode UI shuffles around a lot before settling — components move/reflow visibly across multiple frames instead of converging in one paint. The post-resize state should be stable.

Repro:

```
SILVERY_STRICT=1 DEBUG='silvery:*,silvercode:*' DEBUG_LOG=/tmp/silvercode-strict2.log silvercode --resume claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f
```

Then resize the terminal. Observe: layout settles only after multiple frames of visible reshuffling.

Expected: one resize event → one stable layout pass. No churn after the first paint at the new size.

Investigation pointers:

- Check Screen resize listener fan-out (`recent-transcript-layout-quality-plateau` already removed a width-derived subtree key in Content.Layout — there may be more remount triggers keyed on width/height).
- Inspect SessionUpdateList / Content / TurnActivitySummary / ToolCall / Chat for width-dependent memo keys that invalidate on resize.
- DEBUG_LOG above captures silvery:* + silvercode:* traces during the unstable window — diff timestamps between resize and final-stable frame to count reflow rounds.
- Possibly a layout-cache fingerprint miss after width change forcing N round-trips through flexily.
- Existing `recent-transcript-layout-quality-plateau` flagged a `MaxListenersExceededWarning` from repeated `Screen` resize listeners in test harness — may also indicate runtime listener fan-out.

Acceptance:

- After a resize event, layout converges within 1-2 paint passes (no visible shuffling).
- Spec-level termless test suite (below) is green — covers initial-paint, resize, and side-panel toggle in both welcome + chat session contexts.
- DEBUG_LOG with silvery:render shows ≤2 dirty cycles per stability event (vs current N).

## Test plan — spec-level UI-stability suite (termless)

Goal: a single suite that asserts "the UI converges within K frames after every stability event, in every screen context." Currently we have piecemeal coverage (welcome-no-layout-jump, welcome-startup-cascade, side-panel-stays-visible) but no shared stability-invariant primitive.

**Stability invariant.** After triggering a stability event, capture committed frames until quiescence; assert:

1. `frames.length ≤ K_MAX` (K_MAX = 2 by default; configurable per event).
2. The final frame === the frame at index 1 (or 0 for initial paint) — i.e. no late shuffles.
3. No frame between t0 and quiescence is "degenerate" (empty box, width=0, banner-not-yet-painted) — guards against the welcome-no-layout-jump regression family.
4. Optional: snapshot of the converged frame matches stored fixture per (screen, terminal-size) pair.

**Matrix (6 cells × N terminal sizes).** Recommend a small test helper `runStabilitySpec({ screen, event, sizes })` so each cell is one `test()` call.

```
                │  initial paint  │      resize       │  side-panel toggle  │
────────────────┼─────────────────┼───────────────────┼─────────────────────┤
welcome screen  │ paints banner + │ welcome reflows   │ panel show/hide does│
                │ features in ≤2  │ within K_MAX after│ not retrigger banner│
                │ frames          │ cols→cols' change │ measurement         │
chat session    │ resumed session │ session updates / │ sidebar toggle does │
                │ paints in ≤K    │ tool calls keep   │ not reflow chat list│
                │ frames after    │ position after    │ or scroll position  │
                │ session-init    │ size change       │                     │
```

**Termless hook-in.** For event-driven cells (resize, side-panel toggle) drive the silvery `Screen` resize listener directly (mirrors what termless does on real terminal SIGWINCH). For initial-paint cells the existing `singlePassLayout: true + onFrame` pattern from `welcome-no-layout-jump.test.tsx` is the template — extend to chat sessions by mounting via the same harness used in `keyboard-scroll.test.tsx` / `pane-headers.test.tsx`.

**Fixtures, not the live session.** The live session `claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f` is great for ad-hoc reproduction (it shuffles a lot — easy to eyeball) but it CANNOT be the regression-test fixture: real Claude transcripts mutate, contain PII, depend on session state on disk, and break reproducibility on CI. Build a **frozen fixture** instead:

- Capture a representative sequence of ACP `session/update` events from the live session into a JSON fixture under `apps/silvercode/tests/fixtures/stability/` — e.g. `chat-mid-stream.json`, `chat-tool-call-active.json`, `welcome-fresh.json`. The existing `fakeSpawn`/fake-ACP harness (used by `acp-fake.md` family + `acp-resume-blank-screen` regression) is the replay surface.
- Each fixture should be a minimal slice that reproduces the instability in the live session — N session updates, M tool calls, content that exercises the wrap/measure paths likely to thrash on resize. Trim aggressively: smaller fixtures = faster tests, easier diff review.
- The `chat-session` test cells load the fixture, drive resize/sidebar events through the same harness, and run the stability invariant on the captured frames.
- Use the live session ONLY to (a) capture the initial fixture seed and (b) sanity-check that fixes track real-world feel — never as a CI input.

**Terminal sizes to cover.** Use the `test-resize-matrix` bead's set as a starting point (narrow 80×24, prod 120×40, wide 200×60). Width-sensitive bugs only show outside the default — see memory `feedback-km-view-test-dimensions`.

**Side-panel cell specifically** must verify the chat list does NOT re-measure or re-scroll on toggle — the current symptom suggests width changes propagate too eagerly through memo keys.

**Instrumentation taps.** Keep `DEBUG=silvery:render,silvery:layout,silvercode:*` available behind a flag so a failing test can dump the frame-by-frame trace into `/tmp/silvercode-stability-<test-id>.log` for triage. Do NOT emit on green runs.

**Ordering.** Land the stability-invariant helper + welcome-screen cells first (they reuse existing patterns). Chat-session cells block on a fake-ACP harness already used by `acp-fake.md` family — reuse, don't recreate.

## Status (2026-05-06)

**Phase 0 — Diagnosis** ✓ landed at `hub/silvercode/diagnosis/post-resize-instability.md`. Ranked suspects (static-analysis hypotheses):

1. silvery `notifyLayoutSubscribers` multi-pass cycles (framework, HIGH).
2. SessionUpdateList `itemKey()` / `renderItemKey()` width deps (app, MEDIUM-HIGH).
3. `Content.Layout` context value not memoized (app, MEDIUM).
4. Width-responsive style-prop incremental cascade (framework, MEDIUM).
5. PaneGrid+SidePanel show/hide remount (app, LOW-MEDIUM).

**Phase 1 — Stability invariant + welcome cells** ✓ landed at `apps/silvercode/tests/lib/stability.ts` + `welcome-stability.test.tsx`. 8 helper self-tests + 3 welcome cells (initial-paint, resize, side-panel-toggle), all green.

**Phase 2 — Chat cells** ✓ landed at `chat-stability.test.tsx` using the existing `markdownRich` script. 3 cells (post-arrival paint, resize, side-panel-toggle), all green.

**Phase 3 — Fix iterations** (root cause traced via live STRICT log, no in-test reproduction available).

### Attempt 1 (commit `5974b4c89`) — AsideLayout always-mount: REVERTED

Hypothesis: subtree remounts during mode flips drive the feedback loop. Rewrote `AsideLayout` to render the aside subtree always, varying only layout props.

**Verdict**: made things worse. User re-ran live repro (`/tmp/silvercode-strict3.log`); STRICT overflow count went from **150 → 545**. The 88↔120 oscillation pattern was unchanged. AsideLayout reverted to original.

### Attempt 2 — Content.Row structural fix + Content.Layout memoization

Traced the actual feedback loop to `Content.Row`'s structural branch on `usesMeasuredGeometry` (= `ctx.available > 0`). Every `available=0 → available>0` transition rebuilt the Row subtree, which fed fresh useBoxRect measurements into descendants → ContentContext consumers re-rendered with new `available` → loop. The 88↔120 oscillation was a *secondary* symptom; the *primary* loop was the 0↔N transition through the structural branch.

**Fixes applied**:

1. `Content.Row` rewritten to render a SINGLE React tree across all measurement states (no `if (!usesMeasuredGeometry)` early return).
2. `Content.MeasuredLayout` context value wrapped in `useMemo` so consumers don't re-render on identity-only changes.

**In-test status**: 19 stability cells + 43 existing content-layout cells all green. No regressions.

After the user ran the live repro and shared `/tmp/silvercode-strict2.log` (3.9 MB / 27955 lines):

- **150 STRICT layout-overflow violations** in a single workspace-switch cycle. Top patterns:
  - 40× box width 126 vs parent inner 94 (overflow = 32 = sidebar width — stale measurement)
  - 36× box width 94 vs inner 81
  - 4× silvery-text width 336 vs inner 85 (long unwrappable token)
- **Width oscillation** — single workspace switch produces 11 distinct width transitions in 1 second:
  - `0 → 94 → 120 → 88 → 120 → 88 → 120 → 88 → 0 → 94`
  - The 88↔120 pattern is the sidebar-visibility breakpoint flipping per pass.
  - The transient `available=0` indicates a subtree remount.
- **Trigger is cmux workspace switch**, not user resize. cmux fires 4-6 SIGWINCH events at the TTY level on hide/show. Confirmed reference: Claude Code (Ink-based, also fullscreen) under same cmux switch is stable — bug is silvercode-specific.

**Root cause**: `AsideLayout` (`apps/silvercode/src/components/AsideLayout.tsx`) conditionally rendered THREE structurally-different React subtrees per mode (`hidden`/`inline`/`overlay`). Every mode flip during a SIGWINCH tore down the SidePanel subtree and rebuilt it, feeding fresh dimensions into the breakpoint logic that flipped mode again — feedback loop until something broke it.

**Fix**: rewrote `AsideLayout` to render the aside subtree ALWAYS, varying only layout props (`display`, `position`, `width`, `flexBasis`) by mode. Single React tree. SidePanel never unmounts during a SIGWINCH. Wrapper always `position="relative"` (no-op for inline/hidden, correct anchor for overlay).

**Test suite**: 19 cells passing pre and post fix (no regression). Cells include cmux-multi-SIGWINCH burst + focus-regain + stress-unwrappable to detect future regressions, even though current termless harness lacks the real-TTY paths to reproduce the live symptom.

**Verification needed**: user re-runs `silvercode --resume claude:f9eb64dc-…` post-fix and compares (a) STRICT overflow count (was 150) and (b) visible shuffle.

**Follow-ups (out of scope, file as new beads)**:

- `createFixedSize` (test harness) doesn't coalesce — production has 16ms coalescing in `createSize`. Test-fidelity gap.
- Long-unwrappable-token (336-wide silvery-text) source unidentified. Needs missing `wrap="wrap"` or `minWidth={0}` in some Chat/SessionUpdateList/MarkdownView subtree. With feedback loop broken, may not compound into a cascade anymore — verify first.

---

## Pre-fix status (now superseded)

**Phase 3 — Fixes** *was blocked* on a failing cell. None of the 6 termless cells reproduced the live-session symptom. Likely reasons:

- The instability needs *more* content than `markdownRich` provides (the live session is 19,990-line / 37 MB JSONL).
- Termless does not exercise real-TTY async paths (Kitty CSI probes, focus-reporting replies, real SIGWINCH stream); the symptom may live there. The `welcome-startup-cascade.test.tsx` docstring already calls this out.

**Next options** for unlocking Phase 3:

- (a) **Synthesize a stress fixture** — combine many turns + tool calls + long markdown. If a cell flips RED, the suspect ranking can be validated by trying fixes (Suspect 3 first — one-line `useMemo` is low-risk).
- (b) **Real-TTY smoke verification** — run the live repro under `peekaboo` capture, compare frame count per resize against an instrumented baseline (`SILVERY_INSTRUMENT=1 DEBUG=silvery:render`). Confirms whether the bug lives in real-TTY async paths.
- (c) **Capture a redacted minimal fixture** from the user's session — script that anonymises user prompts/responses but preserves ACP event structure. Requires a converter from Claude Code JSONL → AgentEvents and a redaction pass.
- (d) **Commit the scaffold as-is** for future regression detection; defer Phase 3 fixes until the bug recurs in a fixture-capturable form.

The 6-cell suite runs in `apps/silvercode/tests/welcome-stability.test.tsx` + `chat-stability.test.tsx`. Total 14 tests with helper self-tests, ~8 s wall-clock.


## Update 2026-05-06 — narrow win + reframe filed

silvery-expert audit identified the load-bearing feedback edge: `Content.Row` was writing `width={middleWidth}` AND `maxWidth={middleWidth}` on the middle Box (Content.tsx:378-379), propagating measured pixel widths upward into the row's intrinsic-sizing pass. Each silvery convergence pass re-used that propagated width, producing the 88↔120 oscillation.

Fix landed (commit `7923bc8c7`): drop `width=`, keep `maxWidth=` only. Lets flexily own the resolved width; `maxWidth` is a hint, not an authoritative size.

Empirical: 248 → 236 STRICT overflows (PTY repro), 88↔120 oscillation gone (transitions now monotonic: 0 → 94 settle → burst-driven only).

This is L1 → L2 (runtime guard catches the prop-feedback edge). Residual ~236 STRICT is mid-burst transient overflow during convergence — flexbox clears it within the bounded loop, not a feedback edge.

L4 reframe filed as `@km/silvery/use-deferred-box-rect-and-post-commit-observers`: silvery framework gets a `useDeferredBoxRect()` returning the committed rect (idempotent across passes) plus an explicit post-commit observer phase. After that ships, this entire class of feedback-loop bugs is impossible by construction.

## Update 2026-05-06 — /pro consensus + AsideLayout out-of-flow attempt

Three-leg /pro review (GPT-5.4 Pro x2 + Kimi K2.6, $5.02, judge tied) converged: dominant remaining feedback edge is AsideLayout's mode-flip changing the row's child-set, not useBoxRect itself. Consensus fix: aside as `position: absolute` always, `paddingRight` reserve on main column for inline mode. Single React tree, no flex-sibling participation by aside.

Tonight's empirical attempt at the consensus rewrite: STRICT spike to 566 vs 176 prior. The 88↔120 oscillation persisted plus new `width=N exceeds inner width=0` overflow at startup — the absolute-overlay variant introduces its own measurement-during-pre-measure issues. Reverted to the prior in-flow flex-sibling AsideLayout.

PTY repro variance is high (run-to-run swing 176↔326 with no code changes — the live --resume session has streaming variation that affects the count). The repro alone isn't reliable enough to A/B small fixes; need either a deterministic fixture or to trust visible behavior over STRICT count.

Filed beads to capture the architectural target:
- @km/silvery/use-deferred-box-rect-and-post-commit-observers — the L4 mechanical fix (in flight, silvery agent)
- @km/silvery/ergonomic-responsive-primitives — Lane / Aside / useResponsiveDisplay surface
- @km/silvery/layer-primitive — `<Layer>` for out-of-flow rendering, where AsideLayout-overlay belongs

Net session result: silvery 100ms trailing-edge debounce shipped (vendor `b26b8476`), Content.Row pixel-width drop shipped (`7923bc8c7`), transcript-replay yield shipped (`4b0e48ba5`). Visible: focus-change stable per user, but startup and resize remain unstable. The architectural work in the silvery beads is the actual fix path; tonight's session brought the picture into focus but didn't land a visible-bug fix.
