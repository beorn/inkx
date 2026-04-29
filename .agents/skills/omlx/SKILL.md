---
description: "Query local oMLX server on :8080 (mlx_lm.server). Does NOT auto-start; user runs `omlx` in a foreground shell. Use when the user wants a local-model answer via oMLX."
argument-hint: "[question]"
allowed-tools: Bash(curl:*), Bash(pgrep:*), Bash(jq:*), Bash(python3:*)
---

# omlx

Query a user-managed `mlx_lm.server` on `localhost:8080`.

## Config

- PORT: `8080`
- Default model (when the user starts `omlx`): `Qwen3.6-35B-A3B-8bit` — MoE, 35B total / 3B active, ~94 tok/s on M5 Max 128 GB, ~37 GB RSS.
- The server is started/stopped manually by the user via the `omlx` zsh function in `~/.config/zsh/aliases.sh` (foreground, Ctrl-C to stop). **Do not attempt to start or stop it from this skill.**

## Context

- HTTP status: !`curl -s --max-time 2 -o /dev/null -w '%{http_code}\n' http://localhost:8080/v1/models 2>&1 || echo down`
- Loaded model: !`curl -s --max-time 2 http://localhost:8080/v1/models 2>/dev/null | jq -r '.data[0].id // "(none)"' 2>/dev/null || echo "(server down)"`

## Instructions

User's question is in `$ARGUMENTS` (may be empty).

### 1. Server not running?

If HTTP status above is not `200`, the server is not running. Tell the user:

> oMLX is not running on :8080. Start it in another shell with `omlx` (foreground, Ctrl-C to stop). Default model is Qwen3.6-35B-A3B-8bit; to use a different model run `omlx /path/to/model`.

Do not try to start it. Stop here.

### 2. No question? Report status and exit

If `$ARGUMENTS` is empty, print the server state and loaded model from Context above, plus usage: `/omlx <your question>`.

### 3. Answer the question

Qwen3.6 thinks before answering. `mlx_lm.server` returns the thinking trace inline inside `<think>...</think>` tags within `content` (or in `reasoning_content` depending on chat template). Give generous `max_tokens` (default 2048).

```bash
MODEL_ID=$(curl -s --max-time 2 http://localhost:8080/v1/models | jq -r '.data[0].id')
curl -s --max-time 600 http://localhost:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg m "$MODEL_ID" --arg q "$ARGUMENTS" '{
    model: $m,
    messages: [{role:"user", content:$q}],
    max_tokens: 2048,
    temperature: 0.6,
    stream: false
  }')" \
| python3 -c 'import json,sys,re; r=json.loads(sys.stdin.read()); c=r["choices"][0]["message"].get("content","") or ""; c=re.sub(r"<think>.*?</think>\s*","",c,flags=re.S); print(c.strip())'
```

**Why Python for parsing, not jq**: `mlx_lm.server` occasionally emits raw control characters (unescaped `\n`, tabs) inside JSON string fields, which jq rejects. Python's `json` module is more permissive.

If the user asked for the reasoning (e.g. `--reasoning`, `--think`, `show thinking`), print the unfiltered content (including `<think>` block) or `reasoning_content` if present.

Show the answer directly. No preamble. Do not summarize or re-interpret.

## Notes

- Server supports 4-way continuous batching (`--decode-concurrency 4 --prompt-concurrency 4` baked into the `omlx` zsh function). Concurrent requests merge into shared forward passes.
- Friendly companion: `openclaude-mlx` (zsh function) runs `openclaude` pointed at this server.
- To use the dense 27B instead of the MoE: user runs `omlx /Users/beorn/.lmstudio/models/mlx-community/Qwen3.6-27B-8bit`.
