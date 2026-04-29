---
id: "@km/tribe/bg-recall-daemon"
aliases:
  - km-tribe.bg-recall-daemon
  - km-tribe-bg-recall-daemon
created_by: claude:7e9436e8
created_at: 2026-04-21T21:00:52Z
closed_at: 2026-04-27T08:24:58Z
close_reason: "Landed via tribe-refactor team (compose, qualgate, bgrecall,
  events agents in parallel worktrees). All acceptance criteria verified: bearly
  tests 983/983 pass, 0 non-vendor non-silvery-WIP tsc errors. Bearly tip
  655f11a; km integration commit 5de018cf7 (already on origin/main per
  parallel-session merge). Companion km commits: 34f07d080 (qualgate accountly
  export-path gate), a0c9bfb5b (compose hub doc cleanup), f4e8fac6a (bgrecall
  worktree commit, integrated). See km-tribe.refactor for epic close +
  integration details."
---

# [x] bg-recall daemon — async just-in-time recall, observable by default @km/tribe #feature #P2 @claude:87d20187

blocks:: [[@km/tribe/recall-quality-gate]], [[@km/tribe/refactor]]

# What

Replace the current always-on UserPromptSubmit auto-recall with an async background daemon that runs recall queries based on what the model is currently doing (tool calls, file reads, error messages), then injects high-relevance hints via the tribe channel.

## Why

Current UserPromptSubmit recall:
- Blocks the hook (~200ms-2s per turn)
- Only sees the initial prompt, not the model's evolving understanding
- High noise — most hits aren't relevant by the time they're injected
- Visible in scrollback as 'H:' content (Claude Code renders hook additionalContext as user-role)

Async bg-recall:
- Non-blocking — UserPromptSubmit stays fast
- Just-in-time relevance — hints fire based on what the model is currently doing
- Lower noise — only fires above a relevance threshold
- Same defense surface — routes through envelope library + authority gate (no new attack class)

## Architecture

```
user submits prompt
  → UserPromptSubmit (lightweight bootstrap, no recall)
  → Claude works, calls tools
  → PostToolUse hook (non-blocking)
    → bg-recall daemon receives tool name + result
    → extracts entities (file paths, function names, errors, identifiers)
    → runs recall (bearly + qmd) against current entity set
    → relevance scoring + quality filter + dedup
    → if survives all gates:
        tribe.send(to=current-session, type="hint",
                   message="prior session X discussed Y — retrieve_memory('X') for full content")
  → Claude sees as <channel source="tribe:bg-recall" type="hint">...</channel>
  → uses retrieve_memory or ignores
```

## Acceptance — six requirements

### 1. Daemon
- ~300 LOC standalone process; tails active session JSONL or wires into PostToolUse hook
- Joins tribe as a system member named `bg-recall`
- Idle-quits after N minutes of no activity

### 2. Tribe channel for hints
- Sends `type="hint"` messages addressed to the current session
- Routes through @bearly/injection-envelope (defenses inherited)
- Hints land as `<channel source="plugin:tribe:tribe" from="bg-recall" type="hint">`

### 3. Throttling
- Max one hint per N tool calls OR per M seconds (tunable)
- Per-session rate limiter to prevent hint storms
- Backoff on repeated low-relevance triggers

### 4. Relevance scoring
- BM25 + entity-overlap + recency + reinforcement (was-this-hint-useful-before)
- Configurable threshold per source (qmd vs bearly recall)
- Skip hints below threshold without logging spam

### 5. Quality filter
- Compose with @km/tribe/recall-quality-gate at the daemon's query layer
- Drop stuck-loop / decayed-LLM docs before they ever become hint candidates

### 6. **Observability — first-class, not bolted on**

Every decision must be visible to the user from their terminal. The footer-noise incident showed that 'I don't know what's happening' is the cardinal pain point of these systems.

Three observability surfaces:

**a. Live JSONL log** (`BG_RECALL_DEBUG_LOG=/tmp/bg-recall.log`):
- Every PostToolUse trigger: tool name, extracted entities, query plan
- Every recall query: source, hit count, top-3 ranks
- Every relevance decision: 'fired hint X' or 'rejected — score Y < threshold Z'
- Every hint emitted: full content + which entities triggered it
- Every quality-gate rejection: reason

Format matches INJECTION_DEBUG_LOG so users can `tail -f | jq .` both side-by-side.

**b. Status snapshot** (`bun bg-recall status`):
- Current daemon state (running / idle / error)
- Active session ids being watched
- Last N hints fired (with timestamps + adoption status — did the model call retrieve_memory after?)
- Hit-rate metrics: hints fired / hints adopted / hints ignored
- Top-N entities currently in the relevance window

**c. Live TUI dashboard** (`bun bg-recall watch`):
- Like `tribe watch` — silvery-rendered live view
- Shows per-session activity: tool calls firing, entities extracted, queries running, hints emitted
- Color-coded relevance scores; visual reject reasons
- Pauseable + scrollable

**Why-this-hint / why-not-that-hint explanations**:
- On every hint emission, the JSONL entry includes the explain trace (top-3 candidates, scores, why this one won)
- On every rejection, the reason is surfaced in the log (below threshold? quality-filter strike? dedup?)
- A new hint should be inspectable: `bun bg-recall explain <hint-id>` shows the full causality chain

**Per-session metrics**:
- Hints / hour, hints / 100 tool calls
- Adoption rate (model called retrieve_memory within N turns)
- Surface in status + tribe broadcast on session end

This is a hard requirement, not a nice-to-have. If observability isn't there at v1, the daemon is unfit to ship.

## Dependencies

- **After**: @km/tribe/recall-quality-gate (composes into requirement 5)
- **Composes with**: existing pointer-mode + retrieve_memory + envelope library + authority gate (no new defenses needed; reuses the chain)
- **Replaces** (eventually): the always-on UserPromptSubmit auto-recall path. Migration: ship daemon first, run alongside, A/B compare hint quality vs auto-recall noise, then deprecate auto-recall.

## Effort

1-2 weeks for working v1 (daemon + tribe wiring + basic relevance + observability surfaces a + b). Another week to tune relevance thresholds + add TUI dashboard. Ongoing tuning thereafter.

## Risks

- Relevance scoring is the hard part — bad scoring = hint spam = trust loss
- Throttling has to be aggressive at first; users need to opt INTO higher hint rates
- Observability infrastructure is half the surface area but pays for itself the first time something breaks