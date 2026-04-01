---
description: "Think big — reframe the problem, explore 10-20 hypotheses, find the solution that makes the problem unnecessary. Use when stuck, when the fix feels like a patch, or when you suspect the real problem is upstream."
argument-hint: [problem or area]
---

# Think Big — What If This Problem Didn't Need to Exist?

**STOP fixing. START reframing.**

You're here because either: (a) the user asked you to think bigger, (b) you're about to write a patch that feels wrong, or (c) the same class of bug keeps appearing. The goal is not to solve the problem in front of you — it's to find the design where this problem **can't happen**.

## The Problem

$ARGUMENTS

## Phase 1: See the Problem Five Ways

Before generating solutions, understand the problem from 5 different angles. Write 1-2 sentences for each:

1. **The user's words** — What did they literally say/see? (not your interpretation)
2. **The system's perspective** — What state transition or invariant was violated?
3. **The architectural view** — Which layer boundary was crossed, leaked, or missing?
4. **The historical view** — `bun recall "keywords"` — has this class of problem appeared before? How many times? What was tried?
5. **The counterfactual** — In a perfectly designed system, why would this problem be impossible?

The counterfactual (#5) is the most important. It points toward the real fix.

## Phase 2: Generate Hypotheses (Round 1)

Generate **10-20 hypotheses** — not solutions, but *framings*. Each hypothesis proposes a different root cause or a different way to eliminate the problem entirely.

Categories to force breadth:

| Category | Question | Example hypothesis |
|---|---|---|
| **Missing abstraction** | What concept should exist but doesn't? | "There should be a CursorScope that guarantees valid cursor at all times" |
| **Wrong ownership** | Who owns this state? Should someone else? | "The view owns cursor state but the model should — then undo gets it free" |
| **Missing invariant** | What rule is enforced by convention but should be enforced by code? | "Node parent_id validity is checked at render time but should be checked at mutation time" |
| **Unnecessary complexity** | What if this entire subsystem didn't exist? | "If cards auto-expanded during edit, the expand-on-edit bug can't exist" |
| **Wrong layer** | Is this logic in the right place? | "This is a view concern solved in the model — move it to the view" |
| **Prior art** | How do VS Code / Obsidian / Notion / Asana handle this? | "Notion doesn't have this problem because editing is always inline, never modal" |
| **Inverse** | What if we did the opposite of what we're doing? | "Instead of detecting edit mode and special-casing, make edit mode the default" |
| **Composition** | Can two simpler things replace one complex thing? | "Split the monolithic action handler into keyboard-layer + mutation-layer" |
| **Deletion** | What if we deleted this code entirely? | "The [error] fallback exists because we handle missing nodes — what if we didn't allow missing nodes?" |
| **Unification** | Are there 2-3 similar mechanisms that should be one? | "Card edit, sub-item edit, and title edit are 3 code paths — should be 1" |

**Write all hypotheses as a numbered list before exploring any of them.** Breadth first, depth second.

## Phase 3: Explore (Round 1)

For each hypothesis, spend 2-5 minutes:
1. **Grep/read** the relevant code to check feasibility
2. **Estimate blast radius** — how many files change? Is it additive or rewrite?
3. **Score**: Does this solve just the immediate problem, or a whole class of problems?

Mark each: `NARROW` (fixes this bug only), `BROAD` (fixes a class), `REFRAME` (makes the problem impossible).

### Bring in Outside Perspectives

Don't just think alone. Use the tools at your disposal:

| Tool | When | How |
|---|---|---|
| **`/fresh`** | Stuck 20+ min, need architectural second opinion | Gathers context, asks external LLM for design advice |
| **`/llm "question"`** | Quick question for GPT/Gemini/Grok | `bun llm "how does VS Code handle X?"` |
| **`/llm --deep`** | Need research with web search + citations | Prior art, academic papers, ecosystem patterns |
| **`/pro-review`** | Want GPT 5.4 Pro to review the area systematically | Finds structural issues you might miss |
| **`/csw`** | Need to compare 4+ approaches with decision matrix | Structured analysis, concrete code examples |
| **`bun recall "keywords"`** | Check if prior sessions already explored this | Avoids rediscovering known dead ends |

**Use at least one external perspective.** Your own hypotheses have blind spots. An LLM with different training data, or prior session knowledge, will surface framings you wouldn't generate alone.

## Phase 4: Synthesize (Round 1)

Write a 3-5 sentence synthesis:
- Which hypotheses were `REFRAME` or `BROAD`?
- What patterns do they share?
- What new questions emerged?
- What didn't you consider in Phase 2 that's now obvious?

## Phase 5: Generate Hypotheses (Round 2)

Based on the synthesis, generate **10 more hypotheses**. These should be:
- Combinations of Round 1 ideas that worked
- Deeper explorations of the `REFRAME` ideas
- New ideas sparked by what you learned
- Hypotheses from categories you missed in Round 1

## Phase 6: Explore (Round 2)

Same process. 2-5 minutes each. Score as NARROW/BROAD/REFRAME.

## Phase 7: Final Synthesis

Write the recommendation:

```markdown
### Reframing: [problem]

**The real problem is**: [1 sentence — what's actually wrong at the design level]

**The solution that makes it unnecessary**: [1-3 sentences — the design change]

**What it solves beyond the immediate bug**: [list of related problems this also fixes]

**Effort**: [rough scope — files, risk, phases]

**First step**: [the smallest move toward this design]
```

### Ship Narrow, Bead the Reframe

Most reframes are too large for the current session. That's fine. The discipline is:

1. **Ship the narrow fix** — the immediate bug still needs fixing today
2. **Create a bead** for the reframe with `--design` capturing the full analysis
3. **Reference the reframe bead** in the narrow fix's commit message (`Refs: km-tui.reframe-xyz`)

The reframe lives as a tracked design decision, not a lost conversation. Next session picks it up.

```bash
bd create --id km-tui.<reframe-slug> --type task --title "Reframe: <what changes>" --priority 3 \
  --description "<the real problem>" --design "<the solution that makes it unnecessary>"
```

## When to Use This

- The fix you're about to write feels like duct tape
- The same area has had 3+ bugs in the last month
- You're adding a special case to handle an edge case of a special case
- The user says "this keeps happening" or "why does this keep breaking"
- You've been debugging for 20+ minutes and the root cause keeps shifting

## Anti-Patterns

| Don't | Why |
|---|---|
| Jump to the first good hypothesis | You'll miss the reframe — explore all 10-20 |
| Only generate "fix" hypotheses | Include deletion, inversion, and unification |
| Skip the synthesis between rounds | Round 2 hypotheses should build on Round 1 learnings |
| Propose a massive rewrite without a narrow fix | Ship the narrow fix, bead the reframe |
| Think big without checking code | Hypotheses must be grounded — grep and read |
| Stop at Round 1 | The best ideas come from Round 2, after you've learned what doesn't work |
