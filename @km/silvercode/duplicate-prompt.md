---
id: "@km/silvercode/duplicate-prompt"
aliases:
  - km-silvercode.duplicate-prompt
  - km-silvercode-duplicate-prompt
created_by: claude:cc081a9a
created_at: 2026-04-28T00:14:54Z
closed_at: 2026-04-28T00:14:59Z
close_reason: "Fixed in session-store.ts user-message reducer (echo dedup with
  5s window). 3 new tests pin: collapse, distinct-text-across-windows,
  meta-only. All 653 silvercode + 190 agent-harness tests pass."
---

# [x] Duplicate user prompt: optimistic apply + agent echo render twice @km/silvercode #bug #P1

blocks:: [[@km/silvercode]]

Reproduced 2026-04-27 from desktop screenshot — user's prompt appearing twice in chat. Root cause: controller applies optimistic user-message with synthetic turnId 'u-${Date.now()}' for instant feedback, then ships the prompt to Claude. Claude echoes the prompt back via stream-json with its own JSONL uuid as turnId. The two turnIds don't match, so session-store's upsertMessage appends a fresh entry instead of merging — user sees the prompt twice (once with bg-tint UserRow, once again as the echo).

Fix landed in apps/silvercode/packages/agent-harness/src/session-store.ts: 'user-message' reducer dedups optimistic + echo within a 5s window when text matches and the existing id starts with 'u-'. Re-keys the optimistic entry to the canonical (uuid) turnId so subsequent tool-result lookups, turn-end attaches, and scroll anchors all resolve correctly.

Tests:
- session-store.test.ts 'optimistic + echo dedup' — 3 cases (collapse, distinct prompts across windows, meta-only)
- All 190 agent-harness tests pass