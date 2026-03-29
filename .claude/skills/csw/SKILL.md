---
description: "Complete Staff Work — structured analysis of a decision, design choice, or problem. Gathers all context, enumerates options with concrete examples, scores them, and presents a clear recommendation. The decision-maker should only need to say 'approved' or pick an option."
argument-hint: <topic or question to analyze>
---

# /csw — Complete Staff Work

**Keywords**: csw, complete staff work, options, analysis, decision, tradeoffs, compare, alternatives, which approach, how should we

A military/executive decision protocol: don't just describe the problem — present it with ALL context, ALL options analyzed, and a clear recommendation. The decision-maker says "approved" or picks an option. Nothing left to research.

## When to Use

- Choosing between architectural approaches
- Deciding on API design, naming, or conventions
- Product/process decisions with multiple viable paths
- Any question where "it depends" isn't good enough — enumerate what it depends ON

**Not for**: Quick questions (just answer), debugging (use /troubleshoot), getting unstuck (use /fresh).

## Process

### Phase 1: Gather Context (be thorough)

Before forming ANY opinion, understand the full picture:

```bash
# Search codebase for relevant code
# Grep for patterns, types, usages, prior art

# Search session history for prior discussions
bun recall "<topic keywords>"
bun recall "<related terms>" --raw

# Check related beads
bd search "<topic>"

# Read related docs, CLAUDE.md sections, design docs
```

Collect: existing code, prior decisions, constraints, user preferences, related patterns elsewhere in the codebase. Write a 1-3 paragraph **Context** section summarizing what you found.

### Phase 2: Enumerate ALL Options (minimum 4)

Generate options broadly before evaluating. Include:

- **"Do nothing"** or "fix edges only" — always an option
- The obvious/conventional choice
- The ambitious/clean-slate choice
- At least one non-obvious alternative (from other ecosystems, inverse of the obvious, etc.)

Aim for 6-8 options. Quantity forces creativity — you can cut weak ones later.

For EACH option, show a **concrete example**: actual code, config, syntax, or file structure. Not "we could use a factory pattern" but the actual factory function with real types. The decision-maker must see what they're choosing, not read about it abstractly.

### Phase 3: Analyze Each Option

For each option:

| Dimension | What to Write |
|-----------|---------------|
| **Concrete example** | Real code/config/syntax — 5-20 lines showing the approach |
| **Pros** | What's genuinely good (be specific, not "clean" or "simple") |
| **Cons** | What's genuinely bad (be honest — every option has cons) |
| **Effort** | Lines changed, files touched, breaking changes, migration needed |
| **Risk** | What could go wrong, edge cases, future regret |

Kill weak options here. If an option is clearly dominated (another option is better on every dimension), note why and drop it. Final set should be 3-6 genuine contenders.

### Phase 4: Decision Matrix

Pick 4-6 dimensions that actually matter for THIS decision (not generic). Score each surviving option.

```markdown
| Option | <dim1> | <dim2> | <dim3> | <dim4> | <dim5> |
|--------|--------|--------|--------|--------|--------|
| A: ... | ++     | +      | -      | ++     | o      |
| B: ... | +      | ++     | +      | -      | +      |
| ...    |        |        |        |        |        |
```

Scoring: `++` great, `+` good, `o` neutral, `-` bad, `--` terrible.

Choose dimensions that differentiate — if every option scores the same on a dimension, it doesn't help the decision.

### Phase 5: Recommendation

State clearly:
1. **Which option** and **why** (2-3 sentences, reference the matrix)
2. **What to do first** if the approach is phased
3. **What NOT to do** — explicitly call out traps, anti-patterns, or tempting-but-wrong alternatives

### Phase 6: Self-Review (mandatory — do this internally before presenting)

Re-read the entire analysis and challenge it:

- Did I dismiss any option too quickly? Re-examine the ones I cut.
- Is my recommendation actually the best, or just the most familiar/obvious?
- What would someone who disagrees with my recommendation argue? Is that argument valid?
- Did I miss an option entirely? (Check: did I consider the inverse? A hybrid? Deferring the decision?)
- Are my "cons" honest, or did I soften them for my preferred option?
- Are the concrete examples fair? Did I write better code for my preferred option?

Update the analysis with any corrections. If the recommendation changes, that's the system working.

## Output

Present the analysis **directly in the conversation** — do not write it to a file. Only persist to a bead if the user explicitly asks. The decision-maker reads it inline and says "approved" or picks an option.

```markdown
## CSW: <topic>

### Context
<1-3 paragraphs — what exists now, what triggered this decision, constraints, prior art>

### Options

#### Option A: <descriptive name>
```<lang>
<concrete example — real code/config/syntax>
```
- **Pros**: <specific benefits>
- **Cons**: <specific drawbacks>
- **Effort**: <scope estimate>
- **Risk**: <what could go wrong>

#### Option B: <descriptive name>
...

[repeat for each surviving option]

### Decision Matrix
| Option | <dim1> | <dim2> | <dim3> | <dim4> | <dim5> |
|--------|--------|--------|--------|--------|--------|
| A: ... | ++     | +      | -      | ++     | o      |
| B: ... | ...    |        |        |        |        |

### Recommendation
<which option and why — 2-3 sentences referencing the matrix>

**First step**: <what to do immediately>

### What NOT to Do
<traps, anti-patterns, tempting-but-wrong paths — be specific>
```

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Skip context gathering | You'll miss constraints and prior decisions |
| Stop at 2-3 options | Forces false dichotomy; the best option is often #5 |
| Write abstract descriptions instead of code | "Use a factory" means nothing — show the factory |
| Soften cons for your preferred option | Dishonest analysis leads to bad decisions |
| Skip self-review | First-draft recommendations are often just the most obvious, not the best |
| Make the matrix generic | "Simplicity, Performance, Maintainability" for every decision is useless |
| Present without a recommendation | The whole point is the decision-maker says "approved", not "let me think" |
| Bury the recommendation | Lead with context, but make the recommendation unmissable |
