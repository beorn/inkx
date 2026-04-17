---
description: Search and manage Claude Code session history. Use proactively when encountering errors, starting work, or recovering lost content.
argument-hint: <query> [--raw] [--since time] [-q|-r] [-i types]
allowed-tools: Bash
---

# Recall — Session History Search

**Keywords**: recall, memory, history, session, recover, find, previous session, lost conversation

Unified CLI for searching, managing, and recovering Claude Code session history.

**NEVER read/cat entire session or tool-results files.** Always use `bun recall` (FTS5-indexed, <100ms).

## Auto-Recall

Memory recall fires automatically on every non-trivial prompt via UserPromptSubmit hook.
You usually don't need to search manually — prior knowledge appears as "Session Memory" context.

## Recommended calling pattern

For a user query like `/recall X`, `recall X`, or "what did we do about Y":

**Prefer the `bear.*` MCP tools** when they're available (registered in
`.mcp.json`) — they call the same library as `bun recall` but without the
~400ms subprocess-spawn cost. The CLI remains available for humans and scripts.

**Simple queries with specific tokens** (file names, bead IDs, function names — 1–3 words):
```bash
bun recall --raw "X" -n 10          # single FTS, ~500ms — CLI only (no MCP equivalent)
```

**Everything else** (vague, natural-language, "that time we…"):
- Via MCP: call `bear.ask({ query: "X" })` — planner-driven, ~4–6s with speculative synth
- Via CLI: `bun recall "X" --agent` — same library, 400ms subprocess overhead

**Speculative cheap context** (when you want to see results BEFORE deciding whether to escalate):
- Via MCP: `bear.current_brief()` for session paths/beads/tokens, then `bear.plan_only({ query })` for planner variants only (~2s, no fanout/synth)
- Via CLI:
  ```bash
  bun recall current-brief             # ~50ms
  bun recall "X" --raw -n 10           # ~500ms — first-pass FTS snapshot
  bun recall "X" --agent --debug-plan  # full planner trace if still unclear
  ```

**Never** iterate by running `bun recall` or `bear.ask` with slightly different query wordings
— agent mode does that internally (2 rounds with wider/deeper variants) in one call. If one
call with agent mode doesn't find it, the answer is not in the corpus.

### Current session context

`bun recall` feeds the last ~300 lines of the current conversation into the planner.
This means vague queries like "that link thing we just did" work naturally — the
planner sees what the user was actually doing.

**Session detection** (best to fallback):
1. `CLAUDE_SESSION_ID` env var (if set)
2. **Sentinel file** written by a SessionStart hook — deterministic; recommended
3. Most-recently-modified JSONL for the current project (fallback heuristic)

For reliable detection under parallel sessions, install the SessionStart hook in
`.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "bun recall session-start" }
        ]
      }
    ]
  }
}
```

The hook writes `~/.claude/bearly-sessions/pid-<claude-pid>.json` once per session.
`bun recall` walks its ancestor PIDs to find the matching sentinel. Works even with
multiple Claude Code sessions in the same project.

**Without the hook**: the mtime fallback still works for typical single-session use.

`bun recall current-brief` exposes the detected session + paths/beads/tokens/tail
for inspection.

## Search (default command)

```bash
# Search + LLM synthesis (default)
bun recall "inline edit keyboard handling"

# Raw results, no LLM synthesis
bun recall --raw "createRepo"
bun recall "createRepo" --raw

# Time-scoped
bun recall --since 1w "flicker bug"

# JSON output
bun recall --json "command system design"

# Limit results
bun recall -n 15 "storage layer"
```

### Agent mode — LLM-driven multi-query search (experimental)

For vague or fuzzy queries (`"that time we fixed the column thing"`), a single FTS5 query
often misses. Agent mode uses a cheap LLM to plan 10–20 FTS variants *from your project
context* (recent sessions, beads, rare vocabulary, commits), fans out in parallel, and
coverage-reranks so docs hit by multiple variants dominate.

```bash
# Enable agent mode
bun recall --agent "that time we fixed the column thing"

# Round-2 mode (default: auto — picks wider/deeper based on round-1 coverage)
bun recall --agent --round2=wider  "foo"   # force broader phrasings
bun recall --agent --round2=deeper "foo"   # force entity-specific drill-in
bun recall --agent --round2=off    "foo"   # skip round 2 entirely

# Show the full plan each round (keywords, phrases, paths, bead IDs, notes)
bun recall --debug-plan "query"

# Cap rounds (useful for eval runs)
bun recall --agent --max-rounds 1 "query"

# Env var: enable agent mode without per-call flag
RECALL_AGENT=1 bun recall "query"

# Offline trace for post-hoc A/B evaluation — writes JSON to ~/.claude/recall-traces/
RECALL_AGENT_TRACE=1 bun recall --agent "query"
```

**How it reads**: compact trace printed above the synthesis shows planner model,
variants generated, fanout stats (queries / raw hits / unique docs / top coverage),
round-2 mode and why. After the answer, a single line reports the synth path:
`short-circuited after round 1`, `round 2 ran but was marginal — used round-1 speculative`,
`round 2 added new docs — fresh synth ran AND speculative was WASTED (2 calls)`, or
`fresh synth on merged (speculative disabled)`.

**Speculative synth** is enabled by default — fires synthesis on round-1 results in
parallel with round-2 planning. If round 2 adds <2 new top-K docs, we use the
speculative answer (saves ~2–3s). Disable with:

```bash
bun recall --agent --no-speculative-synth "query"   # per call
RECALL_SPECULATIVE_SYNTH=0 bun recall "query"       # env var
```

Disabling saves nothing on short-circuit queries, costs ~2–3s on marginal-round-2
queries, and saves one billed LLM call on substantive-round-2 queries.

**Fallthrough**: if no LLM provider is available (no API keys, no local model), agent
mode falls through to the standard single-query path. Never worse than the default.

### Power-user filters (imply --raw)

```bash
# User questions only
bun recall -q "how do I"
bun recall -q -s today

# Assistant responses only
bun recall -r -s 1w "error"

# Tool-specific messages
bun recall -t Write -p "*km*" -s 1d

# Content types: p=plan, m=message, s=summary, t=todo, f=first_prompt, k=skill
bun recall -i p,m "refactor"

# Skill invocations — find past uses of /pm, /explore, etc.
bun recall -k "bug"           # All skill invocations mentioning "bug"
bun recall -k pm              # Only /pm invocations
bun recall -k explore -s 1w   # /explore invocations this week
bun recall -i k "deploy"      # Same as -k but via include flag

# Regex search (slower, scans raw files)
bun recall -g "function\s+\w+Async"

# Specific session
bun recall --session abc123 "bug"
```

## Status Dashboard

```bash
bun recall status          # Index health, activity, hooks, recommendations
bun recall status --json   # Structured output
```

Shows: index health, active sessions, today's activity, message breakdown, hook config, recommendations.

## Sessions

```bash
bun recall sessions              # List all sessions (last 30d)
bun recall sessions abc123       # Show session details
bun recall sessions -p "*km*"   # Filter by project
```

## Files (writes/recovery)

```bash
bun recall files                 # List recent writes (last 100)
bun recall files "*.tsx"         # Search writes by file path
bun recall files --restore path  # Restore file content
bun recall files --date 2026-02  # Filter by date
```

## Index

```bash
bun recall index                 # Full rebuild
bun recall index --incremental   # Update new sessions only
```

## Search Options

| Option | Description |
|--------|-------------|
| `--raw` | Skip LLM synthesis, show raw results |
| `--json` | JSON output |
| `-s, --since <time>` | Time window: `1h`, `1d`, `1w`, `today`, `yesterday` (default: 30d) |
| `-n, --limit <num>` | Max results (default: 10) |
| `--timeout <ms>` | LLM timeout (default: 4000) |
| `-p, --project <glob>` | Project glob match (e.g., `*km*`) |
| `-g, --grep` | Regex mode (slower, scans files) |
| `-q, --question` | Only user questions (implies --raw) |
| `-r, --response` | Only assistant responses (implies --raw) |
| `-t, --tool <name>` | Messages with specific tool (implies --raw) |
| `--session <id>` | Specific session (implies --raw) |
| `-k, --skill [name]` | Skill invocations only, optionally filter by name (implies --raw) |
| `-i, --include <types>` | Content types: p,m,s,t,f,b,e,d,c,k (implies --raw) |

## Time Formats

| Format | Meaning |
|--------|---------|
| `1h`, `2h` | Hours ago |
| `1d`, `7d` | Days ago |
| `1w`, `2w` | Weeks ago |
| `today` | Since midnight |
| `yesterday` | Since yesterday midnight |

## When to Use Manually

- **Errors you've seen before**: `bun recall "error message text"`
- **Architecture decisions**: `bun recall "why did we choose X"`
- **Deeper investigation**: When auto-recall summary isn't enough, use `--raw` for full snippets
- **File recovery**: `bun recall files --restore path/to/file`
- **Activity check**: `bun recall status`

## Performance

- FTS5 search: <100ms on 6GB+ data
- Index rebuild: ~2-4 min for full history
- Database: `~/.claude/session-index.db`
