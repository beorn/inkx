---
description: "Query local LM Studio server on :1234; auto-starts via `lms server start` if down. Use when the user wants a local-model answer via LM Studio."
argument-hint: "[question]"
allowed-tools: Bash(curl:*), Bash(/Users/beorn/.lmstudio/bin/lms:*), Bash(~/.lmstudio/bin/lms:*), Bash(jq:*), Bash(python3:*), Bash(sleep:*)
---

# lmstudio

Run a question through LM Studio's OpenAI-compatible server on `localhost:1234`, starting it on demand.

## Config

- PORT: `1234`
- LMS: `/Users/beorn/.lmstudio/bin/lms`

## Context

- HTTP status: !`curl -s --max-time 2 -o /dev/null -w '%{http_code}\n' http://localhost:1234/v1/models 2>&1 || echo down`
- Loaded models: !`curl -s --max-time 2 http://localhost:1234/v1/models 2>/dev/null | jq -r '.data[].id' 2>/dev/null || echo "(server down)"`

## Instructions

User's question is in `$ARGUMENTS` (may be empty).

### 1. Ensure server is up

If HTTP status above is not `200`:

```bash
/Users/beorn/.lmstudio/bin/lms server start
```

Poll for readiness (LM Studio's server comes up within seconds since models are already memory-resident):

```bash
for i in $(seq 1 15); do
  code=$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' http://localhost:1234/v1/models)
  [ "$code" = "200" ] && echo "ready" && break
  sleep 1
done
```

Tell the user startup time.

### 2. Pick a model

Model selection preference, in order:
1. User-specified hint in the prompt (e.g. `@qwen3.6-27b`, `@qwen3-coder-next`) — use that id, strip the `@hint` from the final prompt.
2. Preferred default: **`qwen3.6-35b-a3b`** if loaded — MoE, ~94 tok/s on M5 Max, higher quality than the dense 27B, and avoids the slow kernel path in mlx-lm 0.31.3 for Qwen3.6 dense.
3. Fallback: first loaded model from `/v1/models`.
4. If `data: []`, tell the user to load one in LM Studio (or via `lms load <model>`) and stop — do not attempt to answer.

```bash
# Pick MODEL_ID with the preference above:
ALL=$(curl -s --max-time 2 http://localhost:1234/v1/models | jq -r '.data[].id')
# prefer qwen3.6-35b-a3b, else first
MODEL_ID=$(echo "$ALL" | grep -x 'qwen3.6-35b-a3b' || echo "$ALL" | head -1)
```

### 3. No question? Report status and exit

If `$ARGUMENTS` is empty, print server state, loaded models, and usage: `/lmstudio <your question>`. Do not prompt the server.

### 4. Answer the question

Qwen3.6 thinks before answering and returns the trace in `reasoning_content` and the actual answer in `content`. Thinking cannot be disabled via API — give generous `max_tokens` (default 2048) so it finishes. Only `content` is shown to the user.

```bash
# MODEL_ID is set in step 2 above.
curl -s --max-time 600 http://localhost:1234/v1/chat/completions \
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

**Why Python for parsing, not jq**: OpenAI-compatible servers occasionally emit unescaped control characters (literal `\n`, tabs) inside JSON string fields, which jq rejects. Python's `json` module is more permissive.

If the user asked for the reasoning (e.g. `--reasoning`, `--think`, `show thinking`), also print `reasoning_content` under a `--- reasoning ---` header before the answer. Otherwise, discard it.

Show the answer directly. No preamble. Do not summarize or re-interpret.

### Stopping the server

If the argument is `stop`, `kill`, or `shutdown`:

```bash
/Users/beorn/.lmstudio/bin/lms server stop && echo "lmstudio server stopped"
```

## Notes

- `lms server start` is idempotent; safe to call when already running.
- Server config lives in LM Studio's app settings; CORS and network access flags are set there, not here.
- To switch which model is served: LM Studio app → Models → load target, or `lms load <id>`.
