<!-- llm-meta: {"model":"dual-pro (GPT-5.4 Pro + Kimi K2.6)","session":"c6244087","timestamp":"2026-04-23T10:08:23.547Z","query":"Please provide a critical architectural review of the Silvery TerminalProfile plateau refactor described in the context. Answer these 7 questions in order with clear DO / ASK / DEFER / REJECT verdicts on each, and finish with a prioritized action list:\n\nQ1: Is TerminalProfile (plain object factory) the right shape? Or should it have been a signal, class, or zod schema?\nQ2: Will the 'source' field age well with 4 values (env/override/caller-caps/auto)? Or do we need forced:boolean + trace[]?\nQ3: Is the async probeTheme path (bundle theme into profile factory) the right call? Or should theme stay separate from profile?\nQ4: Are the 14 pre-existing test failures (focus x3, useBoxMetrics x4, use-ag-node x3, pipeline-bugfixes x2, text-frame, click-to-position, box-in-text-warning) the same docstring-drift class as the plateau bugs? Or different class?\nQ5: Where else in silvery does the same fragmentation exist (input system / theme / unicode caps / mouse state)? Which looks most similar to pre-plateau color-tier?\nQ6: Should RunOptions.caps + RunOptions.colorLevel be deleted now (silvery is pre-1.0)? Or deprecated for 1.1? Or kept with runtime warnings?\nQ7: Is the unifying principle across the whole session 'framework-X invariant enforced by convention not types'? What principle would harvest the most future value?\n\nEnd with: DO items (implement now), ASK items (user approval needed), DEFER items (don't do). Be critical and specific. Reference the code/types shown in the context.","cost":"$2.59","tokens":25826,"durationMs":542469} -->

# Dual-Pro Response

**Question**: Please provide a critical architectural review of the Silvery TerminalProfile plateau refactor described in the context. Answer these 7 questions in order with clear DO / ASK / DEFER / REJECT verdicts on each, and finish with a prioritized action list:

Q1: Is TerminalProfile (plain object factory) the right shape? Or should it have been a signal, class, or zod schema?
Q2: Will the 'source' field age well with 4 values (env/override/caller-caps/auto)? Or do we need forced:boolean + trace[]?
Q3: Is the async probeTheme path (bundle theme into profile factory) the right call? Or should theme stay separate from profile?
Q4: Are the 14 pre-existing test failures (focus x3, useBoxMetrics x4, use-ag-node x3, pipeline-bugfixes x2, text-frame, click-to-position, box-in-text-warning) the same docstring-drift class as the plateau bugs? Or different class?
Q5: Where else in silvery does the same fragmentation exist (input system / theme / unicode caps / mouse state)? Which looks most similar to pre-plateau color-tier?
Q6: Should RunOptions.caps + RunOptions.colorLevel be deleted now (silvery is pre-1.0)? Or deprecated for 1.1? Or kept with runtime warnings?
Q7: Is the unifying principle across the whole session 'framework-X invariant enforced by convention not types'? What principle would harvest the most future value?

End with: DO items (implement now), ASK items (user approval needed), DEFER items (don't do). Be critical and specific. Reference the code/types shown in the context.

**Models**: GPT-5.4 Pro + Kimi K2.6
**Total cost**: $2.59 ($2.56 + $0.030)

---

## GPT-5.4 Pro
_15823 tokens · 542s · $2.56_

Overall: the plateau is a good refactor, but it is not “done” until you remove the last two escape hatches:

1. **`source` is mis-scoped and already semantically leaky**
2. **`profile` is still optional while legacy fields still bypass its provenance model**

That is where I would push hardest.

---

## Q1 — Is `TerminalProfile` the right shape?

### DO
- **Keep `TerminalProfile` as a plain object factory result**
- Make it an **immutable snapshot**: `Readonly<TerminalProfile>` and ideally `Readonly<TerminalCaps>`
- Add invariant tests that `profile.colorTier === profile.caps.colorLevel`

### ASK
- Do you want a **separate higher-level runtime object** later, e.g. `TerminalContext` / `TerminalSession`, for reactive things like theme flips, resize, focus, etc.?

### DEFER
- Zod, unless `TerminalProfile` will cross an untyped boundary: IPC, worker messages, persisted config, plugin API

### REJECT
- **Signal-backed `TerminalProfile` as the core shape**
- **Class-based `TerminalProfile`**

### Why
The plain factory is the right core abstraction **if** `TerminalProfile` means “resolved terminal snapshot,” not “live terminal session.”

A signal-backed profile would be a category mistake. Your `TerminalCaps` fields mix:
- stable capabilities (`kittyGraphics`, `osc52`, `sixel`)
- heuristics (`darkBackground`, `textEmojiWide`, `nerdfont`)
- policy-ish facts (`textSizingSupported`)

Those do not all update on the same cadence, or by the same mechanism. If `profile.caps` becomes reactive, you will end up with unclear semantics:
- Can `kittyGraphics` change?
- Can `unicode` change mid-session?
- Does `darkBackground` change on macOS appearance flip?
- What invalidates caches?

That belongs in a **separate live/session layer**, not in the profile value object.

A class also buys you very little. Your core problem was not lack of methods; it was lack of **single ownership and explicit threading**.

Zod is useful only if the profile is coming from outside TypeScript trust boundaries. Internally, it will mostly add ceremony.

### Important criticism
Right now `TerminalProfile` is only safe if treated as immutable. Otherwise this is a drift trap:

```ts
profile.colorTier
profile.caps.colorLevel
```

Those are duplicated facts. If either can be mutated, your plateau recreates the same bug class internally.

So: **freeze it, or at least type it readonly**.

---

## Q2 — Will `source` age well?

### DO
Replace `source` with a **color-scoped provenance shape**:

Either minimal:
```ts
interface TerminalProfile {
  caps: TerminalCaps
  colorTier: ColorTier
  colorForced: boolean
  colorTierSource: "no-color" | "force-color" | "override" | "caller-caps" | "auto"
}
```

Or slightly better:
```ts
interface ColorResolution {
  tier: ColorTier
  forced: boolean
  source: "no-color" | "force-color" | "override" | "caller-caps" | "auto"
}

interface TerminalProfile {
  caps: TerminalCaps
  color: ColorResolution
}
```

Also add:
```ts
export function isForcedColor(profile: TerminalProfile): boolean
```

### ASK
- Do you need public debug provenance, or only internal debugging?
  - If public debugging matters, expose a **small optional trace**
  - If not, keep only `forced + source`

### DEFER
- A full `trace[]` stack for all resolution steps
- Symbol branding

### REJECT
- Keeping a top-level generic `source: "env" | "override" | "caller-caps" | "auto"` as the long-term public field

### Why
Your current `source` is already misleading.

It is not the source of the whole `TerminalProfile`. It is only the source of **color tier resolution**. But the name reads like provenance for all 24 fields in `TerminalCaps`, which it absolutely is not.

That will age badly for two reasons:

#### 1. It conflates **forcedness** with **provenance**
Your code proves this:

```ts
optsProfile.source === "env" || optsProfile.source === "override"
```

That is a forcedness check pretending to be provenance.

#### 2. It is semantically wrong for `caps`
This is the bigger issue.

Today:

```ts
createTerminalProfile({
  colorOverride: colorLevelOption,
  caps: rest.caps,
})
```

If `rest.caps.colorLevel` wins, `source === "caller-caps"` and downstream treats it as **not forced**.

But a public caller can absolutely pass:

```ts
caps: { colorLevel: "mono", ... }
```

as an explicit force, not a “natural terminal capability.”

So `caller-caps` currently conflates:
- “I passed through pre-detected real caps”
- “I synthetically forced caps from user config”

That means your current `source` model is not just future-fragile; it is **presently ambiguous**.

### Recommendation
Make provenance **color-specific**, and do not try to pretend a single scalar explains the whole profile.

---

## Q3 — Should theme be bundled into `createTerminalProfile()`?

### DO
- Keep `createTerminalProfile()` **sync and cheap**
- Keep theme as a **separate async step**
- Change the API so theme detection explicitly **consumes a `TerminalProfile`**

Good shape:
```ts
const profile = createTerminalProfile(...)
const theme = await detectTheme({ profile, input: probeOwner, ... })
```

If you want one-call convenience, add a wrapper:
```ts
const ctx = await resolveTerminalContext(...)
```
where `ctx = { profile, theme }`

### ASK
- Do you want a convenience wrapper for entry points so `run.tsx` stops doing the two-step dance?

### DEFER
- A `ThemedTerminalProfile` type, unless you introduce a broader `TerminalContext`

### REJECT
- Making `createTerminalProfile()` itself async
- Treating theme as the “5th rung” of the same precedence ladder

### Why
Theme is not the same kind of thing as color tier.

Color tier is a **resolution pipeline over static-ish inputs**:
- env
- overrides
- caps
- auto-detect

Theme is a **runtime probe with fallbacks and heuristics**:
- async I/O
- may fail
- depends on an `InputOwner`
- can plausibly change during a session

That is not just another precedence rung. It is a different dimension.

Bundling it into `createTerminalProfile()` would:
- force async into your clean sync boundary
- drag stdin/stdout/input ownership into a capability factory
- make `TerminalProfile` either stale or implicitly reactive

That is architectural mud.

### Better split
Keep:
- `createTerminalProfile()` = boundary normalization for terminal capabilities
- `detectTheme(profile, input)` = async probe over a resolved profile
- optional `resolveTerminalContext()` = ergonomic composition layer

That preserves the plateau without collapsing layers.

---

## Q4 — Are the 14 pre-existing failures the same class?

### DO
Treat them as a **different class**:
- not docstring/default drift
- mostly lifecycle, ownership, and harness-parity failures

Create a separate test category for:
- hook lifecycle contracts
- entry-point parity contracts
- mock/harness fidelity contracts

### ASK
- Which of those APIs are intended to be public-stable enough to deserve contract suites vs ordinary behavior tests?

### DEFER
- Folding those failures into the defaults-contract initiative

### REJECT
- Calling those 14 failures “the same docstring drift class”

### Why
The plateau bugs had a very specific structure:
1. public option/default exists
2. docs say one thing
3. tests always pass the option explicitly
4. omission path never tested
5. code drifts silently

That does **not** describe `useFocus`, `useBoxMetrics`, `useAgNode`, detachment, import, fiber-ref, etc.

Those are more like:
- hidden lifecycle assumptions
- attachment/detachment invariants
- mocked environment lying about reality
- cross-layer semantic drift

So no: same meta-family, maybe. Same class, no.

### Better taxonomy
You now have at least **three** bug families:

1. **Default/precedence drift**
   - fixed by omitted-option contract tests + normalization factories

2. **Ownership/state-machine drift**
   - fixed by single-owner architecture, typed events, fewer side channels

3. **Harness/parity drift**
   - fixed by realistic test fixtures and entry-point parity tests

Don’t let the defaults-contract project become a catch-all. It won’t catch these.

---

## Q5 — Where else is the same fragmentation? Which is most similar?

### DO
Plateau **unicode/text-sizing capability resolution next**.

Also start an audit to ban raw env reads outside designated detection modules.

### ASK
- After unicode, do you want to spend the next major refactor budget on **input/mouse single-ownership**, or keep doing smaller capability plateaus first?

### DEFER
- A big theme unification until you settle whether you want `TerminalContext`

### REJECT
- Treating all four candidates as equally similar or equally urgent

### Which is most similar?
**Most similar to pre-plateau color-tier:** **unicode caps**

Because it has the same exact smell:
- there is already a resolved fact (`caps.unicode`, maybe `textSizingSupported`)
- leaf code still re-reads raw env (`LANG`, `LC_ALL`, `TERM_PROGRAM`)
- multiple helpers infer the same fact independently

That is the color-tier bug shape almost one-for-one.

### My ranking

#### 1. Unicode/text sizing — **closest analogue**
Examples you named:
- `detectUnicode()` re-reads env
- `isTextSizingLikelySupported` re-reads `TERM_PROGRAM`
- `caps.unicode` exists but isn’t always consumed

This is the next obvious plateau candidate.

#### 2. Theme detection — **same family, harder because async**
- probe lives in `run.tsx`
- theme shape elsewhere
- scheme inference elsewhere
- cache ad hoc

Same fragmentation, but because it’s async/probe-based, I would not start here before unicode.

#### 3. Input system — **highest risk, different shape**
- `useInput`
- `runtime.on()`
- `runtimeInputListeners`
- `Input` owner
- raw stdin bytes

This is less “duplicated env detection” and more **multiple owners of one stream**. Very important, but a larger redesign.

#### 4. Mouse state — **same ownership problem, likely under input**
- click-vs-drag in silvery
- selection in create-app
- drag in feature

This looks like one gesture stream interpreted by multiple owners. High UX risk. Probably should be solved as part of input architecture, not as an isolated patch train.

### Short answer
- **Most similar**: unicode caps
- **Most dangerous overall**: input + mouse ownership

---

## Q6 — Should `RunOptions.caps` and `RunOptions.colorLevel` be deleted now?

### DO
- **Deprecate both now**
- **Eliminate silent conflict now**
- Change the type to a mutual-exclusion shape

For example:
```ts
type RunOptions =
  CommonRunOptions &
    (
      | {
          profile: TerminalProfile
          caps?: never
          colorLevel?: never
        }
      | {
          profile?: undefined
          caps?: TerminalCaps
          colorLevel?: ColorTier
        }
    )
```

And for JS callers/runtime safety:
- warn or throw in dev if `profile` is passed with `caps` or `colorLevel`

### ASK
- If your ecosystem is mostly your own repos, do a repo-wide grep and decide whether to **remove before 1.0**
- If there are meaningful external users, set removal for **1.1** and document it

### DEFER
- Hard deletion until you do the usage audit

### REJECT
- Keeping all three indefinitely
- The current “profile wins silently”
- “Make `profile` required when `caps` is present”

### Why
The silent-win docstring is exactly the bug class you were trying to kill.

Also, as noted above, public `caps` is fundamentally provenance-blind. Once a caller hands you `caps.colorLevel`, you do **not** know whether it is:
- detected capability
- user override
- test stub
- synthetic config

That means `caps` cannot participate cleanly in your `source/forced` semantics long-term.

So yes: `caps` and `colorLevel` should be legacy.

But I would not hard-delete blind. First do:
1. type-level XOR
2. runtime warning
3. internal migration
4. repo usage audit

Then delete on a short schedule.

---

## Q7 — What’s the unifying principle?

### DO
Adopt this principle:

> **Resolve once at the boundary; own once in the runtime; thread normalized facts inward.**

That is the real harvest.

### ASK
- Do you want this written up as an ADR / contributor rule / lint rule set?

### DEFER
- Trying to encode every invariant in types alone

### REJECT
- Reducing the lesson to only “convention vs types”

### Why
“Framework-X invariant enforced by convention, not types” is half-right, but incomplete.

The deeper pattern is:

### 1. Raw inputs were being reinterpreted at multiple layers
- env vars re-read by multiple entry points
- theme probed separately from profile resolution
- unicode/text sizing re-derived downstream
- input/mouse gestures interpreted in multiple places

### 2. No single authority owned the interpretation
- multiple constructors read env
- multiple listeners owned input
- multiple gesture owners classified mouse behavior

### 3. Tests mostly covered explicit happy paths, not boundary normalization
- options passed explicitly
- mocks bypassed real entry-point behavior
- omission / parity paths under-tested

So the useful principle is not just “add more types.” It is:

### **Boundary normalization + single ownership**
For every externally observable fact/stream:
- one place resolves it
- one type carries it
- downstream code consumes that type, not raw inputs
- invalid combinations are disallowed by the API shape
- contract tests cover the omitted/default/parity paths

That principle fits almost every bug you listed.

---

# Prioritized action list

## DO items — implement now

1. **Replace `source` with color-scoped provenance**
   - Prefer `colorForced + colorTierSource`
   - Or `color: { tier, forced, source }`
   - Add `isForcedColor(profile)`
   - Stop pretending one field explains the entire `TerminalProfile`

2. **Make `TerminalProfile` and `TerminalCaps` immutable snapshots**
   - `Readonly<>`
   - dev freeze if practical
   - invariant test: `profile.colorTier === profile.caps.colorLevel`

3. **Eliminate silent `RunOptions` conflicts**
   - `profile` XOR `caps`/`colorLevel` in TypeScript
   - runtime warning/throw for JS callers
   - mark `caps` and `colorLevel` deprecated immediately

4. **Plateau unicode/text-sizing next**
   - route `detectUnicode()`, `isTextSizingLikelySupported`, and any `TERM_PROGRAM`/`LANG` readers through `TerminalProfile` / `TerminalCaps`
   - add a lint/grep rule forbidding raw env reads outside designated detection modules

5. **Keep theme separate, but formalize composition**
   - `createTerminalProfile()` stays sync
   - `detectTheme({ profile, input })`
   - optional `resolveTerminalContext()` convenience wrapper

6. **Add targeted contract tests for the new profile boundary**
   - precedence chain tests
   - conflict warning tests
   - entry-point parity across `run()`, `createApp.run()`, `render()`
   - omission tests for legacy/default behavior

7. **Start an input/mouse ownership design bead**
   - not code-first
   - map owners, event flow, and arbitration points
   - goal: one owner for raw input, one owner for gesture classification

---

## ASK items — need product/ecosystem decision

1. **Removal schedule for `caps` / `colorLevel`**
   - if external usage is tiny: remove before 1.0
   - otherwise: deprecate now, remove in 1.1

2. **Whether to expose debug provenance**
   - do you want a public `trace[]` or just internal diagnostics?

3. **Whether to introduce a higher-level `TerminalContext`**
   - `{ profile, theme, dimensions, maybe runtime handles }`
   - useful if you want a one-call async convenience without polluting `TerminalProfile`

4. **Whether input/mouse refactor is next after unicode**
   - highest UX/race risk, but larger churn than capability cleanup

---

## DEFER items — don’t do now

1. **Do not make `TerminalProfile` signal-backed**
2. **Do not make `createTerminalProfile()` async**
3. **Do not put `theme` directly into `TerminalProfile`**
4. **Do not add a full public provenance trace system yet**
5. **Do not add Zod everywhere**
6. **Do not treat the 14 older failures as a defaults-contract project**
7. **Do not keep `profile wins silently` as a public API rule**

If you only do three things next, I’d do these in order:

1. **Fix `source` into `colorForced + colorTierSource`**
2. **Make `profile` XOR legacy options**
3. **Plateau unicode/env readers next**

That would turn the current plateau from “good refactor” into “stable architectural boundary.”

---

## Kimi K2.6
_10003 tokens · 529s · $0.030_

**Critical summary:** The plateau successfully consolidated color-tier fragmentation, but it stopped halfway. `TerminalProfile` is the right *kernel*, yet its `source` field encodes the wrong abstraction, its factory is still leaking env reads to downstream files, and the `RunOptions` surface preserves the exact “silent win” bug class the plateau was meant to eliminate. Theme should stay out of the factory, and the next fragmentation bomb to defuse is unicode/text-sizing.

---

### Q1: Is `TerminalProfile` (plain object factory) the right shape?

**DO** keep the plain object factory. `TerminalProfile` should remain a serializable, cross-platform snapshot. That shape is correct for a framework that will later target canvas and DOM, where the concept of a “terminal” may not exist but a “capability profile” still does.

**DEFER** a signal-backed variant (`Signal<TerminalCaps>`) until the DOM/canvas target actually requires live profile mutation (e.g., responding to OS dark-mode flips without re-initializing the whole runtime). You already own the signals ecosystem (`alien-signals`, etc.), so wrapping a snapshot in a signal later is trivial.

**REJECT** a class. It violates your house style and adds no behavior that the factory + typed interface cannot provide.

**REJECT** Zod for this boundary. The plateau bugs were *precedence logic* errors (`FORCE_COLOR` short-circuited, `NO_COLOR` ignored), not *shape* errors. Zod validates data, not resolution order. A schema would give you a false sense of safety while the silent-precedence class persists.

---

### Q2: Will the `source` field age well with 4 values?

**DO** refactor it now to a structured form:

```ts
interface TerminalProfile {
  caps: TerminalCaps
  colorTier: ColorTier
  forced: boolean           // <-- replaces the boolean check you already do everywhere
  provenance: string        // "env" | "auto" | "ttydb" | "osc-probe" | ...
}
```

The current flat enum will **not** age well. Every consumer already proves it’s the wrong abstraction by destructuring into a boolean:

```ts
optsProfile.source === "env" || optsProfile.source === "override"
```

When you add `"osc-probe"` or `"user-config"`, you will have to grep every call site and guess whether that new source counts as “forced.” That is the definition of a brittle encoding.

**ASK** whether to add an optional `trace: ResolutionStep[]` for debug forensics. It would have caught the `FORCE_COLOR` propagation failure instantly by showing `["auto", "caller-caps", "env-FORCE_COLOR"]`, but it adds weight. Is the precedent worth it?

**REJECT** keeping the 4-value string enum.

---

### Q3: Is the async `probeTheme` path the right call?

**REJECT** bundling theme into `createTerminalProfile`. **DO** keep `detectTheme(profile)` as a separate, composeable primitive.

Making the factory async is a regression in separation of concerns:

- `createTerminalProfile` is *cheap* and *synchronous*: env → precedence walk → object.
- `detectTheme` is *expensive* and *asynchronous*: OSC probe, I/O, timeouts, fallback heuristics.

Collapsing them means every entry point pays the async tax for the rare case where theme probing is wanted. Worse, it requires threading `InputOwner` into a factory that should be purely about capability resolution, not terminal I/O ownership.

The refactor mention that this would “collapse two 30-LOC dances in `run.tsx`” is not a good reason. Those 30-LOC dances are *composition*; composition is not duplication. Keep theme as the **5th step outside the factory**, not the 5th rung inside it.

---

### Q4: Are the 14 pre-existing failures the same docstring-drift class?

**REJECT**. They are a different failure class.

The plateau bugs required three specific ingredients:
1. A **public** option with a **documented default**.
2. An **ambient read** (`process.env.*`) inside the default path.
3. **Zero tests** exercising the default path because every test passed the option explicitly.

The 14 failures (`useBoxMetrics`, `use-ag-node`, focus hooks, pipeline internals) are mostly lifecycle, measure-fit math, and wiring issues. They do not route through `process.env` or public docstring defaults. They may still be “untested code paths,” but they are not the **env-precedence** code path.

**DO** apply the Phase 1 contract-test convention to any public options in those modules, but **DO NOT** waste time trying to fit them into the `TerminalProfile` plateau model.

---

### Q5: Where else does the same fragmentation exist? Which looks most similar?

**DO** target the **unicode caps / text-sizing** cluster next. It is the closest structural twin to the pre-plateau color-tier mess:

- Multiple detection sites: `detectUnicode()`, `isTextSizingLikelySupported()`
- Scattered env reads: `text-sizing.ts`, `output.ts`, `scroll-region.ts`, `ag.ts`, `term-def.ts` all grep `TERM_PROGRAM`, `LANG`, or `LC_ALL`
- Dead field: `caps.unicode` exists in the canonical structure but downstream consumers re-derive instead of trusting it

This is the same pattern as the three enum spellings and two detection functions you just killed.

**ASK** whether the team wants to schedule the **input system** plateau next (four layers: `useInput`, `runtime.on()`, `runtimeInputListeners`, `Input` owner). It is deeply fragmented, though less structurally similar to the env-precedence class.

**DEFER** mouse consolidation (just fixed) and theme detection (already well-factored as a probe layer).

---

### Q6: Should `RunOptions.caps` + `RunOptions.colorLevel` be deleted now?

**DO** delete them immediately. Silvery is pre-1.0. Preserving legacy aliases is exactly how you ship the *next* `FORCE_COLOR` silent-ignore bug.

The docstring clause—*“the profile wins — the other fields are silently ignored”*—is the anti-pattern this entire refactor exists to destroy. Silent precedence is what made `km-logview` render blank in production while tests passed. If you keep `caps` and `colorLevel`, you have not fixed the class; you have merely moved it from internal functions to the public surface.

If you fear breakage, make the migration path explicit:

```ts
// Instead of
run({ caps: myCaps, colorLevel: myTier })

// Require
run({ profile: createTerminalProfile({ caps: myCaps, colorLevel: myTier }) })
```

**REJECT** deprecation warnings and runtime warnings. Warnings are noise that users ignore until production breaks. Pre-1.0 is the only window where you can make a clean incision. Make `profile?: TerminalProfile` the sole key.

---

### Q7: Is the unifying principle ‘framework-X invariant enforced by convention not types’?

**REJECT** that principle as stated. It is a symptom description, not a root cause.

The actual principle that would harvest the most future value is:

> **Ambient authority (`process.env`) must not be read below the composition root; all context must be explicit, injectable, and traceable.**

This explains:
- The plateau bugs (`env` read in `detectTerminalCaps`, `output.ts`, etc.)
- The silent-profile wins (implicit precedence instead of explicit injection)
- The input-system layering mess (who owns `stdin`? the runtime, the hook, or the array?)
- The unicode fragmentation (`LANG` re-read deep in the stack)

**DO** institutionalize this as an architecture rule, not a convention: *No source file under `src/` may read `process.env` except `createTerminalProfile` and platform-specific shim files.* Enforce it with a custom lint rule. This is the invariant that should be “enforced by types / build,” not by code review.

---

## Prioritized action list

### DO — implement now
1. **Restructure `source` → `{ forced: boolean, provenance: string }`** (Q2). The boolean field collapses the current `||` gate; provenance leaves room for `ttydb`, `osc-probe`, etc.
2. **Delete `RunOptions.caps` and `RunOptions.colorLevel`** (Q6). Pre-1.0 breaking change; eliminates the silent-precedence surface.
3. **Plateau unicode/text-sizing** (Q5). Remove direct `TERM_PROGRAM`/`LANG` reads from `text-sizing.ts`, `output.ts`, `scroll-region.ts`, `ag.ts`, `term-def.ts`. Route through `TerminalCaps` or `createTerminalProfile`.
4. **Add `run()` entry-point contract tests** extending the Phase 1 convention (Q4). Omit `profile` and assert the documented default behavior (env → `auto`, etc.).
5. **Lint rule: ban `process.env` outside profile/env shims** (Q7). Make the “explicit, injectable context” principle mechanical.

### ASK — needs team approval
1. **Debug `trace[]` in `TerminalProfile`?** (Q2) A `ResolutionStep[]` would cost ~200 bytes per profile but would have caught the `FORCE_COLOR` ghost instantly. Worth it?
2. **DOM/canvas live profile updates?** (Q1) If the roadmap requires reactive capability changes, bump signal-backed profile from DEFER to DO.
3. **Input-system plateau priority?** (Q5) The 4-layer input stack is fragmented, but does it have a burning bug, or is it refactor-for-health?

### DEFER — do not do now
1. **Signal-backed `TerminalProfile`** (Q1). Wait until a non-terminal target proves live updates are needed.
2. **Async theme-in-profile factory** (Q3). Keep `detectTheme(profile)` separate and composeable.
3. **Zod schema for profile** (Q1). Precedence logic, not shape validation, is the bug class.
4. **Treating the 14 pre-existing failures as plateau class** (Q4). They need lifecycle/type fixes, not env consolidation.