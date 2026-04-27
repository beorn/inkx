---
description: "Multi-leg dual-pro dispatch (DeepSeek R1 + Kimi K2.6 + rotating challenger) — second opinions, code reviews, architectural advice. Parallel models judged on a rubric. Heavier than /ask, lighter than /deep."
argument-hint: ["<question>" | review [<package>] [--deep]]
---

# /pro — multi-leg second opinion + code review

Parallel multi-model dispatch with a cheap judge — for hard problems where one model isn't enough. **Use `/ask` for quick single-model questions (~$0.02). Use `/pro` for "punch through intellectual issues" (~$0.20).**

Default fleet (no OpenAI): champion `deepseek/deepseek-r1`, runner-up `moonshotai/kimi-k2.6`, rotating challenger from `[gemini-3-pro-preview, deepseek/deepseek-chat, grok-4, claude-opus-4-6]`. GPT-5.4 Pro is **opt-in** via `--challenger gpt-5.4-pro`.

**Keywords**: pro, /pro, ask pro, second opinion, code review, dual-pro, multi-leg

## Decision table

| User says | Mode | Command |
|-----------|------|---------|
| `/pro "question"` | 3-leg dispatch + judge | `bun llm pro -y --no-recover --context-file <ctx> "question"` |
| `pro, <question>` | 3-leg dispatch + judge | same — casual form |
| `/pro review <pkg>` | code review (fast) | `bun llm pro -y --no-recover --context-file <pkg-ctx> "review <pkg>"` |
| `/pro review --deep <pkg>` | code review (deep) | add `--deep` to the above — promotes to `/deep` semantics |
| `/pro review` (no arg) | discover + cost | see [discover.md](discover.md) — package scan + cost estimate + AskUserQuestion |
| `/pro "q" --challenger gpt-5.4-pro` | opt-in OpenAI | pins GPT-5.4 Pro into the rotating slot for this call |

## Cost guidance

- Direct query (3-leg: DeepSeek R1 + Kimi K2.6 + rotating cheap challenger): **~$0.20** typical
- With `--challenger gpt-5.4-pro` opt-in: ~$3-15 (GPT-5.4 Pro dominates the cost)
- Single-model override (`--model <id>`): pricing of that one model
- Fast code review: ~$0.20-1
- Deep code review (`--deep`): ~$2-5 (uses `/deep` infrastructure)

## Context-file rules

- **Always `--context-file`, never `--context`** — backticks, `$(...)`, and unmatched quotes in source code break shell quoting.
- **Pass full files, not snippets** — the trimmed-out section is often where the bug is.
- **Always include the silvery positioning brief** for any silvery-related question: `--context-file docs/silvery-positioning-brief.md` (or paste the "What silvery is" paragraph).
- For code reviews: include source + types + callers + test code + exact error output.

## Recovery

- `--no-recover` by default — avoid stale recovered responses from prior unrelated calls.
- For `--deep` runs (fire-and-forget, exit ~5s): recover with `bun llm recover <id>` (interactive) or `bun llm await <id>` (silent block, prints final file path — better for background tasks).
- Never restart an interrupted deep run — it continues server-side at OpenAI. Just recover.

## Dual-pro mode (3-leg dispatch)

`bun llm pro "..."` fires **DeepSeek R1 + Kimi K2.6 + a rotating challenger** in parallel by default (no OpenAI). A cheap judge (`gemini-2.5-flash`, ~$0.001/call) rates all three on a rubric (specificity / actionability / correctness / depth). Total typical cost: ~$0.20. A/B log at `~/.claude/projects/<project>/memory/ab-pro.jsonl` (v2 schema with judge breakdown).

The default-fleet cost shift (was $5-15 with GPT-5.4 Pro champion → now ~$0.20 with DeepSeek champion) shipped 2026-04-27 — see `vendor/bearly/plugins/llm/CHANGELOG.md` 0.5.0.

**Cost dials**: `--no-challenger` (skip leg C, back to 2-leg mainstays only), `--no-judge` (skip rubric scoring), `--challenger <id>` (override rotation; pass `gpt-5.4-pro` to opt OpenAI back in for one call). Force single-model: `--model <id>`. `--json` envelope for pipe-friendly consumption.

Future (planned): 4-leg parallel dispatch (2 mainstays + 2 split-test slots) with pairwise judge — see `/tmp/llm-refactor-execution.md` Phase 3.

**Admin** (read-only or interactive — no API spend unless `--backtest` fires):
- `bun llm pro --leaderboard` — ranked table from ab-pro.jsonl
- `bun llm pro --promote-review` — interactive promotion flow with sample queries
- `bun llm pro --backtest [--quick] [--no-old-fire] [--sample N]` — replay history through OLD vs NEW config; apples-to-apples promotion gate

## Anti-patterns

- Using `/pro` for a quick question → use `/ask` (~$0.02). `/pro` is for hard problems where you want 3 models to disagree.
- Using `/ask` for code review → use `/pro review <pkg>` so the rubric judge anchors quality.
- Skipping the positioning brief on silvery questions → answers default to "TUI library author" framing.
- Using `--context` instead of `--context-file` → shell quoting breaks on backticks / `$(...)` in source.
- Forgetting `--no-recover` → stale results waste money.
- Restarting an interrupted `--deep` call → wastes $2-5, response is still completing remotely.
- Pinning `--challenger gpt-5.4-pro` casually → bumps cost from ~$0.20 to ~$3-15. Use only for specifically hard problems where you want OpenAI's frontier in the mix.

## Companion docs (multi-package review rounds)

Daily usage (`/pro "question"`, `/pro review <pkg>`) is fully covered by the decision table above. For the deeper PM-shaped flow — review all packages, triage findings, dashboard history — load these:

- [discover.md](discover.md) — package scan, cost estimate, history check, AskUserQuestion selection
- [review.md](review.md) — context-file building, fast vs deep dispatch, parallel execution patterns
- [triage.md](triage.md) — P0/P1/P2/P3 classification, per-package + per-finding bead creation
- [history.md](history.md) — `history.jsonl` schema, staleness detection, recurring-pattern aggregation

These helpers were briefly removed in a 2026-04-27 simplification pass (km-all.pro-skill-strip) and restored after the regression was caught — the `history.jsonl` file has real entries, the workflow is in active use.
