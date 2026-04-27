---
description: "GPT 5.4 Pro — code reviews, direct questions, architectural advice. Use when user says 'pro', '/pro', 'ask pro', or wants GPT 5.4 Pro's opinion on anything."
argument-hint: ["<question>" | review [<package>] [--deep]]
---

# /pro — second opinion + code review

GPT 5.4 Pro for direct questions and code reviews.

**Keywords**: pro, /pro, ask pro, gpt pro, gpt 5.4, code review, second opinion

## Decision table

| User says | Mode | Command |
|-----------|------|---------|
| `/pro "question"` | direct query | `bun llm pro -y --no-recover --context-file <ctx> "question"` |
| `pro, <question>` | direct query | same — casual form |
| `/pro review <pkg>` | code review (fast) | `bun llm --model gpt-5.4-pro -y --no-recover --context-file <pkg-ctx> "review <pkg>"` |
| `/pro review --deep <pkg>` | code review (deep) | add `--deep` to the above (~$5-15, 30-50 min, web search) |
| `/pro review` (no arg) | discover + cost | manual: list `packages/`, `apps/`, `vendor/`, estimate, ask user to pick — future: `bun llm pro --discover` (see km-bearly.llm-cli-json-output) |

## Cost guidance

- Direct query (dual-pro: GPT-5.4 Pro + Kimi K2.6): ~$5-15
- Direct query single-model (`--model gpt-5.4-pro` or `--model kimi-k2.6`): ~$0.50-3
- Fast code review: ~$1-3
- Deep code review (`--deep`): ~$5-15

## Context-file rules

- **Always `--context-file`, never `--context`** — backticks, `$(...)`, and unmatched quotes in source code break shell quoting.
- **Pass full files, not snippets** — the trimmed-out section is often where the bug is.
- **Always include the silvery positioning brief** for any silvery-related question: `--context-file docs/silvery-positioning-brief.md` (or paste the "What silvery is" paragraph).
- For code reviews: include source + types + callers + test code + exact error output.

## Recovery

- `--no-recover` by default — avoid stale recovered responses from prior unrelated calls.
- For `--deep` runs (fire-and-forget, exit ~5s): recover with `bun llm recover <id>` (interactive) or `bun llm await <id>` (silent block, prints final file path — better for background tasks).
- Never restart an interrupted deep run — it continues server-side at OpenAI. Just recover.

## Dual-pro mode

`bun llm pro "..."` fires GPT-5.4 Pro **and** Kimi K2.6 in parallel by default. K2.6 adds ~$0.01-0.50 to a $5-15 Pro call (~100× cheaper, competitive on strategy questions). A/B log at `~/.claude/projects/<project>/memory/ab-pro.jsonl`. To force single-model: `--model gpt-5.4-pro`. Auto-falls-back to single GPT-5.4 Pro if `OPENROUTER_API_KEY` is unset.

## Anti-patterns

- Skipping the positioning brief on silvery questions → answers default to "TUI library author" framing.
- Using `--context` instead of `--context-file` → shell quoting breaks.
- Forgetting `--no-recover` → stale results waste money.
- Restarting an interrupted `--deep` call → wastes $5-15, response is still completing remotely.

## Future

Review-round workflow (multi-package discovery, triage, per-finding bead creation) lives in the CLI, not this skill. Pointer: `bun llm pro --discover` once km-bearly.llm-cli-json-output lands.
