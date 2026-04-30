---
id: "@km/inbox/llm-1"
aliases:
  - km-llm-1
  - "@km/_orphan/llm-1"
created_at: 2026-02-02T12:44:46Z
closed_at: 2026-02-02T15:49:12Z
assignee: claude:2b15b408
---

# [x] llm deep: persist partial results to prevent loss on interruption @km/_orphan #feature #P2 @claude:2b15b408

Deep research calls (~$2-5) are lost if interrupted mid-stream.

**Current behavior:**
- Tokens stream to stdout but aren't persisted
- If process is killed, partial response is lost
- Money wasted, no recovery option

## Research Findings (from OpenAI deep research)

1. **OpenAI supports recovery via response ID** with `background: true`
2. Can retrieve completed responses via `client.responses.retrieve(response.id)`
3. Can resume streaming from where left off using `sequence_number`

## Implementation Plan

### Tier 1: Local persistence (safety net)
- Append tokens to temp file during streaming
- Store response ID + metadata in temp file header
- On completion: delete temp file (or move to history)
- On interruption: temp file remains for recovery

### Tier 2: API-based recovery
- Use `background: true` for deep research calls
- Add `llm recover` command to:
  - List partial/incomplete responses
  - Retrieve by ID from OpenAI
  - Resume streaming via sequence_number

### Files to modify
- `vendor/beorn-claude-tools/tools/lib/llm/openai-deep.ts` - add background mode + persistence
- `vendor/beorn-claude-tools/tools/llm.ts` - add `recover` command

### Temp file format
```
~/.cache/beorn-claude-tools/llm-partial-<timestamp>.md
---
response_id: resp_xxx
model: o3-deep-research
topic: <original query>
started_at: <timestamp>
last_sequence: <number>
---
<streamed content>
```