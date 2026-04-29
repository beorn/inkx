---
id: "@km/bear/summarizer"
aliases:
  - km-bear.summarizer
  - km-bear-summarizer
created_by: Bjørn Stabell
created_at: 2026-04-17T15:48:30Z
closed_at: 2026-04-17T16:02:11Z
close_reason: Phase 4 complete. Opt-in summarizer
  (BEAR_SUMMARIZER_MODEL=haiku/local/off) wired into daemon with 5 new
  session_focus columns, bear.session_state MCP tool, CLI summary display. 28
  bear tests green. Integration followup commit 4220fbe fixed missed file commit
  from the first go.
---

# [x] Phase 4: background Haiku summarizer @km/bear #task #P2 @Bjørn Stabell

blocks:: [[@km/bear]], [[@km/bear/focus]]

Phase 4 of the bear plan (epic: @km/bear, depends on @km/bear/focus). Daemon
gains an opt-in background coroutine that periodically summarizes each
alive session's tail into a 1-sentence focus + loose_ends. Reused by
\`bear.workspace_state\` and exposed via new \`bear.session_state\` RPC/MCP.

## Scope

1. **Schema** — extend \`session_focus\` with:
   \`focus_summary TEXT, loose_ends TEXT, summary_updated_at INTEGER, summary_model TEXT, summary_cost REAL\` (additive columns, try/catch ALTER).

2. **\`tools/lib/bear/summarizer.ts\`** — pure function \`summarizeTail(tail, opts)\` → \`{ focus: string, looseEnds: string[], model, cost }\`. Uses \`tools/lib/llm/research.queryModel\` with cheap model preference \`PLANNER_PREFERENCE\` (Haiku 4.5 first). Prompt: terse JSON output \`{focus: string, loose_ends: string[]}\`. Returns null if model unavailable.

3. **Daemon coroutine** — background interval (\`BEAR_SUMMARY_POLL_MS\`, default 120_000) iterating alive sessions. For each session with a focus row where \`(summary_updated_at IS NULL OR last_activity_ts > summary_updated_at)\` AND \`(ageMs < 30min)\` → summarize. Errors logged, never throw. Skip entirely when \`BEAR_SUMMARIZER_MODEL=off\` (default).

4. **\`bear.session_state\` RPC/MCP** — returns \`{ sessionId, claudePid, project, lastActivityTs, ageMs, exchangeCount, focus, looseEnds, summaryModel, summaryUpdatedAt }\`. Resolves session by sessionId; 404-like error if unknown.

5. **\`bear.workspace_state\` extension** — session rows include \`focusSummary: string | null, looseEnds: string[]\` when present. Falls back to raw tail hint if no summary.

6. **CLI** — \`bear sessions\` shows summary when present (instead of raw hint). \`bear summarize <sessionId>\` forces immediate summarization.

## /complete criteria

- With \`BEAR_SUMMARIZER_MODEL=off\` (default), no LLM calls are made; tests that mock queryModel assert zero calls.
- With \`BEAR_SUMMARIZER_MODEL=haiku\` + mocked queryModel, after one poll tick the \`session_focus.focus_summary\` is populated with the mock string.
- Changing only the summary column doesn't disturb cached focus fields (tail, paths, beads).
- \`bear.session_state\` returns 404-like error for unknown sessionId.
- \`bun vitest run vendor/bearly/tests/bear/summarizer.test.ts\` green.
- \`rg "focus_summary" vendor/bearly/\` lives only in database.ts + daemon + tests.

## Design decisions

- **Opt-in by default** — LLM cost warrants deliberate enable. \`BEAR_SUMMARIZER_MODEL\` env: \`off|haiku|local\`. Default \`off\`.
- **One summary per tail delta** — don't re-summarize if \`last_activity_ts\` hasn't moved. Guards against wasted cost on idle sessions.
- **Model pick** — Haiku 4.5 by default (ultra-cheap). \`local\` routes to qwen3-coder-flash via LM Studio when configured.
- **Tolerant JSON parse** — summarizer strips code fences and accepts non-strict JSON. Falls back to raw-text-as-focus if JSON fails.
- **No summarization of dead sessions** — ageMs >30min skips entirely.