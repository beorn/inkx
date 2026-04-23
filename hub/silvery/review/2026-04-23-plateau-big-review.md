# /big Review — Terminal Profile Plateau (Phases 1-4)

**Date:** 2026-04-23
**Bead:** [`km-silvery.terminal-profile-plateau`](../../../../.beads/) (CLOSED)
**Phases:** P1 ab6ce644 (ColorTier canonical) · P2 af7d8b28 (Term.caps non-optional) · P3 fbd76097 (createTerminalProfile SoT) · P4 2fff14c6 (entry-point unification)
**Reviewer:** silvery subagent (rendering expert)

---

## Phase 1: See the Problem Five Ways

1. **User-visible symptom (historical).** km-logview rendered blank in production but all tests passed. `FORCE_COLOR` silently didn't propagate. `Term.caps` was sometimes `undefined`.
2. **System perspective.** A structural invariant — "there is exactly one terminal resolution per process, and the pipeline observes it" — was enforced by convention across three enum spellings, two detection functions, and three constructors. The pipeline computed different answers depending on which entry point and which constructor produced the Term.
3. **Architectural view.** Detection was a *layer concern* masquerading as a set of utility functions. There was no owner for "the current terminal's resolved profile"; every entry point (run.tsx options path, run.tsx Term path, createApp.run, render, ink compat, termless, detectTerminalCaps) re-derived it independently and read from `process.env` directly. The plateau puts the resolution in a typed object (`TerminalProfile`) that's built once and threaded.
4. **Historical.** This is at least the 4th related incident:
   - 6c4442ee: `selectionEnabled ?? false` default drift
   - 48143ef0: `detectTerminalCaps` didn't honor `FORCE_COLOR` (docstring claimed it did)
   - 915b4bf9: mouse drag state machine default drift
   - The plateau (this) — caps optional, color-tier triple-spelled, detection duplicated.
   All four are the same failure mode: **a documented default in a hot-path function was never exercised by tests because callers passed the option explicitly.** `bun recall "defaults contract"` confirms the pattern and the Phase 1 contracts convention that was seeded in response.
5. **Counterfactual.** In a perfectly designed system, there would be one answer to "what is the current terminal's profile?" and that answer would be a non-optional, typed field reachable from every render path. Entry points would not take `caps`/`colorLevel`/`colorOverride` as free-floating options; they would take a `TerminalProfile`, and the profile factory would own every precedence decision.

The plateau refactor reached the counterfactual about 80% of the way. Gaps: `detectTheme` is still separate and async; `TerminalProfile` is not yet the *required* argument to every entry point (profile is optional, caps/colorLevel still coexist); two case-sensitivity copies of the TERM_PROGRAM comparison still exist (`profile.ts:295` vs `text-sizing.ts:75`).

---

## Phase 2: Hypotheses (Round 1 — 16 enumerated)

| #   | Category              | Hypothesis                                                                                                                                                                                                                                                                                |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Missing invariant     | The Ghostty case-sensitivity bug (profile.ts:295 `"ghostty"` vs detectColorFromEnv "Ghostty") is a second copy of the same comparison inside one file. The refactor created the bug by copying `detectColor`'s `"Ghostty"` string into `detectColorFromEnv` while the caps probe kept the legacy lowercase. **Need to verify when the lowercase was introduced.** |
| H2  | Unification           | `detectTheme` (async, OSC probe, lives in run.tsx) should be a member of `TerminalProfile` — `profile.theme` — and the profile factory should be `async createTerminalProfile({ probeTheme?: boolean })`. Then run() becomes a one-liner.                                                                                                                                                                    |
| H3  | Wrong ownership       | `RunOptions.caps` and `RunOptions.colorLevel` are still free-floating. They should be removed in favor of `RunOptions.profile` only. Today any caller can pass `{ caps: X, colorLevel: Y, profile: Z }` — three sources of truth at one call site.                                                                                                                                                                                         |
| H4  | Missing invariant     | `output-phase.ts:175-177` still uses `caps.underlineStyles ?? true, caps.colorLevel ?? "truecolor"`. Caps is non-optional in `Term.caps`, but `createOutputPhase` accepts `Partial<OutputCaps>` — so the guard survived. Is that justified or a leftover?                                                                                                                                                                             |
| H5  | Missing abstraction   | `TerminalProfileSource` is a private attribution tag. The *real* abstraction it implies is **"forced vs natural tier"** — a boolean derived from source. Every use of `source` is `source === "env" \|\| source === "override"`. Maybe `profile.forced: boolean` is the real primitive.                                                                                                                                                   |
| H6  | Deletion              | The `detectColor` and `detectTerminalCaps` shims in detection.ts (and their re-exports through `@silvery/ansi` + `ag-term`) could be deleted now that profile.ts owns detection. km-tui and command-bridge.ts still call `detectTerminalCaps()` — 2 call sites. Migration is trivial.                                                                                                                                                                                 |
| H7  | Wrong layer           | `isTextSizingLikelySupported` reads `process.env.TERM_PROGRAM` directly (text-sizing.ts:75) with its own `.toLowerCase()`. It should consume `TerminalProfile.caps.program` (plus `TERM_PROGRAM_VERSION`) — NOT re-read env. This is the "every fact from env is read by every consumer" failure mode the plateau set out to eliminate.                                                                                                                               |
| H8  | Wrong layer           | Same issue in `scroll-region.ts:55`, `output.ts:285`, `ag.ts:256`, `term-def.ts`, `ink/chalk.ts:45/103`, `termtest.ts:15`. The plateau fixed the *big* entry points but not the *long tail* of env-reads. "One profile" is only true if consumers read it instead of bypassing it.                                                                                                                                                                                              |
| H9  | Missing invariant     | Headless `createHeadlessTerm` caps default to `mono + noUnicode + noMouse`, but `createBackendTerm` (emulator) defaults to `defaultCaps()` which is truecolor + unicode + mouse. A test author choosing between them gets wildly different cap profiles without a clear reason — the two headless paths should collapse or the distinction should be named.                                                                                                              |
| H10 | Prior art             | chalk / supports-color use a single function + memoization. Ink uses `supportsColor.stderr`. Node's `getColorDepth()` is a built-in since v9.9. Should the profile factory just *defer* to `process.stdout.getColorDepth()` on modern Node? It's 1 LOC and handles `NO_COLOR`/`FORCE_COLOR`/ `NODE_DISABLE_COLORS` authoritatively.                                                                                                                                    |
| H11 | Inverse               | Instead of deriving `caps` from env in the factory, what if `caps` were the primary input and env-var overrides were applied as a *post-processor*? Today env wins first; overrides second; caps third. That order is surprising — a caller who passes `caps` expects caps to win unless env explicitly overrides. Is the current precedence right?                                                                                                                   |
| H12 | Missing abstraction   | `TerminalProfile` has `caps` (canonical cap set) and `colorTier` (duplicate of `caps.colorLevel`) and `source`. That's ~3 public fields, one of them redundant. A `DerivedProfile` type with methods (`profile.isMonoForced()`, `profile.wantsPreQuantize()`) would be cleaner than field + boolean-derivation at each call site.                                                                                                                                      |
| H13 | Missing invariant     | The 46 profile tests pin every precedence rung — but no test pins *every caps field* for the known terminal matrix (Ghostty, Kitty, WezTerm, Alacritty, Apple_Terminal, iTerm.app, xterm, screen/tmux, CI). The case-sensitivity bug (H1) would have been caught by a "Ghostty → `caps.kittyKeyboard === true`" test. Snapshot-style matrix test missing.                                                                                                            |
| H14 | Inverse               | The 14 pre-existing failures (focus, useBoxMetrics, use-ag-node) — are any of them the *same* docstring-drift class? If so, the plateau fixed the color class but missed the focus/metrics class, and the right follow-up is another plateau refactor for that subsystem.                                                                                                                                                                                                |
| H15 | Composition           | Phase 4 introduces two ways to pass a profile (RunOptions and AppRunOptions), both of which auto-build one if absent. The *third* way — `createTerm()` — silently calls `detectTerminalCaps()` and does NOT build a profile. So the profile is SoT for the entry points but not for the Term itself. A Term that was built from a profile should remember that.                                                                                                                                                             |
| H16 | Deletion              | `RunOptions.caps` can probably be deleted (not just deprecated) in favor of `RunOptions.profile`. The only callers that pass raw caps are tests and the runtime internal (`termProfile.caps`). Remove caps, require profile-or-nothing.                                                                                                                                                                                                                              |

---

## Phase 3: Exploration (each hypothesis)

### H1 — Ghostty case-sensitivity (NARROW → BROAD)

**Evidence.**

- `profile.ts:243` in `detectColorFromEnv`: `if (termProgram === "Ghostty" \|\| termProgram === "WezTerm")` — correct.
- `profile.ts:295` in `detectTerminalCapsFromEnv`: `const isGhostty = program === "ghostty"` — **bug**.
- `detection.ts:109` in `detectUnicode`: `["iTerm.app", "Ghostty", "WezTerm", "Apple_Terminal"].includes(termProgram)` — correct.
- `detection.ts:145` in `EXTENDED_UNDERLINE_PROGRAMS`: `["Ghostty", "iTerm.app", "WezTerm"]` — correct.
- `text-sizing.ts:75`: `process.env.TERM_PROGRAM?.toLowerCase()` — defensive `.toLowerCase()`, but compares against `"kitty"` (lowercase), so Kitty detection *also* mismatches real env `"iTerm.app"`/`"Ghostty"` but is saved by the lowercase normalization.

**Finding.** The same string comparison appears **six times** with **three different conventions**: verbatim ("Ghostty"), lowercased ("ghostty"), and mixed-with-lowercase-env ("kitty" after `.toLowerCase()`). The Ghostty bug at profile.ts:295 is a pre-existing mistake (copy-paste from *somewhere* that was already wrong, or a transcription slip during Phase 3), masked because every caps flag that reads `isGhostty` has another path (`isKitty`, `isITerm`) that usually wins on real machines. Tests only check `program === "Ghostty"` round-trip, not `caps.kittyKeyboard` when program is Ghostty.

This is **BROAD**: fixing just profile.ts:295 cures this instance, but the class of bug remains — any future terminal-program comparison can drift. Tag: extract a `ProgramMatcher` helper or canonicalize via a `program.is("ghostty")` method on TerminalProfile.

### H2 — Async profile bundles theme (REFRAME)

**Evidence.** run.tsx lines 376-384 (Term path) and 458-467 (options path) both do the same dance: construct a temporary `InputOwner`, await `detectTheme({ ... })`, dispose. This is orthogonal to profile construction but identical across entry points and lives in run.tsx. Every future entry point (render, termless-with-theme, a hypothetical `canvas-target`, a hypothetical web-preview) will need to re-implement this probe.

**Finding.** The profile is *almost* the source of truth for "what does this terminal look like." Theme is the last non-profile fact. If `createTerminalProfile` grew an optional `probeTheme: true` that awaited the probe and filled `profile.theme`, run.tsx could collapse ~30 lines into `await createTerminalProfile({ probeTheme: true })` at both entry points. The `InputOwner` construction would move into the profile factory.

**Blast radius.** Medium — profile factory becomes `async` (it's already potentially I/O via `defaults read` on macOS; making it explicitly async isn't a regression). Two call sites simplify. Test fixtures would need to await. Tests that don't want the probe pass `probeTheme: false` (default).

Tag: **REFRAME**. This is where the plateau hasn't finished — theme is the next tier.

### H3 — `caps` + `colorLevel` free-floating alongside `profile` (BROAD)

**Evidence.** `RunOptions` has `caps?`, `colorLevel?`, `profile?` — three ways to express "what terminal." Docstring on `profile?` says "When supplied alongside `caps` or `colorLevel`, the profile wins — the other fields are silently ignored." **Silent wins are exactly the "docstring drift" class of bug** that all three plateau precedents shared.

**Finding.** If profile is the Phase 4 answer, then `caps` and `colorLevel` should be deprecated-with-warning in Phase 5 and deleted in Phase 6. Today a caller who passes both `profile` and `colorLevel` gets the profile's tier with zero warning — a silent "you thought you were forcing mono, you're not." The contract test suite doesn't cover this because no one passes both.

Tag: **BROAD**. Add a contract test for "profile + caps = profile wins, warning emitted." Then a follow-up bead to remove `caps` from RunOptions entirely.

### H4 — output-phase `Partial<OutputCaps>` with `??` defaults (NARROW)

**Evidence.** `createOutputPhase(caps: Partial<OutputCaps>, ...)` at line 166. Defaults `caps.underlineStyles ?? true`, `caps.colorLevel ?? "truecolor"` on an *optional partial*. Callers inside `create-app.tsx:1041` pass `{ caps: effectiveCaps }` where `effectiveCaps` is the full `TerminalCaps`, so the `??` defaults never fire in real app flow.

**Finding.** Not a live bug — `effectiveCaps` is always populated in the real path. The `Partial<OutputCaps>` signature is there for tests that want minimal caps. That said, it *is* a convention-not-type invariant: "in production, caps is always fully populated, but the type says it could be partial." Converting the signature to `OutputCaps` and deleting the `??` defaults would tighten the type — but risk of test breakage is real and payoff is cosmetic.

Tag: **NARROW**, low priority. File but don't fix.

### H5 — `profile.forced: boolean` over `profile.source: TerminalProfileSource` (NARROW)

**Evidence.** Every read of `source` in run.tsx (lines 350-353, 437-440) is `source === "env" || source === "override"`. Grep for `profile.source` elsewhere: zero external consumers. `source` is write-only outside run.tsx.

**Finding.** Right now `source` carries information ("which rung won") that nobody reads at runtime. It's a *debug* field masquerading as an API. The real API is `profile.forced`. Replace `source: TerminalProfileSource` with `source` (internal) + `forced: boolean` (public). Or keep `source` for diagnostics + add `forced`.

Blast radius: low. API change: additive. Tag: **NARROW**, high cleanliness.

### H6 — Delete `detectColor` / `detectTerminalCaps` shims (BROAD)

**Evidence.**

- Internal silvery consumers: `ink/chalk.ts` (2 calls), `ag-term/input.ts`, `ag-term/termtest.ts`, `ag-term/index.ts` (re-export), `ansi/term.ts:693,703`.
- External km consumers: `apps/km-tui/src/tui.tsx:76`, `apps/km-tui/src/board/command-bridge.ts:34`.

**Finding.** Call sites are thin and mechanical — either pass `term.caps` (if a Term is already available) or call `createTerminalProfile()`. Conservative path: mark deprecated, add redirect-to-profile comment, delete in silvery 1.1. Aggressive: delete the shims and migrate all sites in one commit.

Tag: **BROAD** — ASK item. The caller surface is small enough to just do it.

### H7 — `isTextSizingLikelySupported` reads env directly (BROAD)

**Evidence.** text-sizing.ts:74-92 re-reads `process.env.TERM_PROGRAM` with its own `.toLowerCase()` normalization and compares against `"kitty"` hardcoded. `detectTerminalCaps()` already computes `caps.textSizingSupported` using the same logic. Yet the heuristic helper bypasses caps.

**Finding.** This is the same class-of-bug the plateau *should* prevent. `createTerminalProfile` assembled the authoritative answer for every cap; a helper that then re-computes one cap from env is a parallel source of truth. The fix: `isTextSizingLikelySupported(caps)` — take the caps as an argument, return `caps.textSizingSupported`. One-line refactor.

Tag: **BROAD**, file as a follow-up bead. Low effort, reinforces the plateau's guarantee.

### H8 — Long-tail env-readers (REFRAME)

**Evidence.** Grep for `TERM_PROGRAM` outside profile.ts:

- `ag-term/output.ts:285` — reads TERM_PROGRAM for backend fingerprinting
- `ag-term/scroll-region.ts:55` — TERM_PROGRAM for Apple_Terminal escape-sequence quirks
- `ag-term/ag.ts:256` — TERM_PROGRAM for something (unchecked)
- `ag-term/term-def.ts:189,195` — `detectColorLevel(def.stdout)` via private helper
- `ansi/storybook.ts:53` — diagnostic, OK

Each site independently re-derives a fact that `TerminalProfile.caps` already holds.

**Finding.** This is the root failure mode. "Single source of truth" only holds if consumers consume the source; if they re-derive from env, the source is one of many. The plateau **fixed the entry points but not the consumers**. A future hardening bead should enumerate every `process.env.TERM\|TERM_PROGRAM\|COLORTERM\|COLORFGBG\|FORCE_COLOR\|NO_COLOR\|KITTY_\|WT_\|CI\|GITHUB_` read outside profile.ts and force it through a passed-in caps/profile argument.

This is the design flaw that the plateau's type system should make impossible. A lint rule ("no `process.env.TERM*` outside profile.ts") would pin it.

Tag: **REFRAME**. The design where this class can't happen: profile.ts is the only module allowed to read `process.env.*` for terminal signals; everyone else receives caps as an argument. Enforceable by grep/lint.

### H9 — Headless caps divergence (NARROW)

**Evidence.**

- `createHeadlessTerm` (term.ts:902): `mono`, `no unicode`, `no mouse`, `bracketedPaste:false`.
- `createBackendTerm` (term.ts:920+, "emulator" path): full `defaultCaps()` (truecolor, unicode, mouse).

**Finding.** Different defaults, no named contract. A test that wants a "dumb terminal" vs a "modern terminal" emulator picks via which factory they use, with the cap differences hidden. Phase 2's commit message explicitly documents this as "headless gets mono, emulator gets truecolor" but the ergonomics are poor — you'd expect one factory + a param.

Not a correctness bug, a DX smell. Tag: **NARROW**, low priority.

### H10 — Defer to Node's `getColorDepth()` (NARROW)

**Evidence.** `stdout.getColorDepth()` returns 1, 4, 8, or 24 and honors `NO_COLOR`, `FORCE_COLOR`, `NODE_DISABLE_COLORS`, `NODE_ENV=test`. Silvery rolls its own. The reasons: custom tiers + browser-safe (per the `TerminalProfileStdout` comment: structural type for canvas/DOM backends). That's legit — Node's API doesn't reach the browser target.

**Finding.** Correct to not use `getColorDepth`. The web-ambitions constraint justifies the hand-rolled factory. Tag: **NARROW**, informational — no action.

### H11 — Precedence inversion (REFRAME-but-do-not-do)

**Evidence.** Current: env > override > caller-caps > auto. Alternative: caller-caps > override > env > auto (caller wins unless env explicitly forces).

**Finding.** Current precedence is correct and matches the no-color.org spec + chalk/supports-color conventions. Inverting would break user expectations. **Reject this hypothesis.** Include the reasoning in a contract test so no future refactor inverts it silently.

Tag: **NARROW**, document. Keep the current order.

### H12 — Methods over fields on TerminalProfile (NARROW)

**Evidence.** `profile.colorTier === profile.caps.colorLevel` — redundant. Current readers mix them: run.tsx uses `profile.colorTier` (line 352) and `profile.caps.colorLevel` (elsewhere).

**Finding.** Pick one. The factory-function house style argues against methods, but exposing `forced: boolean` (from H5) is cleaner than both `source` and `colorTier`. `colorTier` is redundant with `caps.colorLevel` and can be deleted.

Tag: **NARROW**, small cleanup. Combine with H5.

### H13 — Missing "full caps per terminal" snapshot matrix (BROAD)

**Evidence.** profile.test.ts has ~56 tests, one-fact-at-a-time. No test asserts "TERM_PROGRAM=Ghostty + stdin-is-TTY produces full caps `{ kittyKeyboard: true, kittyGraphics: true, osc52: true, ... }`". That's why the case-sensitivity bug (H1) slipped: the tests check `colorTier === "truecolor"` for Ghostty (via detectColorFromEnv) but not `caps.kittyKeyboard === true` for Ghostty (via detectTerminalCapsFromEnv).

**Finding.** A table-driven test:

```ts
const MATRIX = [
  { name: "Ghostty", env: { TERM_PROGRAM: "Ghostty" }, expect: { kittyKeyboard: true, ... } },
  { name: "Kitty",   env: { TERM: "xterm-kitty" },     expect: { kittyKeyboard: true, kittyGraphics: true, ... } },
  { name: "WezTerm", env: { TERM_PROGRAM: "WezTerm" }, expect: { kittyKeyboard: true, osc52: true, ... } },
  { name: "iTerm.app", env: ..., expect: ... },
  { name: "Apple_Terminal", env: ..., expect: ... },
  { name: "Alacritty", env: ..., expect: ... },
  { name: "foot", env: ..., expect: ... },
]
```

Would catch H1 instantly. Tag: **BROAD** — file a bead. Medium effort (~80 LOC), high signal.

### H14 — Pre-existing failures — same class? (NARROW)

**Evidence.** Bead notes: "27 pre-existing fails unchanged — none reference Term.caps (focus, useBoxMetrics, pipeline-bugfixes measure-fit, use-ag-node, text-frame detachment, click-to-position imports, bearly llm/recall, termless viterm matchers, termless-memleak harness)."

**Finding.** These are not the caps/profile class. They're mostly test-harness drift (bearly recall/llm test fixtures), pipeline edge cases (measure-fit, use-ag-node — probably fiber-ref class), and emulator-testing matchers. Different class, different refactor. Out of scope for this review.

Tag: **NARROW** — not this class. No action in this review.

### H15 — `createTerm()` doesn't build a profile (REFRAME)

**Evidence.** term.ts:681-704 — `createNodeTerm` calls `detectColor(stdout)` and `detectTerminalCaps()` separately. It doesn't build a TerminalProfile. Then run.tsx's Term path (line 339) constructs *another* profile from `term.caps`.

**Finding.** Two detection passes on the Term path. The Term knows its caps; run.tsx re-derives a profile from them. If `Term` had a `profile` field of its own (built at construction and memoized), run.tsx could read `term.profile` instead of reconstructing. Small perf win + semantic cleanup.

Tag: **REFRAME** (small) — makes `Term` the owner of its profile. The profile is tied to the terminal instance, which is the correct ownership.

### H16 — Delete `RunOptions.caps` / `colorLevel` (ASK)

See H3. Tag: **BROAD** — ASK user about breaking change.

---

## Phase 4: Synthesis (Round 1)

Four hypotheses are **REFRAME** (H2 profile-bundles-theme, H8 long-tail env-readers, H15 Term-owns-profile) or **BROAD** with "same root cause" framing (H1 case-sensitivity, H7 text-sizing bypass, H13 matrix test). The patterns:

1. **The plateau fixed the entry points but not the consumers.** Env is still read from many places. The design where this class can't happen: a lint/grep invariant that no module outside `@silvery/ansi/profile.ts` reads terminal env vars directly. Caps is passed as an argument from then on.

2. **Theme is the last out-of-band fact.** Collapsing `detectTheme` into the profile (async, `probeTheme: true`) finishes the SoT story.

3. **`Term` and `TerminalProfile` have overlapping ownership.** Term owns caps (after Phase 2); Profile wraps caps + tier + source. A Term that was built with a profile should remember it; a Term that wasn't should produce one on demand. One owner, one profile per Term.

4. **Test matrix is missing.** 56 precedence-chain tests + 0 full-caps-per-terminal snapshot tests. The case-sensitivity bug at profile.ts:295 is the proof.

5. **Docstring-silent-wins are still here.** `RunOptions.profile` "silently wins over caps/colorLevel" — the same shape as the three plateau precursor bugs. The contract test suite that prevents them from recurring (the plateau's own test infrastructure) doesn't cover this new contract.

---

## Phase 5-6: Round 2 — no new insights

The REFRAME set (H2, H8, H15) converges on one design principle: **the profile is the ONLY authority for terminal facts; Term owns its profile; everyone else receives caps as an argument.** Grep-enforceable. Contract-test-enforceable. Third-party-consumer-safe.

Round 2 would generate variations of "where else is env read?" — that's a grep task, not a hypothesis task. Stop iterating.

---

## Phase 7: Final Reframing

### The real problem is

Env vars describing the terminal are the global variable of the TUI world. Every module that needs a terminal fact is tempted to read it from env directly. The plateau typed the answer (TerminalProfile, TerminalCaps) and unified the three biggest readers (run.tsx options path, run.tsx Term path, detection shims) — but didn't evict env-reading from the rest of the codebase.

### The solution that makes it unnecessary

**Lint-enforce "only `@silvery/ansi/profile.ts` may read `process.env.*` for terminal signals."** Combined with "`Term` owns its profile and exposes `term.profile`", and "every consumer that needs a terminal fact accepts `caps` / `profile` as an argument," there is no code path where a consumer can disagree with the profile. The Ghostty case-sensitivity bug would be impossible because there would be one comparison site; the text-sizing heuristic would read `caps.textSizingSupported` instead of re-normalizing env strings.

### What it solves beyond the immediate class

- Future browser/canvas/web targets: env reads blow up with "process is not defined" — a grep-lint makes it a build-time error instead of a run-time crash.
- Test fixtures can inject a mock profile once and every consumer obeys (today: 6+ env reads have to be stubbed separately).
- Profile as async with optional `probeTheme` folds theme detection into the same boundary, so `detectTheme` is not a separate axis of variation.
- Adding a new cap to `TerminalCaps` doesn't require grepping for "every place that reads TERM_PROGRAM."

### Effort

- H1 (Ghostty fix) — 1 LOC + 1 test. Can do now.
- H7 (text-sizing via caps) — 10 LOC. Can do now.
- H13 (caps matrix test) — 80 LOC. File bead.
- H8 (env-reader audit + lint) — 200 LOC + lint rule. File bead.
- H2 (profile.theme) — 50 LOC + async propagation. File bead.
- H15 (Term.profile) — 30 LOC. File bead.
- H6 (delete legacy shims) — ASK (breaking change).

### First step

Fix H1 (Ghostty case-sensitivity) with a regression test. Closes the existing open bead `km-silvery.ghostty-case-sensitivity`. Then file follow-up beads for H7, H8, H13, H2, H15 with design captured.

---

## Phase 8: Action Plan

### DOING NOW

1. **Fix H1: Ghostty case-sensitivity at profile.ts:295.** Change `program === "ghostty"` → `program === "Ghostty"`. Add regression test asserting `profile.caps.kittyKeyboard === true` + `caps.osc52 === true` when `TERM_PROGRAM=Ghostty`. Closes existing bead `km-silvery.ghostty-case-sensitivity`.

2. **Fix H7: text-sizing.ts heuristic reads caps, not env.** Rewrite `isTextSizingLikelySupported(caps?: TerminalCaps)` to read `caps.textSizingSupported` with a fallback that matches current behavior when caps is not supplied. No caller change needed (argument is optional; default uses env like today).

3. **File beads** for H2, H6, H8, H13, H15, and for the H3/H16 ASK (below).

4. **Add contract test** for H3: "`RunOptions.profile` supplied alongside `caps` → profile wins, caps silently ignored." Pins the documented behavior so a future refactor doesn't invert silently.

### ASK (user approval needed)

1. **H3 + H16: Deprecate `RunOptions.caps` and `RunOptions.colorLevel` in favor of `RunOptions.profile` only.**
   - Why: silent-wins between three fields is the exact bug class the plateau aimed to kill. Today it's still possible at the entry-point API surface.
   - Effort: deprecate (1 commit, emit warning when both are passed) + delete in silvery 1.1 (another commit).
   - Recommend: **yes**, deprecate now, delete when silvery hits 1.0.

2. **H6: Delete `detectColor` and `detectTerminalCaps` shims from `@silvery/ansi`.**
   - Why: parallel API, two call sites in km that still use it. Migration is trivial. The existence of shims makes it easy to ignore the profile API.
   - Effort: 2 hours — 2 km-tui call sites + 6 internal silvery call sites + deprecate public exports + changelog.
   - Recommend: **yes, but after the case-sensitivity and text-sizing fixes land** so the migration doesn't have to re-fix mid-stream.

3. **H15: Give `Term` its own `profile` field.**
   - Why: eliminates the double-detection on the Term path in run.tsx; makes Term the canonical owner of "the current terminal's profile."
   - Effort: ~30 LOC + documentation update.
   - Recommend: **yes**, low risk, aligns with Term-as-provider principle.

### Out of scope for this review

- Pre-existing 14 failures (H14) — unrelated class.
- Async profile with theme probe (H2) — nontrivial API change, needs its own design doc.
- Env-reader lint rule (H8) — big undertaking, separate bead with its own plan.
