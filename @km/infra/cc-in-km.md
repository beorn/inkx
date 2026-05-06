---
mentions:
  - km
id: "@km/infra/cc-in-km"
aliases:
  - km-infra.cc-in-km
  - km-infra-cc-in-km
created_at: 2026-02-09T10:44:50Z
---

# [ ] Investigate running Claude Code inside km view @km/infra #feature #P4

## Vision: km as PKM + AI Agent Workbench (2026-02-09)

### The three pieces

- **km** = your data + your eyes (PKM, TUI, bidirectional sync, board view)
- **pam** = the safety layer + orchestration (split-brain, CRDT branches, policy engine, approval)
- **Claude Code** = the brain (reasoning, tool use, code generation, streaming NDJSON)

Reframe: km view becomes the workbench UI for pam-orchestrated agents that happen to be Claude Code instances.

### Creative angles

**Agents as board cards**: Running agents appear as cards alongside notes and tasks. Each card shows: current task, status (thinking/waiting for approval/executing), token budget, CRDT branch diff. Agents aren't a separate tool — they're peers of your notes and tasks.

**CRDT branches as visual diffs**: When a pam executor proposes changes, km view renders the branch as a "pending changes" overlay — cards with a subtle border indicating "agent wants to modify this." Keybinding previews diff, another approves merge. The approval UX that pam needs already wants to be a TUI.

**Agent memory IS your PKM**: Instead of separate memory systems (ENGRAM, conversation logs), agent memory stored as km notes. Agent learning persists as markdown. You browse/edit/curate what agents know. Cross-agent knowledge sharing = km search. Collapses cloudi's ENGRAM into km storage.

**Each pam executor IS a Claude Code instance**:

- Triage agent = Claude Code with zero MCP tools (split-brain enforced by no tool access)
- Policy engine = deterministic TypeScript code (not an LLM), exactly as pam designs it
- Executor agent = Claude Code with scoped MCP tools, running on a CRDT branch
Full Claude Code reasoning + tool use, wrapped in pam's security model, visible in km's board.

**Multi-agent orchestration**: Multiple simultaneous agents (researching, drafting, reviewing) — each a card on the board. pam's policy engine manages budgets and approval modes across all. km view shows the whole picture. Think tmux for AI agents, but structured.

**Knowledge-informed context injection**: When pam spawns an executor, inject relevant km context automatically — priorities (P1 tasks), relevant notes (semantic search), recent history. Agent starts with your PKM as working memory.

### Expanded angles (session 2)

**Time-travel agent debugging**: km's event-sourced SQLite means every agent action is a replayable event. Unlike Claude Code's flat conversation log, you can scrub through an agent session like a video timeline — "What did the agent know at step 14?", "When did it decide to change the auth module?", "Rewind to before the bad edit and fork from there." `km agent replay sess-abc --step 14` renders the agent's state at that point. The detail pane shows the diff between step 14 and step 15. This is `git bisect` for AI reasoning.

**Sessions as knowledge artifacts**: An agent's research session doesn't just produce a summary. The session itself becomes a first-class node in the tree, with bidirectional markdown sync. You can `[[link]]` to agent sessions in your notes. Search finds them. They appear on boards. The boundary between "human wrote" and "agent wrote" dissolves — it's all knowledge in the tree. Edit the agent's output in your editor and it syncs back.

**Reactive knowledge triggers**: Don't just inject context when an agent starts — let the knowledge graph trigger agents. P0 task created → triage agent wakes. Note tagged `#needs-review` → reviewer agent picks it up. Three tasks in the same module pile up → refactoring agent proposes consolidation. You mark a research node "stale" → researcher agent refreshes it. The tree IS the event bus. `km watch` already handles file system events — extend it to trigger agent harnesses based on node mutations.

**Location IS configuration**: Instead of manually configuring agent harnesses, agents auto-specialize based on tree position. An agent under `/projects/km/` gets CLAUDE.md, test commands, TypeScript context. Move it to `/projects/decker/` and it gets Next.js context. Move to `/research/` and it gets read-only tools. The harness is derived from ancestors: walk up the tree, collect CLAUDE.md files, tool permissions, domain context. This is the Unix "everything is a file" principle for agent configuration: everything is a tree position.

**Approval as collaborative editing**: The approval UX is an editing surface, not binary approve/deny. Agent proposes 5 node changes on a CRDT branch. You see them as cards in a "pending" column. Accept individual changes (cherry-pick), edit a change before accepting (refine), add your own changes to the branch (augment), split into two branches (fork), or ask the agent to revise one change while accepting the rest. `d` to view diff, `e` to edit, `a` to accept, `x` to reject.

**Session topology — branching conversations**: Linear chat is limiting. km's tree structure enables branching. Fork a session to explore two approaches. The winning branch merges back. Dead ends stay searchable — "we tried B, it didn't work because X." This is git branching for AI reasoning.

**The board as control surface**: Don't build a separate agent management UI. Column = agent state (Thinking, Waiting for Approval, Executing, Done). Drag task to agent column → assigns it. Priority on board → agent picks up P0 before P2. Card detail pane → shows agent's current reasoning stream (NDJSON). Collapse column → pause agent. Board filter → show only one agent's work. The spatial metaphor that makes kanban good for humans works identically for agents.

**Cross-agent learning via the graph**: When agent A discovers "approach X doesn't work for module Y", that becomes a node. Agent B, working on a related module, gets this injected automatically via km's semantic search. You curate what persists — delete bad learnings, promote good ones, add annotations. This is MEMORY.md scaled to N agents, mediated by the knowledge graph. Recall rollups extend to include agent sessions — "What did any agent learn about payments this week?"

**Zero impedance — terminal-native composition**: Most AI-in-editor integrations put a chat panel in a web UI that wraps terminal operations. km view IS the terminal. Claude Code IS the terminal. NDJSON streams directly into hightea rendering. Key events go directly to the agent's stdin. DEC 2026 sync update keeps rendering tear-free. No Electron, no web sockets, no HTTP — just Unix pipes and PTYs.

**The trust ladder**: Progressive autonomy maps to concrete pam policies:

- Observer: Read tree, suggest. No write tools. Chat panel, read-only.
- Proposer: Create CRDT branch. Write to branch only. "Pending" column appears.
- Worker: Edit on approval. Approve-per-change. Approval bar in board.
- Autonomous: Edit freely. Budget + audit only. Agent column, auto-merge.
Promote agents by changing harness constraints. Board visually reflects trust level.

### The novel synthesis

What makes this different from every other "AI in an editor" vision:

1. **Structured knowledge graph as shared memory** — not flat chat history, not vector DB, but a tree with links, tags, hierarchy, and bidirectional markdown sync
2. **Event-sourced agent sessions** — replayable, forkable, searchable events, not opaque logs
3. **Spatial orchestration** — the kanban board IS the agent coordination UI
4. **Terminal-native composition** — no abstraction tax between AI and display
5. **Trust as a first-class concept** — pam's security model makes progressive autonomy concrete

The key insight: km already has all the primitives (tree, events, board, commands, bidirectional sync). Adding agents isn't bolting on a new system — it's treating AI workers as another kind of node in the same tree.

### Clean architecture

```
km view (TUI)
  ├── Board columns (notes, tasks, calendar)
  ├── Agent panel (streaming NDJSON → structured rendering)
  └── Approval bar (preview/approve/deny CRDT branch merges)
       ↕
pam (orchestrator)
  ├── Triage (Claude Code, no tools)
  ├── Policy (deterministic code)
  ├── Executor (Claude Code, scoped MCP tools, CRDT branch)
  └── Approval protocol (→ km view)
       ↕
km storage (SQLite + markdown sync)
  ├── Your data (notes, tasks, events)
  ├── Agent memory (stored as notes)
  └── CRDT branches (agent sandboxes)
```

### Suggested phasing

1. Agent SDK NDJSON panel in km view (Option B spike — read-only rendering)
2. km storage as MCP server (agents can read notes/tasks via MCP tools)
3. pam policy layer wrapping Claude Code subprocess (security boundary)
4. CRDT branch visualization + approval UX (full loop)
5. Multiple agents as board cards (orchestration)

Steps 1-2 are independently useful. Step 3 is where pam enters. Steps 4-5 are the full vision.

