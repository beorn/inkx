---
id: "@km/bear/focus"
aliases:
  - km-bear.focus
  - km-bear-focus
created_by: Bjørn Stabell
created_at: 2026-04-17T15:37:16Z
closed_at: 2026-04-17T15:47:31Z
close_reason: Phase 3 complete. Focus poller + session_focus table +
  bear.workspace_state (daemon + MCP tool) + current_brief cache fast-path +
  extractSessionFocus pure export + CLI sessions focus hints + workspace JSON
  dump. 19 bear/plugin tests green, test:fast 6620 pass, /complete audit found +
  fixed the MCP tool gap.
---

# [x] Phase 3: focus detection + bear.workspace_state() @km/bear #task #P2 @Bjørn Stabell

blocks:: [[@km/bear]], [[@km/bear/daemon]]

Phase 3 of the bear plan (epic: @km/bear, depends on @km/bear/daemon). Daemon
gains a background focus poller that reads alive sessions' JSONL tails once
per minute and stores a cached brief in the workspace-state DB. New
`bear.workspace_state` MCP tool + `bear.current_brief` switch to reading
from the cache. \`bear status\` shows focus hints per session.

## Scope

1. **\`tools/lib/bear/focus.ts\`** — pure function \`extractFocus(transcriptPath, opts)\` → \`{ lastActivityTs, ageMs, exchangeCount, mentionedPaths[], mentionedBeads[], mentionedTokens[], tail }\`. Reuses the existing session-context tail-parser with pure inputs (no cwd/env lookup). Unit-testable.

2. **Schema migration** — add \`session_focus\` table keyed by \`claude_pid\`:
   \`last_activity_ts, age_ms, exchange_count, mentioned_paths, mentioned_beads, mentioned_tokens, tail, updated_at\`.

3. **Daemon focus poller** — \`setInterval(60s)\` iterating alive sessions; for each with a \`transcript_path\`, calls \`extractFocus\` and upserts \`session_focus\`. Idempotent, swallows per-session errors.

4. **\`bear.workspace_state\` MCP tool** — returns \`{ sessions: [{claudePid, sessionId, project, status, lastActivityTs, focusHint}, ...], generatedAt }\`. Read-only; serves directly from the cache.

5. **\`bear.current_brief\`** — prefers cache for the caller's own session; falls back to live parse (existing \`getCurrentSessionContext\`) if cache is missing or stale (>2min).

6. **\`bear status\`** — per-session line gains \`focus=<first 60 chars of tail>\` when cached.

## /complete criteria

- Start daemon with \`--focus-poll-interval 1\` (1s), register a session pointing at a test JSONL fixture, wait 2s → \`bear.workspace_state\` returns non-empty \`focusHint\` for that session.
- Killing the JSONL file keeps the cached focus for subsequent calls (no throw; age_ms grows).
- \`bun vitest run vendor/bearly/tests/bear/\` green including new \`focus.test.ts\`.
- \`rg "session_focus" vendor/bearly/\` lives in \`lib/bear/database.ts\` + daemon + tests only.
- \`bear status\` output includes focus column for alive sessions with a transcript.

## Design decisions

- **Cache-only for now** — no LLM summarization yet (that's Phase 4). Focus = raw tail extraction, same shape as \`getCurrentSessionContext\`. Claude callers still do their own summarization in prompts.
- **Per-claude_pid key** — matches sessions table, avoids session_id duplicates if a Claude session re-registers.
- **Stale threshold 2min** — if focus data is older than 2min and the session is still alive, re-fetch synchronously on \`current_brief\`. Workspace_state tolerates any staleness (returns last seen).
- **Poll interval env** — \`BEAR_FOCUS_POLL_MS\` (default 60000). Tests use 500ms.