# The Plain Brain: An Exploration

> **Graduated**: This exploration led to the [brain architecture doc](../architecture/brain.md), which captures the committed design: chats as event source, memory graph (SPO triples), knowledge tree, solidification, entity schemas, and the PIM consolidation (kimmi/cloudi absorbed into km/pam).

*Feb 10, 2026 — triggered by Obsidian 1.12 CLI release*

This is an exploration of how km could position itself relative to Obsidian and the broader
AI agent memory landscape. Not a committed vision — a thinking-out-loud document.

## The Idea

km as a **plain brain** — a headless knowledge engine that turns a folder of markdown files
into a structured, queryable, history-aware knowledge tree. The intelligence layer that sits
beneath human interfaces and above the filesystem. Multiple interfaces — human and AI — connect to the same brain simultaneously.

"Plain" does triple duty:
- **Plain text** — markdown, no proprietary formats
- **Plain files** — one folder, git-pushable, editor-agnostic
- **Plain to see** — transparent, inspectable, no hidden state

## Trigger: Obsidian 1.12 CLI

Obsidian shipped an official CLI with 80+ commands and a TUI with autocomplete/history.
Their stated goal: "Anything you can do in Obsidian can be done from the command line."

Key commands: file CRUD, search, tasks, properties, link analysis (backlinks, orphans,
deadends), bases (structured queries), file history, sync, publish, workspace management,
developer tools, and a `web` viewer (open URLs in built-in Electron webview).

**Critical architectural difference**: Obsidian's CLI is RPC to a running Electron app.
Every command sends a message to the renderer. Requires Obsidian to be open (3-5s startup,
200MB+ memory). One vault at a time. Serial execution.

km is headless. No GUI dependency. 200ms startup. Embeddable as a TypeScript library.
Multiple repos simultaneously. Testable with `createBoardDriver()`.

## Brain Architecture

```
           ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
           │ Obsidian │  │Boardliner│  │Claude Cod│  │  pam    │
           │ (human)  │  │ TUI/Web  │  │ (AI)     │  │(harness)│
           └────┬─────┘  └────┬─────┘  └──────────┘  └────┬────┘
                │             │              │              │
                └──────┬──────┘──────────────┘──────────────┘
                       ↕ brain protocol
                ┌──────────────────────────────────────────┐
                │  KM (brain)                               │
                │  - Structured ordered tree                │
                │  - Full event history                     │
                │  - Queryable indexes (SQLite + FTS5)      │
                │  - Link analysis                          │
                │  - Self-describing (agent configs)         │
                └──────────────────┬───────────────────────┘
                                   ↕ bidirectional sync
                ┌──────────────────────────────────────────┐
                │  FILESYSTEM                              │
                │  Plain markdown files (Obsidian-compatibl│)│
                └──────────────────────────────────────────┘
```

**Brain (km)**: Portable knowledge engine. One folder = one brain. Git-pushable.
- Structured tree (typed nodes with parent/child, metadata, ordering)
- Full event history (every mutation recorded, auditable, replayable)
- Queryable indexes (SQLite, FTS5 search)
- Self-describing (contains agent configs: CLAUDE.md, skills, agent definitions)

**Interfaces** connect to the brain. Multiple simultaneous:
- **Obsidian** — human GUI editor (reads/writes same markdown, never knows km exists)
- **Boardliner TUI** — km's native terminal interface
- **Boardliner Web** — future browser interface (same board model)
- **Claude Code** — AI agent via .claude/ configs + km CLI
- **pam** — multi-channel AI harness (WhatsApp, email, Telegram) with 8 security layers

### Already happening today

| Interface | Connection |
|---|---|
| TUI (km-tui) | `import { openRepo }` — direct library |
| CLI (km-cli) | Wraps library in shell commands |
| Claude Code | `.claude/CLAUDE.md` + skills + `km` CLI |
| pam | Separate storage (potential km consumer) |
| Future: web boardliner | HTTP API to same brain |
| Future: MCP server | Tools for any AI agent |

### The self-describing brain

The brain contains its own operating manual:

```
my-vault/
├── .obsidian/              # Obsidian config (ignored by km)
├── .km/                    # Brain state
│   ├── state.db            # Queryable index
│   └── events.jsonl        # Full history
├── .claude/                # Claude Code config
│   ├── CLAUDE.md           # Agent instructions
│   └── skills/             # Agent capabilities
├── inbox/                  # Unprocessed inputs
├── projects/               # Active work
├── references/             # Knowledge base
└── archive/                # Completed work
```

A new interface connects, reads the brain's config, and immediately knows how to work with it.

## Brain Protocol

The interface between the brain and any client:

| Category | Operations | Metaphor |
|---|---|---|
| **Perceive** | get, search, query, children, backlinks | What does the brain know? |
| **Remember** | history, diff, snapshot | What happened before? |
| **Think** | link, setProperty, tag, move, classify | Organizing knowledge |
| **Act** | create, update, delete | Changing the world |
| **Reflect** | orphans, deadends, unresolvedLinks, stats | Self-assessment |
| **Subscribe** | watch for changes in real-time | Stay current |

Exposed via: TypeScript API (embedded), CLI (scripts), MCP tools (AI agents), HTTP (web).

## Plain Knowledge

Two views of the same knowledge:
- **Filesystem** (human-materialized) — natural markdown, edited in any editor
- **Database** (machine-friendly) — SQLite, indexed, queryable by agents

**Principle**: Use structure for fields that change programmatically (status, priority,
dates in frontmatter). Use natural prose for knowledge humans maintain (descriptions,
relationships, context). The brain extracts structure from natural writing.

```markdown
## Acme Corp
Type: company

### Team
- [[Alice]] — Engineering Lead (since 2024-03)
- [[Bob]] — Product Manager

### Projects
- [[Project Alpha]] — shipping Q1 2026
```

The brain indexes: links, relationship context ("Engineering Lead at"), temporal data,
hierarchy. Humans write naturally; the brain indexes structurally.

## Competitive Landscape

### vs Obsidian

km doesn't compete with Obsidian. It's complementary:
- Obsidian is a beautiful editor for humans
- km is the intelligence layer underneath
- `km init` in an Obsidian vault activates the brain
- Changes in Obsidian → km's watcher → brain updated
- Agent mutations → markdown updated → Obsidian sees changes

| | Obsidian | km |
|---|---|---|
| Primary interface | GUI (Electron) | Headless engine |
| CLI depends on | Running GUI app | Nothing (standalone) |
| Agent integration | Via CLI to running app | Native — IS the agent interface |
| Startup time | 3-5s | 200ms |
| Data model | Files + plugins | Event-sourced tree + files |
| History | Snapshots | Full event log |

### vs Khoj

Khoj (https://github.com/khoj-ai/khoj) is the closest existing project. It's an AI
assistant that connects to Obsidian vaults — semantic search, custom agents, multi-channel.

**Key difference**: Khoj adds AI **on top** (assistant layer). km adds intelligence
**underneath** (engine layer). Khoj is an interface; km is the brain.

### vs Letta/MemGPT

Letta (https://github.com/letta-ai/letta) is the closest architectural precedent for the
brain/interface split. Their tiered memory model:
- Core memory (in-context) ≈ km's active board state
- Archival memory (vector DB) ≈ km's SQLite
- Recall memory (conversation history) ≈ km's event log

### vs Obsidian MCP servers

Multiple MCP servers exist for Obsidian vaults (cyanheads/obsidian-mcp-server, etc.).
They're thin wrappers around file operations — CRUD, search, tags, frontmatter.

km as an MCP server would be qualitatively different: structured tree operations, event
history, link analysis, typed queries. Not just files — brain operations.

## Research Finding: Filesystem Beats Specialized Memory

Letta's benchmark (https://www.letta.com/blog/benchmarking-ai-agent-memory) tested
filesystem-based memory vs specialized memory tools:

**Filesystem won**: 74.0% accuracy on LoCoMo vs Mem0's graph variant at 68.5%.

Key insights:
- "Memory is more about how agents manage context than the exact retrieval mechanism"
- "Simpler tools are more likely to be in the training data of an agent"
- "Knowledge graphs may help in specific domains but may also be more difficult for the
  LLM to understand"

**This validates km's approach**: plain markdown files with a structured index are more
effective for agents than specialized memory infrastructure (vector stores, knowledge
graphs). The agent already knows how to read, write, and search files.

Mem0's graph memory (https://mem0.ai/research) only added ~2% over flat memory.
The winning strategy is: **simple storage + smart structure + good search**.

km already has all three: markdown (simple) + ordered tree (structure) + SQLite FTS5 (search).

## pam on km

pam (Personal Assistant Machine) as an AI interface layer on top of the km brain:

**km provides**: All persistent knowledge (notes, tasks, contacts, events), structured tree,
full history, query interface, file-system materialization.

**pam provides**: Channel adapters, security harness (8 layers), conversation state
(ephemeral), tool execution (WASM sandbox), escalation chain, anomaly detection.

**The gray zone**: ~~ENGRAM memory (SPO triples) — persistent agent knowledge.~~ **Resolved**: SPO triples live in km as `spo_triples` table in SQLite, with entity schemas for contacts/events/tasks. See [brain architecture](../architecture/brain.md).

**Coupling**: Start tight (pam imports @km/storage directly, same monorepo), extract
protocol once it stabilizes.

## What Obsidian Has That km Should Consider

### High-value (aligned with brain vision)

1. **Link analysis** (`backlinks`, `orphans`, `deadends`) — brains need to know their own
   structure. km parses links already, just needs to expose the analysis.

2. **History/diff browsing** — km's event sourcing is more powerful than Obsidian's
   snapshots, but hidden. `km history`, `km diff` would be unique differentiators.

3. **Structured queries** — km has SQLite underneath. Expose it: `km query "type:task
   status:open priority:<3"` with JSON/TSV/MD output. This is Obsidian's Bases/Dataview
   but backed by real SQL.

4. **Property CRUD** — expose frontmatter as first-class CLI: `km prop:set`, `km prop:read`.

5. **MCP brain server** — expose brain protocol as MCP tools. Differentiates from every
   existing Obsidian MCP server (which are thin file wrappers).

### Medium-value

6. Tags, workspace save/restore, templates, web clipping, developer tools.

### Not km's concern

Publishing (use git + SSG), plugins (use vendor packages), themes (TUI is simpler), sync
(use git), web viewer (agents bring content to the brain, not vice versa).

## Open Questions

- Should the brain protocol be formalized as a TypeScript interface before building the
  MCP server? Or let the MCP tools define the protocol?
- How does multi-brain work? (Personal brain + work brain + project brain)
- Where does the boardliner web interface fit in the priority stack?
- What's the minimum Obsidian compatibility needed? (wikilinks, .obsidian/ ignore, what else?)
- ~~Should km parse Dataview inline properties (`key:: value`) for graph extraction?~~ **Yes** — entity schemas use `key:: value` format. See [brain.md](../architecture/brain.md#entity-schemas).

## References

- Obsidian CLI docs: https://help.obsidian.md/cli
- Letta/MemGPT: https://github.com/letta-ai/letta
- Letta memory benchmark: https://www.letta.com/blog/benchmarking-ai-agent-memory
- Mem0 research: https://mem0.ai/research
- Khoj: https://github.com/khoj-ai/khoj
- Obsidian MCP servers: https://github.com/cyanheads/obsidian-mcp-server
- MCP protocol: https://modelcontextprotocol.io
