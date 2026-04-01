---
description: "5 Whys root cause analysis + /big reframing. Use when the same area keeps breaking, when a fix feels like it's treating symptoms, or when you want to understand WHY a problem exists — not just how to fix it."
argument-hint: [problem or symptom]
---

# Why — 5 Whys Root Cause Analysis

**Don't fix the symptom. Find the cause. Then find the cause of the cause.**

This combines Toyota's 5 Whys with `/big`'s hypothesis-driven reframing. The goal: trace from the visible symptom to the structural root cause, then design it away.

## The Symptom

$ARGUMENTS

**If no arguments**: Infer from recent conversation — what bug was just reported? What keeps breaking? What did the user just encounter?

## Phase 1: State the Symptom Precisely

Write exactly what happened — not your interpretation, not the code path, just the observable symptom:

```
SYMPTOM: [What the user saw/experienced, in their words]
CONTEXT: [What they were doing when it happened]
FREQUENCY: [Once? Every time? Intermittent?]
```

## Phase 2: The 5 Whys

For each "why", do actual investigation — grep, read code, check history. Don't guess.

### Why 1: Why did [symptom] happen?

**Investigate**: Read the code path. What directly caused the visible symptom?

```
ANSWER: [Direct cause — the code/state that produced the symptom]
EVIDENCE: [File:line, grep result, test output]
```

**If this were the only problem, what would the fix be?** Write it — this is your narrow fix.

### Why 2: Why did [Why 1 answer] happen?

**Investigate**: What allowed that state/code path to exist?

```
ANSWER: [The condition that enabled Why 1]
EVIDENCE: [File:line, grep result]
```

### Why 3: Why did [Why 2 answer] happen?

**Investigate**: Now you're usually at the design level. Why is the system shaped this way?

```
ANSWER: [The design decision or missing abstraction]
EVIDENCE: [Architecture, history — bun recall "keywords"]
```

### Why 4: Why did [Why 3 answer] happen?

**Investigate**: The organizational/process/architectural root. Why was this design chosen?

```
ANSWER: [The constraint, assumption, or missing spec]
EVIDENCE: [Prior sessions, beads, docs]
```

### Why 5: Why did [Why 4 answer] happen?

**Investigate**: The deepest structural cause you can reach. Often: "we never defined the rules for this."

```
ANSWER: [The fundamental gap]
```

**Stop earlier if you reach a dead end or the answer is "because we haven't built X yet."** Don't force 5 levels if 3 is the real root.

**Go deeper than 5 if each level keeps revealing genuine new insight.** The number 5 is a minimum, not a maximum.

## Phase 3: The Chain

Write the full causal chain as one paragraph:

> [Symptom] because [Why 1] because [Why 2] because [Why 3] because [Why 4] because [Why 5].

Read it aloud. Does it make logical sense? Does each "because" follow from the previous? If not, your investigation has a gap — go back and fix it.

## Phase 4: Fix Levels

Each "why" suggests a fix at a different level. Map them:

| Level | Fix | Type | Solves |
|---|---|---|---|
| Why 1 | [Narrow fix — patch the direct cause] | PATCH | This instance only |
| Why 2 | [Guard — prevent the enabling condition] | GUARD | This class of bug |
| Why 3 | [Redesign — change the abstraction] | REDESIGN | Related problems too |
| Why 4 | [Spec — define the missing rules] | SPEC | Future problems |
| Why 5 | [Architecture — structural change] | ARCHITECTURE | Entire category |

**The deeper you fix, the more problems you prevent — but the more effort it takes.**

## Phase 5: Recommend + Act

Run `/big` Phase 8 (Action Plan) on the fix levels:

### Doing now:
- Ship the **Why 1 fix** (PATCH) — the user needs this today
- Create beads for Why 3+ fixes with the full causal chain in `--design`

### Need your call:
- Present Why 3-5 fixes with effort estimates
- Recommend which level to fix at based on: how often this area breaks, how much effort, how many related problems it solves

### Bring in Outside Perspective

If the root cause is architectural (Why 4-5), consult an external LLM:
```bash
bun llm --deep -y --no-recover --context-file /tmp/why-context.md "Given this causal chain, what's the right level to fix at?"
```

## Phase 3b: Ishikawa / Fishbone Diagram (Optional)

When the causal chain has **multiple contributing causes** at the same level (not a single chain but a convergence), draw an Ishikawa diagram. This is common for systemic issues where several factors combine.

Categories (adapt to the problem):
- **Code** — bugs, missing abstractions, wrong patterns
- **Process** — missing tests, no review, no spec
- **Tools** — inadequate tooling, wrong tool for the job
- **Knowledge** — undocumented conventions, tribal knowledge
- **Environment** — CI, runtime, platform differences
- **Design** — architectural decisions, missing boundaries

Format (indented tree — no box drawing):

```
SYMPTOM: Diagrams have misaligned borders
├── Code
│   └── No validation step after generation
├── Tools
│   ├── LLMs lack character position counter
│   └── No linter for box-drawing alignment
├── Process
│   ├── No diagram creation protocol existed
│   └── No post-generation verification habit
└── Knowledge
    └── Dense punctuation confuses visual estimation
```

Use this when Phase 3's linear chain feels incomplete — when you suspect **multiple independent causes** contribute. The fishbone reveals which categories need attention; the 5 Whys reveals depth within each.

## Example

```
SYMPTOM: Tab on first child of card indents entire card off-screen
WHY 1: indent_node operates on the cursor's card, not the selected sub-item
WHY 2: The keybinding resolves Tab to indent_node at card level, not sub-item level
WHY 3: There's no "cursor context" that knows which level the user is operating at
WHY 4: Each operation re-derives context independently — no shared cursor-context abstraction
WHY 5: No outliner behavior spec — operations were added ad-hoc without a unified model

CHAIN: Tab indents the card because indent resolves at card level because
there's no cursor-context abstraction because each handler re-derives
context because there's no outliner behavior spec.

FIX LEVELS:
Why 1: Add guard — if first child, no-op with bell          → PATCH (1 hour)
Why 3: Create cursorContext() shared by all handlers          → REDESIGN (1 day)
Why 5: Write outliner spec, derive all guards from it         → SPEC (2-3 days)
```

## When to Use This

- The same area has had 3+ bugs recently
- A fix feels like it's treating symptoms
- User says "why does this keep happening?"
- You fixed a bug but suspect there are siblings
- Post-mortem on a P0/P1 bug

## Anti-Patterns

| Don't | Why |
|---|---|
| Guess at causes without reading code | Each "why" must have EVIDENCE |
| Stop at Why 1 | That's just the narrow fix — the value is deeper |
| Force exactly 5 levels | Stop when you hit bedrock, go past 5 if there's more |
| Skip the causal chain paragraph | Writing it reveals logical gaps |
| Only ship the deep fix | Ship the PATCH now, bead the deeper fixes |
| Do /why without a specific symptom | It needs a concrete starting point |
