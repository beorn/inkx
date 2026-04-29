---
id: "@km/bearly/llm-cli-json-output"
aliases:
  - km-bearly.llm-cli-json-output
  - km-bearly-llm-cli-json-output
created_by: claude:2405c72e
created_at: 2026-04-27T06:58:22Z
closed_at: 2026-04-27T07:29:00Z
close_reason: "Implemented --json flag for
  ask/pro/deep/opinion/debate/research/recover/await commands. JSON envelope on
  stdout: file, model, tokens {prompt, completion}, costUsd, durationMs,
  responseId, status. Dual-pro emits a/b legs. Centralized via output-mode.ts
  singleton + emitJson/emitContent. 11 new tests passing. Live verified: bun llm
  'ping' --model gpt-5-nano --json | jq .file works. Commit: vendor/bearly
  c2731e1 (cherry-picked from worktree 5efc6c4)."
started_at: 2026-04-27T07:13:48Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-bearly.llm-cli-json-output
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-26T23:58:44Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Add --json flag to llm CLI for skill consumption @km/bearly #feature #P2 @claude:2405c72e

blocks:: [[@km/bearly]]

## Problem

The CLI prints output paths and metadata on stderr ("Output written to: /tmp/llm-...txt", "Total cost: \$0.10"). Skills (.claude/skills/{pro,deep,ask}) instruct AI agents to regex stderr or read the JSON line printed at the end. This is fragile: format drift breaks parsing, and agents resort to brittle pattern-matching.

Discovered via /pro review of the llm tool (Kimi K2.6, 2026-04-26): finding 3.4.

## Goal

Add a `--json` flag to every command that produces output. When set:
- All human-readable progress output goes to stderr (or is suppressed)
- A single JSON line is written to stdout containing structured metadata

Schema:

```json
{
  "file": "/tmp/llm-...txt",
  "model": "GPT-5.4 Pro",
  "tokens": { "prompt": 1234, "completion": 567 },
  "cost": 0.045,
  "durationMs": 12345,
  "responseId": "resp_abc123",
  "status": "completed" | "failed" | "background"
}
```

## Commands to update

- `bun llm <question>` (ask)
- `bun llm pro <question>` (single + dual)
- `bun llm --deep <question>`
- `bun llm opinion <question>`
- `bun llm debate <question>`
- `bun llm research <topic>`
- `bun llm recover <id>`
- `bun llm await <id>`

## Acceptance

- Every command supports `--json`
- stdout contains exactly one JSON line per call
- Skills (.claude/skills/{pro,deep,ask}) updated to use `--json` and parse stdout instead of regex stderr
- Test: `echo '{"x":1}' | jq` style — `bun llm --json ... | jq .file` works

## Reference

Review at /tmp/llm-2405c72e-adversarial-review-of-the-292y.txt