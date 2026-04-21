# Silvery Authoring Elegance — /pro Review Template

Recurring /pro review template for `km-silvery.authoring-elegance` (P1). Run monthly after each significant TEA migration milestone, and dedicated-run after major plugin-API shape changes.

**Cost**: ~$3-5 per review (dual-pro: GPT-5.4 Pro + Kimi K2.6).

## When to fire

- After a plugin cutover completes (Phase 1, Phase 2, etc)
- After `definePlugin()` or equivalent factory ships
- After `wrapEffect()` / helper API changes
- Monthly baseline during active TEA migration
- Before any public framework release

## Context file contents

1. **`hub/silvery/tea-review-responses.md`** — the 9 architectural responses
2. **Most recent cutover doc** in `hub/km/tea-*-cutover.md` — concrete plugin code + LOC measurements
3. **`apps/km-tui/src/plugins/`** — canonical plugin source files (pick the 3 most representative)
4. **`km-silvery.authoring-elegance` bead** — criteria + history
5. **Comparison code**: one small Solid Signals component, one Zustand store, one React reducer — to anchor "elegant" against concrete prior art

## Review questions (stable set)

### 1. Authoring ergonomics

- How many files does a minimum-viable plugin require? Acceptable: 1 for simple, 2 for dialog-with-React. Bad: 4+.
- How many LOC is the simplest plugin (like HelpOverlay with 4 ops)? Target <50.
- What boilerplate does every plugin repeat? (Store creation, hook wiring, feature flag, bridge component — anything mechanical is a factory target.)
- Could the plugin be defined in a single factory call? If yes, why isn't it?

### 2. Type safety

- When I write `app.plugin.dispatch(op)`, does TS know which ops are valid?
- When a plugin emits `Effect[]`, does the effect type flow to consumers (or is it opaque `Effect`)?
- When I compose `pipe(withA, withB)`, does TS catch invalid ordering if `withA` depends on `withB`?
- How many manual casts / `as` assertions exist in real plugin code?

### 3. Composition clarity

- Can a new contributor predict precedence without reading docs? If yes — why? If no — what's the one doc they need?
- Is there a single mental model, or multiple competing ones (role lanes, pipe order, event-type precedence)?
- When a plugin breaks another plugin's behavior, is the failure loud (throws) or quiet (silent drop)?
- Are observer vs handler vs middleware roles reflected in the type system?

### 4. Debugging surface

- When a key press does nothing, how does an author find out which plugin ate it?
- When a render doesn't happen, how do they know if it was a missing `render` effect vs a missing subscription?
- Is the trace log opt-in or always-on? Does it cost anything when off?

### 5. Prior-art comparison

Compare to:
- **Redux + Redux-Saga**: verbosity, boilerplate ratio, type inference
- **Zustand**: single-file simplicity, subscription clarity
- **Solid Signals + Stores**: reactivity, ergonomics
- **SwiftUI/TCA**: state ownership, composition
- **Elm**: pure reducers, serializability
- **Slate.js plugins**: plugin chain shape, normalization

Where does silvery land vs each? What's it copying well? What is it re-inventing badly?

### 6. Adoption readiness

- Could an external developer build a working plugin from the docs alone, without reading source?
- Would a 3-person startup pick silvery over Ink+Zustand for a new TUI project? What would tip the choice?
- What's the ONE objection a skeptical reviewer would raise? Is there a credible answer?

### 7. Falsifiable quality gates

Each gate should have a concrete test:
- [ ] Minimum viable plugin ≤50 LOC (test: count a real one)
- [ ] Zero manual `as` casts in plugin code (test: grep)
- [ ] Zero string-literal effect namespacing (test: grep for `"board:"`, `"dialog:"`)
- [ ] `pipe(wrongOrder)` produces a type error (test: expect-error test)
- [ ] 1 external dev builds a plugin from docs in <2 hours (test: ask them)

## Review output format

```markdown
# Elegance Review YYYY-MM-DD

## Scores (out of 10)
- Authoring ergonomics: N/10 — reasoning
- Type safety: N/10
- Composition clarity: N/10
- Debugging surface: N/10
- Adoption readiness: N/10

**Overall: N/10 — one-line verdict**

## Compared to prior art
- vs Zustand: [better/same/worse] at [aspect]
- vs Solid: [better/same/worse] at [aspect]
- ...

## What's worth shipping now
- Item 1: concrete API change
- Item 2: concrete docs change

## What to defer
- Item 1: [reasoning]

## Falsifying evidence
- [any place the framework currently forces ugly code]

## ONE concrete test to run before next review
[A specific experiment that would move the score]
```

## How to fire

```bash
# Build context
cat hub/silvery/tea-review-responses.md > /tmp/elegance-ctx.md
echo "---LATEST CUTOVER---" >> /tmp/elegance-ctx.md
cat hub/km/tea-searchdialog-cutover.md >> /tmp/elegance-ctx.md  # or latest
echo "---CANONICAL PLUGINS---" >> /tmp/elegance-ctx.md
cat apps/km-tui/src/plugins/with-help-overlay.ts >> /tmp/elegance-ctx.md
# (add 1-2 more plugins)
echo "---BEAD---" >> /tmp/elegance-ctx.md
BEADS_DIR=/Users/beorn/Code/pim/km/.beads bd show km-silvery.authoring-elegance >> /tmp/elegance-ctx.md

# Fire
bun llm pro -y --no-recover --context-file /tmp/elegance-ctx.md "$(cat hub/silvery/elegance-review-template.md | sed -n '/^## Review questions/,/^## Review output/p')"
```

## Record history

After each review:
- Append the scores to `hub/silvery/elegance-history.jsonl` (create if absent)
- Note the one test/change to run before next review
- File follow-up beads for concrete actions

## Anti-patterns

- Skipping the prior-art comparison ("it's fine if we like it")
- Scoring ourselves without external-developer validation
- Treating one cutover as sufficient evidence (run on multiple plugin types)
- Running the review WITHOUT a recent real migration (paper review is theater)
- Taking the pro score as canonical — treat it as one input, user judgment is final
