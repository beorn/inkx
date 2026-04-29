---
description: "Long-running web-search research with citations via OpenAI's Deep Research API (~$2-5, 2-15 min, fire-and-forget). Use when prior art / external citations matter. NOT DeepSeek. For multi-model judging without web search use /pro."
argument-hint: <topic>
---

# /deep — OpenAI Deep Research (web search + citations)

OpenAI's Deep Research API: web search + extended reasoning + citations. **NOT** DeepSeek (despite the name). Fire-and-forget — exits in ~5s with a response ID, recover later.

**Keywords**: deep research, thorough research, web search, citations

## Decision table

| User says | Command | Cost |
|-----------|---------|------|
| `/deep "<topic>"` | `bun llm --deep -y --no-recover --context-file <ctx> "<topic>"` | ~$2-5, 2-15 min |
| `/deep pro "<topic>"` | add `--model gpt-5.4-pro` | ~$5-15, 30-50 min |
| `/deep <topic>` (research only, no code) | omit `--context-file`; topic alone | ~$2-5 |

`pro` keyword does NOT work with `--deep` (gets absorbed into topic text). Use `--model gpt-5.4-pro` instead.

## Context-file rules

- **Always `--context-file`, never `--context`** — backticks/`$(...)`/quotes in source break shell quoting.
- **Full files, not snippets** — 20-50KB is the sweet spot. Include source + types + callers + test code + exact error output.
- **Always include the silvery positioning brief** for silvery questions: `--context-file docs/silvery-positioning-brief.md`.
- **Always `--no-recover`** for fresh research — avoids stale results from prior calls.

## Recovery

Deep research is fire-and-forget — the command prints the response ID and exits in ~5s. Research runs server-side at OpenAI.

```bash
bun llm --deep -y --no-recover --context-file /tmp/ctx.md "<topic>"
# → Response ID: resp_abc123...

# Recover later (15-30 min):
bun llm recover <id>      # interactive, TTY spinner
bun llm await <id>        # silent block, prints file path — better for background
```

If you forgot the ID: `bun llm recover` lists all partial responses.

**NEVER restart an interrupted deep call** — it continues server-side and completes remotely. Just recover.

## Anti-patterns

- `Bash(command='bun llm --deep ...', run_in_background=true)` — output pipe truncates, response ID lost. Run normally; it exits in ~5s.
- Restarting after Escape/timeout/crash — wastes $2-5 and 15 minutes.
- Polling with `sleep 30 && wc -c output.txt` — wastes turns.
- Trimmed snippets with `...` — the trimmed part is often where the bug is.
- Confirmation questions ("is my fix right?") — anchors the researcher on your mental model. Ask discovery questions instead ("what mechanism could cause X?", "what invariant am I violating?").

## Presenting results

Deep research costs $2-5+. After it completes, **read the full output file and present a comprehensive ~40-line report** — preserve code snippets, specific recommendations, trade-offs, and citations. Don't reduce to a brief summary. Always show the output file path at the end.
