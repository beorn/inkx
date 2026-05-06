---
mentions:
  - km
  - Bjørn
id: "@km/bearly/recall-llm-agent"
aliases:
  - km-bearly.recall-llm-agent
  - km-bearly-recall-llm-agent
created_by: Bjørn Stabell
created_at: 2026-04-16T22:50:16Z
closed_at: 2026-04-16T23:34:20Z
close_reason: "v1 landed: LLM planner + 2-round fanout (wider/deeper
  auto-decide) + coverage rerank + full observability (--debug-plan,
  RECALL_AGENT_TRACE). Tests: 18 unit tests (13 parser, 5 fanout/merge).
  End-to-end verified against real session DB: round-2 deeper mode successfully
  mined round-1 top snippets for specific identifiers (createModel, withKeymap,
  exact error strings). v2 leftovers: explicit --planner model override, latency
  optimization (currently ~12s for 2 rounds vs 2-3s target), iterative round 3+
  if round 2 under-delivers. Commits: bearly 46763a4, km 5b3b0e15f."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-bearly.recall-llm-agent
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-16T15:50:32Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [x] Recall: LLM-driven multi-query search agent @km/bearly #feature #P2 @Bjørn Stabell

blocks:: [[@km/bearly]]

Current `bun recall` does one FTS5/BM25 query and optionally synthesizes results with an LLM. Make it dramatically better by having a fast LLM (e.g. Haiku, Qwen3-Coder-Flash, or local qwen3-coder-next via lmstudio) drive the search:

- Take the user's natural-language query
- Generate N diverse query variants (keywords, synonyms, related concepts, session IDs, file paths, error messages)
- Run FTS5/BM25 searches for each variant in parallel
- Dedupe/rank results across queries
- Iterate: read top snippets, refine queries, fetch more context
- Return a synthesized answer with cited snippets

Goal: turn recall from a grep into a research agent. Should handle vague/fuzzy queries ("that time we fixed the column thing") that the current single-query FTS misses.

Design questions:

- Which fast model? (Haiku 4.5 via API, local qwen3-coder-next via lmstudio, or pluggable?)
- Token budget per session (stop when confident vs. always N rounds)
- Cache query plans per corpus snapshot
- Expose as `bun recall --agent` flag first, promote to default if good
- Fallback to current single-query path when offline

