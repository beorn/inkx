# Memory System Design

First-class memory for Claude Code sessions — automatic recall of past decisions, failures, and lessons.

## Architecture

Three layers of memory, from curated to raw:

### Layer 1: MEMORY.md (Curated, Always-Loaded)

- Location: `~/.claude/projects/<project>/memory/MEMORY.md`
- Loaded into system prompt on every message (200-line limit)
- Manually curated by human and AI
- Contains: project conventions, key patterns, proven approaches, warnings
- **Write**: Claude updates via Edit tool during sessions
- **Read**: Automatic (system prompt)

### Layer 2: Session Archive (Auto-Generated, Searchable)

- Location: `~/.claude/projects/<project>/memory/sessions/YYYY-MM-DD.md`
- Auto-generated at session end via SessionEnd hook
- Contains: lessons learned, decisions, bugs found, failed approaches
- Append-only dated files — never auto-edited
- **Write**: SessionEnd hook → cheap LLM synthesis → append to dated file
- **Read**: Searched by recall system, not auto-loaded

### Layer 3: Raw Session Data (Indexed, On-Demand)

- Location: `~/.claude/projects/<project>/*.jsonl` (session transcripts)
- Indexed into SQLite FTS5 database (`~/.claude/session-index.db`)
- ~350K messages, <100ms search
- Contains: everything (messages, tool uses, results, thinking)
- **Write**: Claude Code writes automatically
- **Read**: Searched by recall system via FTS5

## Data Flow

```
User Prompt
    │
    ├─→ UserPromptSubmit Hook (memory-recall.sh)
    │     ├─→ Skip trivial prompts (<15 chars, "yes", "ok", etc.)
    │     ├─→ FTS5 search (messages + content tables)
    │     ├─→ Cheap LLM synthesis (~$0.001, ~2-3s)
    │     └─→ Return as additionalContext
    │
    ├─→ Claude processes prompt + memory context
    │
    └─→ Session continues...

Session End
    │
    └─→ SessionEnd Hook (session-end-remember.sh)
          ├─→ Extract last ~50 user/assistant messages
          ├─→ Cheap LLM extracts lessons (~$0.005)
          └─→ Append to sessions/YYYY-MM-DD.md
```

## Recall Command

```bash
bun recall <query>              # Search + synthesize
bun recall --raw <query>        # Raw results, no LLM
bun recall --since 1w <query>   # Time-scoped
bun recall --json <query>       # JSON output (for hooks)
bun recall --limit 5 <query>    # Limit results
```

### Search Strategy

1. Run FTS5 search on `messages_fts` table (BM25 ranking with field weights)
2. Run FTS5 search on `content_fts` table (plans, summaries, todos, first_prompts)
3. Merge results by BM25 rank
4. Deduplicate by session
5. Take top N results
6. Synthesize via cheap LLM

### BM25 Field Weights

- **messages_fts**: content=10x, tool_name=1x, file_paths=2x
- **content_fts**: title=2x, content=10x

### Synthesis Prompt

Instructs the LLM to extract:

- Decisions made and their rationale
- Approaches tried (including failures and why)
- Key file paths mentioned
- Warnings and lessons learned
- Unresolved issues

## Cost Model

| Operation                     | Cost            | Frequency                |
| ----------------------------- | --------------- | ------------------------ |
| Auto-recall (per prompt)      | ~$0.001-0.003   | Every non-trivial prompt |
| Manual recall                 | ~$0.001-0.003   | On demand                |
| Session-end remember          | ~$0.005-0.01    | Once per session         |
| **Daily total** (~50 prompts) | **~$0.05-0.20** |                          |

## Design Decisions

### Synthesis-at-retrieval, not observation-at-capture

We already have 350K indexed messages. Compressing at read time with a ~$0.001 LLM call is:

- 10x cheaper than capturing observations on every tool use
- Zero overhead on the working session
- Can be improved without reprocessing history

### Three-layer architecture

- MEMORY.md: Human-curated, always available, small (200 lines)
- Session archive: Auto-generated, searchable, grows over time
- Raw data: Complete record, searchable via FTS5

This separates "knowledge I want to always have" from "knowledge I can find when needed."

### UserPromptSubmit hook (synchronous)

- Adds ~2-5s to each prompt — acceptable for the value of context recovery
- "Searching memory..." status message keeps user informed
- Trivial prompt detection avoids wasted LLM calls on "yes"/"ok"

### Why not claude-mem/supermemory

- Those systems require separate infrastructure and API keys
- We already have the data (session transcripts) and the search (FTS5)
- Adding a cheap LLM call leverages existing capabilities at minimal cost
