---
mentions:
  - km
  - claude
id: "@km/tools/recall-ranking"
aliases:
  - km-tools.recall-ranking
  - km-tools-recall-ranking
created_by: claude:1d8b0fc3
created_at: 2026-02-15T16:52:45Z
closed_at: 2026-02-15T21:07:27Z
owner: bjorn@stabell.org
assignee: claude:34ba82b6
---

# [x] Recall: ranking improvements — recency boost, session proximity, query expansion @km/tools #task #P2 @claude:34ba82b6

Improve recall search ranking within existing FTS5 architecture. No new infrastructure — just better ranking of existing results.

## Changes

### 1. Recency Boost

Custom rank function that combines FTS5 relevance with time decay. Recent results get a boost — "what did we do yesterday about X" should surface yesterday's session, not last month's.

Implementation: SQLite custom function or post-processing step. Decay formula: `recency_factor = 1 / (1 + days_ago / 7)` (half-life of ~1 week).

### 2. Session Proximity

When a keyword hit is found, also pull neighboring messages from the same session. If you find "fixed the auth bug" in session X, show the surrounding context (what was the bug, what was tried, how was it verified).

Implementation: After initial FTS5 search, for top-N results, query for messages in same session within ±5 rows. Include as expanded context.

### 3. Query Expansion

Inject synonyms and related terms into FTS5 queries. "auth bug" → also search "authentication error". Handles terminology variance across sessions.

Implementation options (in order of preference):

- Static synonym map for common dev terms (fast, no LLM)
- LLM-generated expansion at query time (adds ~100ms latency)
- HyDE-style: generate hypothetical relevant snippet, extract key terms

## Files

- vendor/beorn-tools/tools/recall/search.ts — main search logic
- vendor/beorn-tools/tools/recall/index.ts — indexing pipeline

## Verification

- Qualitative: search for known topics, verify relevant recent results surface higher
- Before/after: run same queries against current vs improved ranking, compare result order

