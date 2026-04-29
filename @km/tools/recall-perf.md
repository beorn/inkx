---
id: "@km/tools/recall-perf"
aliases:
  - km-tools.recall-perf
  - km-tools-recall-perf
created_at: 2026-02-06T15:49:14Z
closed_at: 2026-02-06T21:37:25Z
---

# [x] Recall performance: AbortController, model racing, benchmark diagnostics @km/tools #task #P2 @claude:2ef9759e

Recall was taking 27s due to dangling LLM promises.

## Done
- AbortController for clean LLM cancellation
- Model racing (gpt-5-nano vs haiku) with 4s default timeout
- Per-phase timing metrics (search, synthesis, total)
- LLM race benchmark in 'recall status' (win rates, P95, cost per query, token counts)
- Fixed getCheapModel import crash in remember()
- Disabled UserPromptSubmit hook (2-5s latency per prompt, >50% timeout rate)

## Current State
- **MEMORY.md** (active): High-signal persistent lessons, loaded at zero cost (<200 lines)
- **recall CLI search** (active, manual): FTS5 search <100ms, use via /recall skill on-demand
- **remember SessionEnd hook** (active, fixed): Fire-and-forget at session end, extracts lessons
- **UserPromptSubmit hook** (disabled): 2-5s synthesis overhead not worth it

## Future Considerations
- Embedding-based retrieval (e.g. mcp-memory-service) if keyword search proves insufficient
- FTS5 index handles keyword search well — the gap is semantic matching, not speed
- Could auto-curate remember output into MEMORY.md