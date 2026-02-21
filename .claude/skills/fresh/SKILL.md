---
description: Fresh perspective via deep research when stuck. Systematically gathers what you've tried, what failed, and asks for architectural advice.
argument-hint: [<topic>]
---

# /fresh — Fresh Perspective on a Stuck Problem

**Keywords**: stuck, fresh perspective, step back, second opinion, architectural advice, rethink

Use when you've been iterating on a problem and each fix breaks something else. Forces you to **stop coding**, reflect, gather context, and get an outside architectural opinion via `/deep`.

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

### Phase 2: Gather Context

Deep research is only as good as the context you provide. **Full files, not snippets.**

| Context | How | Priority |
|---------|-----|----------|
| Git diff of changes | `git diff <base-commit> HEAD -- <files>` | Required |
| Current code (full files) | `cat` in the heredoc | Required |
| Original code (before changes) | `git show <commit>:<path>` | Required |
| Failing test code | Full test functions, not names | Required |
| Exact error output | Copy-paste from test runner | Required |
| Related code (callers/callees) | Relevant sections of other files | Recommended |
| Passing tests your changes fix | Shows what WORKS, constrains solutions | Recommended |
| Session history | `bun recall "<topic>"` | If available |

**Context budget**: ~15-20KB of code is ideal. If files are huge, include full current code + diff instead of both full versions.

### Phase 3: Structure the Request

Frame the question to **avoid anchoring** — let the researcher form their own model before evaluating yours.

```
# [Domain]: Seeking Fresh Architectural Perspective

## Goal
[What the system should do — functional description]

## How It Works
[Key mechanisms, invariants, terminology. Enough that someone unfamiliar
can understand the code. 10-20 lines max.]

## What Goes Wrong
[Specific symptoms: test X fails with error Y at position Z.
Test A passes but test B breaks. Exact error messages.]

## The Core Tension
[The fundamental contradiction between requirements. This is the most
important section — if you can articulate this clearly, you're halfway
to the answer.]

## Approaches Tried
[For each: what, result, why it failed. Be honest about what you
DON'T understand.]

## The Code
### [file] (current — N lines)
[full file]

### [file] ORIGINAL (before changes — N lines)
[full file OR git diff if files are large]

### Test: [test name] ([file]:line)
[full test code]

### [other relevant files]

## Questions
[Ask OPEN questions, not leading ones]
1. Is there a simpler model that resolves the tension?
2. What am I missing about [the interaction between X and Y]?
3. Would a different abstraction make the conflicting requirements compatible?
4. [Specific technical questions]
```

**Framing tips**:
- Lead with "what should the system do" not "how should I fix my code"
- State the tension clearly — "A needs X, B needs Y, X contradicts Y"
- Ask "what am I missing" not "is my approach right" (avoids confirmation bias)
- Include what WORKS (passing tests) to constrain the solution space

### Phase 4: Execute

Build a context file, then launch in background:

```bash
# Build context file (avoids shell quoting issues with code)
cat > /tmp/fresh-context.md << 'ENDOFFILE'
[structured context from Phase 3]
ENDOFFILE
cat src/relevant-file.ts >> /tmp/fresh-context.md
```

```
# ALWAYS background — foreground blocks Claude Code for 15 minutes
Bash(command='bun llm --deep -y --no-recover --context-file /tmp/fresh-context.md "problem description"', run_in_background=true)
```

**IMPORTANT**: Always use `--no-recover` to avoid getting stale recovered responses from prior
unrelated deep research calls. Always use `--context-file` (not `--context "$(cat ...)"`) when
context includes source code — shell quoting breaks on backticks and `$(...)` in code.

If the process is interrupted, don't restart — use `bun llm recover` to retrieve the response
when it completes server-side. See `/deep` for recovery details.

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
| Send code snippets | Full files needed to reason about interactions |
| Paraphrase errors | Exact messages matter for diagnosis |
| Omit failed approaches | They constrain the solution space |
| Ask leading questions | "Is my X correct?" anchors the researcher on your model |
| Rush to implement | Present advice first, get user buy-in |
| Forget `--no-recover` | Stale recovered responses waste $2-5 |
