---
name: llm
description: "Direct LLM dispatch through bun llm. Use when the user calls /llm, asks to query an external/local LLM, requests image analysis through an LLM, or wants llm quota/recover/admin commands."
argument-hint: "[--deep|pro|opinion|debate|--image <path>|--model <id>|recover|await|quota] [question]"
---

# /llm — direct LLM dispatch

**Keywords**: /llm, llm, external LLM, GPT, Gemini, Grok, local model, image analysis, quota, recover

Use `bun llm` from the repo root. This is the low-level wrapper; prefer the
specialized skills when the user's intent matches them.

## Routing

| User asks | Use |
| --------- | --- |
| `/llm "question"` | Load `/ask`; run `bun llm "<question>"` |
| `/llm opinion "question"` | Load `/ask`; run `bun llm opinion "<question>"` |
| `/llm debate "question"` | Load `/ask`; run `bun llm debate -y "<question>"` |
| `/llm pro ...` | Load `/pro`; run `bun llm pro ...` |
| `/llm --deep ...` | Load `/deep`; run `bun llm --deep -y --no-recover ...` |
| `/llm --image <path> ...` | Run `bun llm --image <path> "<question>"` |
| `/llm --model <id> ...` | Run `bun llm --model <id> "<question>"` |
| `/llm recover [id]` | Run `bun llm recover [id]` |
| `/llm await <id>` | Run `bun llm await <id>` |
| `/llm quota` | Run `bun llm quota` |

## Rules

- For silvery-related questions, include `docs/silvery-positioning-brief.md`
  with `--context-file` or paste the brief into the prompt.
- Prefer `--context-file` over `--context` for source code or logs.
- For `--deep`, do not background the shell command and do not restart
  interrupted research; recover it with `bun llm recover` or `bun llm await`.
- In the response where you call `bun llm`, state the question, motivation,
  context included, and mode.
- After completion, read the output file and summarize concrete findings. Show
  the output path.
