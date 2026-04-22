---
description: "Query local oMLX server on :8080; auto-starts mlx_lm.server with Qwen3.6-35B-A3B-8bit (MoE, ~94 tok/s on M5 Max) if not running. Use when the user wants a local-model answer via oMLX."
argument-hint: "[question]"
allowed-tools: Bash(curl:*), Bash(pgrep:*), Bash(kill:*), Bash(pkill:*), Bash(nohup mlx_lm.server:*), Bash(mlx_lm.server:*), Bash(mlx_lm.generate:*), Bash(jq:*), Bash(python3:*), Bash(sleep:*)
---

# omlx

Run a question through a local `mlx_lm.server` on `localhost:8080`, starting it on demand.

## Config

- MODEL: `/Users/beorn/.lmstudio/models/mlx-community/Qwen3.6-35B-A3B-8bit` — MoE, 35B total / 3B active, ~94 tok/s on M5 Max 128 GB, peak ~37 GB RSS. Chosen over the 27B dense because mlx-lm 0.31.3 had an unoptimized kernel path for the dense variant (~3 tok/s). To override for a one-off: `/omlx --model <path> your question`.
- PORT: `8080`
- LOG: `/tmp/omlx-server.log`

## Context

- HTTP status: !`curl -s --max-time 2 -o /dev/null -w '%{http_code}\n' http://localhost:8080/v1/models 2>&1 || echo down`
- Loaded model: !`curl -s --max-time 2 http://localhost:8080/v1/models 2>/dev/null | jq -r '.data[0].id // "(none)"' 2>/dev/null || echo "(server down)"`
- Process: !`pgrep -af 'mlx_lm.server' | head -3 || echo "(none)"`
- Last log lines: !`tail -3 /tmp/omlx-server.log 2>/dev/null || echo "(no log yet)"`

## Instructions

User's question is in `$ARGUMENTS` (may be empty).

### 1. Ensure server is up

If HTTP status above is not `200`:

```bash
nohup mlx_lm.server \
  --model /Users/beorn/.lmstudio/models/mlx-community/Qwen3.6-35B-A3B-8bit \
  --port 8080 \
  --log-level WARNING \
  --decode-concurrency 4 \
  --prompt-concurrency 4 \
  > /tmp/omlx-server.log 2>&1 &
disown
```

`--decode-concurrency 4 --prompt-concurrency 4` enables continuous batching: up to 4 simultaneous requests get merged into the same forward pass. Measured on M5 Max 128 GB with MoE 35B-A3B: 4 serial requests = 110 s, 4 concurrent = 16 s (6.7× throughput). Drop to 2 if you're near RAM pressure (>85% used).

Then poll readiness (initial model mmap can take 30–90 s on a cold start):

```bash
for i in $(seq 1 60); do
  code=$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' http://localhost:8080/v1/models)
  [ "$code" = "200" ] && echo "ready after ${i}0s" && break
  sleep 10
done
```

Tell the user the startup time.

### 2. No question? Report status and exit

If `$ARGUMENTS` is empty, print:

- server state (up/down, port, PID if known)
- loaded model id
- usage: `/omlx <your question>`

Do not prompt the server.

### 3. Answer the question

Qwen3.6 thinks before answering. `mlx_lm.server` may return the thinking trace inline inside `<think>...</think>` tags within `content`, or it may separate it into `reasoning_content` — depends on the mlx-lm version and chat template. Give generous `max_tokens` (default 2048) so thinking can complete.

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

**Why Python for parsing, not jq**: `mlx_lm.server` occasionally emits raw control characters (unescaped `\n`, tabs) inside JSON string fields, which is technically malformed JSON that jq rejects. Python's `json` module is more permissive with those.

If the user asked for the reasoning (e.g. `--reasoning`, `--think`, `show thinking`), print the unfiltered content (including `<think>` block) or `reasoning_content` if present.

Show the answer directly. No preamble. Do not summarize or re-interpret.

### Stopping the server

If the user says `stop`, `kill`, or `shutdown` as the argument:

```bash
pkill -f 'mlx_lm.server --port 8080' && echo "omlx stopped"
```

## Notes

- First invocation is slow (model load ~30–90 s, 37 GB). Subsequent calls are fast.
- Peak RSS ≈ 37 GB. Safe on M5 Max 128 GB.
- Log tail: `tail -f /tmp/omlx-server.log`
- To use the dense 27B instead: start mlx_lm.server manually with `--model /Users/beorn/.lmstudio/models/mlx-community/Qwen3.6-27B-8bit`. Expect slow generation until mlx-lm gains optimized kernels for the `qwen3_5` dense arch.
