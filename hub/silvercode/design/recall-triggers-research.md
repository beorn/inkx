# Recall trigger upgrade — research notes

Background prior-art survey for `km-silvercode.recall-trigger-upgrade` — replacing the every-5-turns placeholder with a dynamic salience-based trigger.

## Current state (silvercode, 2026-04-27)

`apps/silvercode/src/ambient-adapters/recall.ts` + controller wiring in `apps/silvercode/src/controller.ts`:

- Probe fires on the **5th `turn-end` event** per session
- Query is the **last user prompt verbatim** (`"yes"`, `"continue"`, etc. all probe)
- Self-rate-limit: 60 s per adapter (one probe per 60 s regardless of session)
- Emits ONE digest event per probe with first 2 hits inline + tail count

Failure modes observed in dogfooding:
- Probes fire on prompts that don't warrant recall (`yes`, `pls continue`)
- Misses opportunities mid-turn when the agent mentions a known identifier (bead ID, file path, error)
- Verbatim prompt is rarely the right query — `"what about that wrap regression"` should probe `wrap regression`, not the whole sentence

## Prior art

### 1. ChatGPT (OpenAI)

Two layers of memory:

**Saved memories** — permanent facts (e.g., "user works at Acme", "prefers terse output").
- **Trigger:** injected ONCE at session start in the `Model Set Context` block of the system prompt
- **Capture:** auto-captured by an LLM during conversation when it judges the information "useful for future"; user-editable

**Chat-history summary** — rolling summary of all past conversations.
- Updated frequently as conversations progress
- Injected at new chat start

**Architectural note:** ChatGPT does NOT do per-prompt dynamic retrieval. It pre-injects relevant memory into the system prompt and lets the model use what it sees.

### 2. Mem0 (production-ready open-source)

Vector + graph hybrid memory:

- **Storage:** LLM extracts "atomic facts" from conversation, embeds + stores; deduplicates against existing
- **Vector layer:** semantic similarity search (embeddings) over stored facts
- **Graph layer:** entity/relationship traversal ("Python user" → "uses pandas" → "at company X")
- **Retrieval trigger:** explicit — agent queries `mem0.search(query)` when it decides
- **Filtering:** metadata tags (project, time range, source) for scoped queries
- **Production stat:** claims +26% retrieval quality over OpenAI's built-in memory on benchmarks

**Architectural note:** retrieval is on-demand, not always-on. Quality comes from pre-processing (atomic-fact extraction) + hybrid vector/graph store.

### 3. Letta / MemGPT

Tool-call memory paradigm — agent autonomously manages its own memory:

- **Tiers:**
  - `core_memory` — small, always-in-context (persona, user pinned facts)
  - `recall_memory` — full conversation log (search-on-demand)
  - `archival_memory` — long-term summarized notes (search-on-demand)
- **Triggers:** agent calls `recall_search(query)` / `archival_search(query)` as tools when it judges relevant
- **Self-management:** agent decides what to write to which tier based on importance signals it learns
- **Persistence:** automatic to disk (vs. Mem0 which is more orchestration-layer)

**Architectural note:** Letta pushes the relevance decision INTO the agent. No system-level salience trigger; the agent's own reasoning handles "should I recall now?"

### 4. Cursor (IDE)

Hybrid implicit + explicit context:

**Implicit:**
- Local embedding index on the codebase (project-scoped)
- Every prompt: similarity search runs in background, top-K snippets attached automatically
- "Cursor estimates relevance" — black-box ranking

**Explicit `@-mention`:**
- `@Files`, `@Folders`, `@Code`, `@Docs`, `@PastChats` — user-directed context
- Cursor 2.0 REMOVED `@Web`, `@Git`, `@LinterErrors`, `@RecentChanges` — replaced with agent-driven tool use (the agent calls `git diff`, reads linter, browses web on its own when needed)

**Architectural note:** the trend in Cursor 2.0 is *fewer @-mentions, more agent-driven*. What's left is what the user genuinely knows better than the agent.

### 5. Aider (terminal coding agent)

Repository map approach (NOT retrieval):

- Tree-sitter extracts symbols (functions, classes, types) from the entire repo
- Repo map = compressed text representation of all symbols + their containing files
- **Trigger:** repo map is injected on every prompt
- Token budget: dynamically sized based on prompt budget; prefers files git-recently-modified
- No vector search; relies on the model to scan the map and pull in needed files via tool calls

**Architectural note:** Aider sidesteps trigger-decision by injecting a static index every time. Trades token budget for retrieval simplicity.

## Patterns extracted

Three architectural strategies for "when to inject memory into the prompt":

| Strategy             | Examples                | Pros                                                       | Cons                                                          |
|----------------------|-------------------------|------------------------------------------------------------|---------------------------------------------------------------|
| Always-on at start   | ChatGPT memory          | Simple, predictable; no per-turn cost                      | Stale across long sessions; forces summary loss               |
| Tool-call on demand  | Letta, mem0             | Maximum relevance; agent reasons about need                | Requires agent to know the tool exists; round-trip cost       |
| Implicit per-prompt  | Cursor (codebase RAG)   | Always available, no friction                              | Cost on every prompt; noise if relevance ranker is weak       |
| Static index always  | Aider repo map          | No retrieval at all; model handles selection               | Token budget hog; doesn't scale to massive corpora            |

## Implications for silvercode

**Constraints unique to silvercode:**

1. **We don't fully control the spawned agent's tools.** The agent runs as Claude / Codex / Gemini behind ACP — we can offer MCP tools, but the agent doesn't always discover them organically.
2. **Ambient-context-safety matters.** Every injection passes through Layer 2 sanitize + the EmbeddedResource boundary; we already have the framing.
3. **Latency budget is generous.** The agent is mid-turn for tens of seconds typically; a 200-500 ms recall query is invisible.
4. **The Anthropic backend's recall index is already built** (bearly's session-index.db) — we don't need to redo embeddings.

**Hybrid I'd propose** (synthesis of the above):

Move the trigger from time-based to **salience-based with per-token dedupe**:

1. **Watch the user prompt + the agent's last completion.**
2. **Extract salient candidates** via pure regex (no LLM):
   - kebab-case identifiers with ≥2 hyphens (`km-silvercode.X`, `feedback-trace-v3`)
   - file paths (`apps/silvercode/src/ambient-adapters/recall.ts`)
   - error strings (`TypeError: …`, `Error: …`)
   - quoted phrases (`"the wrap bug"`)
3. **Per-token dedupe with 5-minute TTL.** Same token within window stays silent; fresh tokens fire immediately.
4. **Cap at 1 probe per turn.** Pick the rarest / most-namelike candidate.
5. **Probe ON the candidate, not the whole prompt.** `recall.search("wrap regression")` is much more useful than `recall.search("what about that wrap thing")`.

This is the **Cursor implicit-per-prompt model, gated by salience** — get the always-available property without the noise on banal prompts.

**Future evolution** (deferred):

- Expose `recall_search(query)` as an MCP tool the agent can call when it has a specific question (Letta-style). Compose with the salience trigger — the agent can call it explicitly OR our salience trigger can pre-fire it.
- Track which recall events the agent visibly references in its next turn. Use that as a quality signal to tune the salience extractor (more confidence on tokens that produced useful recall hits in the past).

## Sources

- [Memory FAQ | OpenAI Help Center](https://help.openai.com/en/articles/8590148-memory-faq)
- [How ChatGPT Memory Works, Reverse Engineered](https://llmrefs.com/blog/reverse-engineering-chatgpt-memory)
- [How ChatGPT Remembers You — Embrace The Red](https://embracethered.com/blog/posts/2025/chatgpt-how-does-chat-history-memory-preferences-work/)
- [Mem0 docs — Search Memory](https://docs.mem0.ai/core-concepts/memory-operations/search)
- [Mem0: Building Production-Ready AI Agents (arXiv)](https://arxiv.org/html/2504.19413v1)
- [Letta — Agent Memory: How to Build Agents that Learn and Remember](https://www.letta.com/blog/agent-memory)
- [Letta API Platform | Letta Docs](https://docs.letta.com/concepts/memgpt/)
- [Cursor — Working with Context](https://docs.cursor.com/en/guides/working-with-context)
- [Cursor — Context Management Strategies (2026)](https://datalakehousehub.com/blog/2026-03-context-management-cursor/)
- [Beyond RAG: Architecting Context-Aware AI Systems — InfoQ](https://www.infoq.com/articles/beyond-rag-context-aware/)

## Next step

Pose this synthesis + the proposed silvercode hybrid to `/pro` for architectural critique. Output captured at `hub/silvercode/design/recall-trigger-pro-review.md`.
