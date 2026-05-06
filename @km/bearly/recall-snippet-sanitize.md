---
mentions:
  - km
id: "@km/bearly/recall-snippet-sanitize"
aliases:
  - km-bearly.recall-snippet-sanitize
  - km-bearly-recall-snippet-sanitize
created_by: claude:4de4a3ab
created_at: 2026-04-28T23:03:58Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.recall-snippet-sanitize
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-28T16:04:01Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [ ] LLM-rewrite snippets to neutralize role-prefix and transcript-shape triggers before emit + indexer-side regex strip on assistant text @km/bearly #bug #P1

blocks:: [[@km/bearly]]

## Problem

Recall emits and corpus suffer from autocatalytic role-prefix contamination. Session 2405c72e shows 8 occurrences of assistant text blocks starting with literal `Human: <channel...>` / `Human: <command-message>...` / `Human: how come...`. Once such text is in the FTS index, recall surfaces it as snippets in NEW sessions, where the new model pattern-completes again on the transcript-line shape.

## Approach (per user direction)

Trigger-gated, two-layer defense at the recall pipeline:

1. **Indexer-side regex strip (free, on ingest)** — `vendor/bearly/plugins/recall/src/history/indexer.ts` `extractTextContent`: when processing assistant text-content blocks, strip leading `Human:` / `Assistant:` / `H:` / `A:` line-starts and known XML markup tags (`<channel`, `<system-reminder`, `<command-message`, `<session-end`) before FTS insert. Cuts the corpus-contamination loop.
2. **Emit-side LLM rewrite (Haiku, only on trigger)** — new `vendor/bearly/plugins/recall/src/lib/sanitize-snippet.ts`: detect role-prefix or transcript-shape in candidate snippet; if matched, route through Haiku via `queryModel` with a strict preserve-verbatim system prompt (kebab-IDs, paths, scoped pkgs, hashes, numbers, error names, quoted strings stay literal); regex post-scrub on LLM output as safety net. Wire into `inject-core.ts` `runInjectDelta` snippet-build loop after `cleanSnippet` + `containsRejectedSignal`.
3. **Backfill** — recommend `bun recall index --rebuild` after deploy to scrub historical contamination.

## Acceptance

- New `sanitize-snippet.ts` exports `hasRolePrefixOrTranscriptShape`, `sanitizeIfNeeded`, `stripRolePrefix` (deterministic fallback)
- `runInjectDelta` calls `sanitizeIfNeeded` on each candidate snippet (after cleanSnippet, before escapeSnippetBody)
- `extractTextContent` in indexer strips role-prefix line-starts on assistant text blocks
- Tests:
  - hasRolePrefixOrTranscriptShape: positive on the 8 leak shapes from 2405c72e (Human:/<channel/<system-reminder/<command-message/<session-end), negative on clean prose
  - stripRolePrefix idempotent
  - extractTextContent: assistant text `Human: foo` becomes `foo` (or sentinel)
  - LLM rewrite test: gated, mock provider
- npx tsc --noEmit clean
- After deploy: tail recall-emit-log.jsonl, confirm no emits contain `Human:` / `<channel` line-starts in additionalContext

## Out of scope

- Channel-pointer mode (separate larger refactor — `km-bearly.tribe-channel-pointer-mode`)
- API-level stop_sequences (upstream Claude Code feature request)
- Layer-3 quarantineLeadingRolePrefix in silvercode transcript loop closure (already exists for silvercode, not Claude Code main session)

## Evidence

- /Users/beorn/.claude/projects/-Users-beorn-Code-pim-km/2405c72e-8617-4bdb-b092-6c118b8fb935.jsonl lines 60, 412, 415, 554, 595, 2496, 9938, 9996, 10087 (9 occurrences)
- Current session 4de4a3ab — recall additionalContext emit at ~22:43 echoed reconstructed-transcript H: shape

