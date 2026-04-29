---
id: "@km/bearly/llm-dual-pro-shadow-test"
aliases:
  - km-bearly.llm-dual-pro-shadow-test
  - km-bearly-llm-dual-pro-shadow-test
created_by: claude:2405c72e
created_at: 2026-04-27T07:05:11Z
closed_at: 2026-04-27T08:08:56Z
close_reason: "3-leg champion-challenger with cheap judge + leaderboard +
  promote-review + backtest. ab-pro.jsonl v2 schema. New CLI subcommands and
  cost sliders. 103 llm tests passing including dispatch + leaderboard math +
  promotion threshold + backtest sample selection + judge prompt+parser +
  rotation. Commit: vendor/bearly main 6f41ed6 (cherry-picks 05b6de5 + 240253b +
  test stdout fix). Parent submodule bump: 0248983f1."
started_at: 2026-04-27T07:36:41Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-bearly.llm-dual-pro-shadow-test
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-27T00:05:11Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-bearly.llm-dual-pro-shadow-test
    depends_on_id: km-bearly.llm-registry-split
    type: blocks
    created_at: 2026-04-27T00:05:11Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Dual-pro with shadow challenger + judge scoring + human-gated promotion @km/bearly #feature #P2 @claude:2405c72e

blocks:: [[@km/bearly]], [[@km/bearly/llm-registry-split]]

## Problem

Today's `bun llm pro` runs hardcoded dual mode: GPT-5.4 Pro + Kimi K2.6 in parallel. The A/B log at `~/.claude/projects/<proj>/memory/ab-pro.jsonl` records time + cost but no quality signal — so we can't tell if a newer model would do better, and the champions never evolve.

User wants: keep the two champions stable for predictability, but continuously shadow-test new candidates. When a challenger consistently outscores a champion, raise it as a conversation — never auto-switch.

Captured during /pro review of the llm tool (Kimi K2.6, 2026-04-26): findings 3.2 + user follow-up.

## Goal

Three-leg champion-challenger pattern:

- **Leg A** (champion): the current top-1 model — stable across calls
- **Leg B** (runner-up): the current top-2 model — stable across calls
- **Leg C** (challenger): rotates from a candidate pool, shadow-tested

After all three respond, a cheap judge model rates each on a rubric (specificity / actionability / correctness / depth, 1-5 each). Scores + time + cost go to ab-pro.jsonl.

## Design details

### Champion config

```jsonc
// ~/.claude/projects/<proj>/memory/dual-pro-config.json
{
  "champion": "gpt-5.4-pro",
  "runnerUp": "moonshotai/kimi-k2.6",
  "challengerPool": ["gemini-3-pro-preview", "grok-4", "claude-opus-4-6"],
  "challengerStrategy": "round-robin-after-10-calls",
  "judge": "gpt-5-mini",
  "rubric": "default",        // or "review" / "research" / "code"
  "scoreWeights": {           // tunes leaderboard ranking
    "score": 1.0,
    "cost": 0.0,              // 0 = ignore cost; raise to penalize expensive
    "time": 0.0
  }
}
```

Env overrides: `LLM_CHALLENGER_POOL`, `LLM_DUAL_PRO_B` (existing), `LLM_JUDGE_MODEL`.

### Per-call flow

1. Read config, pick A + B (stable) and C (next from rotation).
2. Fire all three in parallel via existing dispatch path.
3. Build a judge prompt: "Rate each on rubric. Pick winner."
4. Fire judge (cheap model).
5. Append to ab-pro.jsonl: { ts, query_hash, a, b, c, judge, winner }.
6. Output to user: three sections + judge breakdown.

### Promotion threshold

- ≥ N challenger calls (default N=10)
- challenger.avgScore > champion.avgScore + M (default M=0.3 on 5-scale)
- challenger.failureRate ≤ champion.failureRate
- → emit a banner on next /pro call inviting promotion conversation

### Promotion conversation

`bun llm pro --promote-review`:
- Shows leaderboard table
- Shows 3 sample queries where models diverged
- Asks: promote / keep watching / promote-and-demote / cancel
- Records decision in ~/.claude/projects/<proj>/memory/dual-pro-promotions.jsonl

### Cost sliders

- `--no-challenger`: skip leg C for cost-sensitive runs (back to today's 2-leg)
- `--challenger <id>`: explicit override of rotation
- `--no-judge`: skip judge call (saves $0.01-0.05; loses scoring signal)

### Failure handling

- Judge sees the failure (e.g., "Response failed" with no content) and scores 0.
- Repeated failures push a model below leaderboard cutoff (>30% failure rate over rolling window).
- Failure-rate is a separate column in the leaderboard.

## Composition with other llm beads

- **@km/bearly/llm-registry-split** (P1) — capabilities flag becomes a filter for the candidate pool (e.g., only models with `webSearch: true` are candidates for `/deep`).
- **@km/bearly/llm-cli-json-output** (P2) — split-test JSON envelope: `{ a, b, c, judge, winner, leaderboardSnapshot }`.
- **@km/all/pro-skill-strip** (P2) — the /pro skill's pitch evolves: "thorough review against current best-2 with shadow-tested challenger" (not "GPT 5.4 Pro specifically"). Decision table top-of-skill stays the same.

Sequence: registry-split FIRST (P1), then this feature on top of the cleaner registry. Implementing on today's tangled types is wasted effort.

## Acceptance

- 3-leg dispatch when challenger pool is non-empty; falls back to 2-leg with --no-challenger
- Judge scoring after each call; per-leg breakdown logged
- ab-pro.jsonl extended with score / breakdown / judge metadata
- `bun llm pro --leaderboard` view (table sorted by config-weighted score)
- `bun llm pro --promote-review` interactive promotion flow
- Promotion banner emitted on /pro call when thresholds met
- All three of: champion, runner-up, challenger output to user (clearly labeled)
- Cost regression tracked (judge call cost in budget; `--no-judge` for stinginess)
- Tests cover: leaderboard math, promotion-threshold logic, judge prompt + parser, rotation strategy

## Reference

- /tmp/llm-2405c72e-adversarial-review-of-the-292y.txt — the review that surfaced this
- Existing A/B log: ~/.claude/projects/<proj>/memory/ab-pro.jsonl (already wired in dispatch.ts:runProDual)
- Existing dual-pro: vendor/bearly/plugins/llm/src/lib/dispatch.ts:runProDual + appendAbProLog