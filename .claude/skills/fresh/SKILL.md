---
description: "META-PROTOCOL for being stuck 20+ min on a specific problem — stops coding, gathers context, calls /deep (or /pro) internally with a structured request. Not itself an LLM tool. For unstructured stuck-feelings use /big; for direct questions use /ask, /pro, /deep."
argument-hint: [<topic>]
benefits-from: [recall, pm, gbrain]
---

# /fresh — Fresh Perspective on a Stuck Problem

**This is a meta-protocol, not an LLM tool.** It calls `/deep` (or `/pro`) internally — its value is the structured "stop, gather, frame the question" workflow, not the model call itself.

**Keywords**: stuck, fresh perspective, step back, rethink, going in circles, each fix breaks something, tried everything

**When to use /fresh vs /big vs /ask vs /pro vs /deep:**
- `/fresh` — *meta-protocol.* You're stuck on a **specific problem**. Each fix breaks something else. Structured protocol: gather context → reflect → call /deep.
- `/big` — *meta-protocol.* The problem feels **deeper than a bug** — the fix feels like a patch, or the same area keeps breaking. 10-20 hypotheses, 2 rounds, reframe. **`/big` subsumes `/fresh`** — if you need both, use `/big`.
- `/ask` — Direct: single-model quick question (~$0.02).
- `/pro "question"` — Direct: 3-leg dispatch + judge for hard problems (~$0.20). Default fleet is non-OpenAI (DeepSeek R1 + Kimi K2.6 + rotating challenger); GPT-5.4 Pro is opt-in via `--challenger gpt-5.4-pro`.
- `/deep` — Direct: web-search research with citations (~$2-5, 2-15 min).

Use when you've been iterating on a problem and each fix breaks something else. Forces you to **stop coding**, reflect, gather context, and get an outside architectural opinion via `/llm --deep`.

## Protocol

### Phase 1: Stop and Reflect

**Before touching any code**, write a self-assessment for the user:

```
## Fresh Perspective: [topic]

**Goal**: [What I'm trying to achieve — user-facing, 1-2 sentences]

**Duration**: [How long / how many sessions / iterations]

**Approaches tried**:
1. [Approach] → [What it fixed] → [What it broke] → [Why]
2. [Approach] → [What it fixed] → [What it broke] → [Why]
3. ...

**Core tension**: [Requirement A needs X, but Requirement B needs Y.
X and Y contradict because Z.]

**My hypothesis**: [What I think is wrong — or "I don't know"]
```

Show this to the user. This is the "rubber duck" moment — sometimes the answer emerges here.

### Phase 2: Gather Context — Be Generous

Deep research is only as good as the context you provide. **Full files, not snippets. More is better.**

The researcher has no IDE, no codebase access, no ability to browse around. Everything they
need to reason about must be in the context file. Include **all the background code** they'd
need to understand the system, not just the code you think is broken.

| Context | How | Priority |
|---------|-----|----------|
| Full source files (current) | Append entire files to context | **Required** |
| Full source files (original, before changes) | `git show <commit>:<path>` | **Required** |
| Git diff of changes | `git diff <base-commit> HEAD -- <files>` | Required |
| Failing test code | Full test functions, not names | Required |
| Exact error output | Copy-paste from test runner | Required |
| Type definitions / interfaces | Full type files the code depends on | Required |
| Related code (callers/callees) | Full files or large sections | Required |
| Passing tests your changes fix | Shows what WORKS, constrains solutions | Recommended |
| Architecture docs / CLAUDE.md | System overview the researcher can reference | Recommended |
| Session history | `bun recall "<topic>"` — summarize findings | If available |

**Context budget**: 20-50KB is the sweet spot. Deep research handles large contexts well.
Don't trim code to save space — trim prose instead. The researcher needs to see how
functions interact, not read your summary of how they interact.

**What to include beyond the "broken" code**:
- **Type definitions**: If the code uses `InkxNode`, include the full `types.ts`
- **The pipeline**: If you're fixing phase 3 of a 5-phase pipeline, include all 5 phases
- **Callers and callees**: The function that calls the broken function, and what the broken function calls
- **Test infrastructure**: Test helpers, setup functions, custom matchers
- **Configuration**: Build config, test config if relevant to the failure

### Phase 3: Structure the Request — Lead with Symptoms, Not Diagnosis

Frame the question to **avoid anchoring** — let the researcher form their own mental model
of the system before seeing your theory. Present symptoms and system description first,
diagnosis and failed attempts last.

```
# [Domain]: [Descriptive title — what the system does, not what's broken]

## The System
[How this system works. Architecture, data flow, key invariants, terminology.
Write enough that someone unfamiliar can understand all the code you're about
to show them. 15-30 lines. Include diagrams if they help.]

## What Should Happen
[The correct behavior — functional specification. Be precise about ordering,
timing, state transitions. "When X happens, Y should be true" not "Y should work."]

## What Actually Happens
[Specific symptoms. Exact error messages, test output, cell coordinates, pixel
positions. Don't paraphrase — copy-paste. Include:
- Which tests fail and which pass
- Exact error messages with line numbers
- What the output looks like vs what it should look like
- When it started failing (which change introduced it)]

## Approaches Tried (and Why They Failed)
[For each attempt: what you changed, what happened, why it didn't work.
Be honest about what you DON'T understand. These constrain the solution
space — the researcher won't re-suggest things you've already tried.]

1. [Approach]: [change made] → [result] → [why it failed or what new thing broke]
2. ...

## Questions
[Ask OPEN, DISCOVERY questions — not confirmation questions]
- What mechanism could cause [symptom]? (discovery)
- What invariant am I violating? (discovery)
- Is there a simpler model that handles both [requirement A] and [requirement B]? (design)
- What am I missing about [the interaction between X and Y]? (gap-finding)

[DON'T ask: "Is my approach correct?" "Should I use X or Y?" "Is this the right fix?"
These anchor the researcher on your model instead of letting them reason independently.]

## Source Code
[Full files. Label each clearly with path and line count.
Order: types/interfaces first, then core logic, then tests, then callers.]

### types.ts (142 lines)
[full file]

### core-module.ts (380 lines)
[full file]

### core-module.ts ORIGINAL (before changes)
[full file OR git diff if >500 lines changed]

### caller.ts (relevant section, lines 200-350)
[section with enough surrounding context]

### test.test.ts — "test name that fails" (full test)
[full test code]

### test.test.ts — "test name that passes" (constraining)
[full test code — shows what WORKS]
```

**Framing tips**:
- Lead with "how the system works" not "how my code is broken"
- Describe what SHOULD happen before what DOES happen
- Include passing tests — they constrain solutions and prevent suggestions that would break working code
- State failed approaches LAST — let the researcher think independently first
- Ask "what mechanism could cause X" not "is my fix for X correct"

### Phase 4: Execute

Build a context file, then launch in background:

```bash
# Build context file — preamble first, then append source files
cat > /tmp/fresh-context.md << 'ENDOFFILE'
[structured context from Phase 3 — system description, symptoms, questions]

## Source Code
ENDOFFILE

# Append full source files (use cat, not excerpts)
echo '### types.ts' >> /tmp/fresh-context.md
cat vendor/silvery/src/types.ts >> /tmp/fresh-context.md

echo '### render-phase.ts' >> /tmp/fresh-context.md
cat vendor/silvery/src/pipeline/render-phase.ts >> /tmp/fresh-context.md

echo '### layout-phase.ts' >> /tmp/fresh-context.md
cat vendor/silvery/src/pipeline/layout-phase.ts >> /tmp/fresh-context.md

# ... etc — include ALL relevant files
```

```bash
# Fire-and-forget — exits in ~5s after printing response ID
bun llm --deep -y --no-recover --context-file /tmp/fresh-context.md "problem description"
# → Response ID: resp_...
# Recover later (15-30 min): bun llm recover resp_...
```

**IMPORTANT**: Always use `--no-recover` to avoid getting stale recovered responses from prior
unrelated deep research calls. Always use `--context-file` (not `--context "$(cat ...)"`) when
context includes source code — shell quoting breaks on backticks and `$(...)` in code.

The command exits immediately after printing the response ID. Deep research runs server-side
at OpenAI — recover the result later with `bun llm recover <id>`. See `/deep` for details.

### Phase 5: Present and Decide

Follow `/deep` presentation protocol (comprehensive ~40 line report). Then:

1. **Key insight**: What did the researcher identify that you missed?
2. **Concrete plan**: Specific changes based on the advice
3. **Ask user**: "Implement this approach, or discuss further?"

If a bead is active, update its notes with the findings.

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Skip Phase 1 | The self-assessment often reveals the answer |
| Send code snippets instead of full files | Researcher can't see how functions interact |
| Trim "irrelevant" code aggressively | What YOU think is irrelevant may be the key |
| Paraphrase error messages | Exact messages matter for diagnosis |
| Omit type definitions | Researcher needs types to understand the code |
| Omit failed approaches | They constrain the solution space |
| Ask confirmation questions | "Is my X correct?" anchors on your model |
| Describe code instead of including it | "It uses a pipeline" vs showing the pipeline code |
| Lead with your diagnosis | Anchors the researcher — lead with symptoms |
| Rush to implement | Present advice first, get user buy-in |
| Forget `--no-recover` | Stale recovered responses waste $2-5 |
