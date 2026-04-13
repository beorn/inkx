# gbrain/gstack → km/pam Convergence Analysis

Date: 2026-04-12

## Executive Summary

gbrain is Garry Tan's personal AI knowledge system — a markdown-based brain repo backed by Postgres/PGLite with pgvector hybrid search, exposed as 30 MCP tools, designed for persistent AI agents to read before responding and write after every conversation. gstack is his companion developer workflow — 23 Claude Code skills organized as a sprint pipeline (think/plan/build/review/test/ship/reflect) that enabled him to ship 600k+ lines in 60 days. Together they represent the most production-tested implementation of the "AI agent with personal knowledge" pattern, deployed at scale (14,700+ brain files, 3,000+ people pages, 20+ cron jobs). Our ecosystem (km/pam/cloudi) has deeper structured storage (KNode + SQLite + FTS5), a richer TUI, and a more principled memory model (ENGRAM cognitive types), but gbrain is ahead on vector search, automatic enrichment, and MCP tooling. The recommended path: adopt gbrain's best patterns (RESOLVER.md, enrichment tiers, hybrid search, compiled-truth/timeline), integrate vector search into km's SQLite, and build the km MCP server — making km the queryable brain that pam, Claude Code, and any MCP client can use.

## The Landscape

### gbrain — Personal AI Knowledge System

**Architecture.** A three-layer system: (1) a markdown brain repo (git-tracked, human-editable), (2) a Postgres/PGLite retrieval layer with pgvector, and (3) AI agent skills that define the read-write loop. The repo is the system of record. gbrain indexes it into a 10-table Postgres schema (pages, content_chunks with 1536-dim embeddings, typed links, tags, timeline_entries, page_versions, raw_data sidecars, files, ingest_log, config). The agent reads the brain before every response and writes enriched pages after every conversation.

**Key design patterns:**

- **RESOLVER.md** — A numbered decision tree the agent walks before creating any page. Every directory has a README.md resolver answering "what goes here" and "what does NOT go here." MECE enforcement: one directory per knowledge domain, one file per entity. When two directories seem to fit, explicit disambiguation rules break the tie. When nothing fits, items go to `inbox/` — signaling the schema needs to evolve. The agent _must_ read the resolver before creating any new page.

- **Compiled truth + timeline** — Every page has two layers separated by `---`. Above the line: compiled truth (current best understanding, rewritten when new info arrives, starts with one-paragraph executive summary). Below the line: timeline (append-only, reverse-chronological evidence log with dates and sources). "If someone asks 'what's the current state?' — read above the line. If someone asks 'what happened?' — read below the line." This is pre-computed synthesis — unlike RAG, the cross-references and contradictions are already resolved.

- **Enrichment tiers** — Every signal that touches a person or company triggers enrichment. Three tiers by importance: Tier 1 (high-value entities, full API enrichment), Tier 2 (medium, partial enrichment), Tier 3 (low, basic page creation only). A 7-step enrichment protocol. The brain grows as a side effect of normal operations, not as a separate maintenance task.

- **Notability gate** — Before creating a page, the agent evaluates "is this worth writing down?" — preventing brain pollution from trivial mentions.

- **Source attribution** — Every fact needs a citation. Format and hierarchy are codified. Timeline entries include date, source, and what happened. The `.raw/` sidecars store original API responses for provenance.

- **Skillpack behavioral triggers** — The GBRAIN_SKILLPACK.md is a reference architecture with Always/Before/When/Never rules: "Before creating any brain page → read RESOLVER.md", "Before answering any question about people → search the brain first", "The enrich skill fires on every signal."

- **Dream cycle** — Nightly autonomous maintenance: entity sweep, citation fixes, memory consolidation. "I wake up and the brain is smarter than when I went to sleep."

- **Four database primitives** — Entity registry (canonical IDs + all aliases), event ledger (immutable signal stream), fact store (structured claims with provenance and confidence), relationship graph (typed edges between entities).

**Hybrid search.** Query → multi-query expansion (Claude Haiku) → parallel vector (HNSW cosine) + keyword (tsvector + ts_rank) → RRF fusion (score = sum(1/(60+rank))) → 4-layer dedup (best chunk per page, cosine similarity >0.85, type diversity 60% cap, per-page chunk cap) → stale alerts (compiled truth older than latest timeline) → results.

**Three chunking strategies:** Recursive (timeline, bulk import: 300-word chunks, 50-word overlap), Semantic (compiled truth: embed each sentence, Savitzky-Golay smoothing for topic boundaries), LLM-guided (high-value content: Claude Haiku identifies topic shifts).

**MCP exposure.** 30 tools via stdio: `get_page`, `put_page`, `search`, `query`, `add_link`, `traverse_graph`, `sync_brain`, `file_upload`, and 22 more. Generated from the same operation definitions as the CLI. Works with Claude Code, Cursor, Windsurf, Claude Desktop, OpenClaw, Perplexity.

**Entity model.** Fixed directory-based types: people/, companies/, deals/, meetings/, projects/, ideas/, concepts/, writing/, programs/, org/, civic/, media/, personal/, household/, hiring/, sources/. One file per entity, canonical slugs as IDs, aliases in frontmatter for deduplication. Merge protocol for discovered duplicates.

**Scale.** Real deployment: 14,700+ brain files, 3,000+ people with compiled dossiers, 13 years of calendar data, 280+ meeting transcripts, 300+ captured original ideas. 20+ cron jobs. PGLite for local (default), Supabase Pro ($25/mo) for production scale.

**Strengths:**

- Production-tested at serious scale (14,700+ files)
- Vector search + hybrid ranking is working and fast
- MCP server means any AI tool can query the brain immediately
- Automatic enrichment makes the brain grow without manual effort
- RESOLVER.md is an elegant solution to knowledge organization
- Compiled-truth/timeline is a powerful two-layer page model
- Dream cycle is genuine autonomous maintenance
- Voice integration ("Her" out of the box) demonstrates the vision

**Limitations:**

- Fixed entity types (people/companies/deals) — not flexible like KNode
- One-way import from markdown — no bidirectional sync
- No TUI — purely agent-operated, human reads raw markdown or queries via CLI
- Postgres dependency for vector search — heavier than SQLite
- No structured task management — deals/meetings but not kanban/todo
- No CRDT sync — single-device (Supabase adds remote, but not offline-first)
- Tightly coupled to OpenClaw/Hermes ecosystem
- Entity resolution is heuristic (grep for aliases) — no formal identity system

### gstack — AI-Powered Dev Workflow

**Architecture.** 23 Claude Code skills + 8 power tools organized as a sprint pipeline. Skills are markdown files injected as Claude Code slash commands. Each skill is a specialist persona (CEO, eng manager, designer, QA lead, security officer, release engineer). The sprint flow: Think → Plan → Build → Review → Test → Ship → Reflect. Each skill feeds into the next — `/office-hours` writes a design doc that `/plan-ceo-review` reads.

**Key design patterns:**

- **`benefits-from:` frontmatter** — Skills declare upstream dependencies. `/review` knows it benefits from the design doc that `/office-hours` produced.

- **`learnings.jsonl`** — Persistent cross-session learning store. The `/learn` command manages what gstack learned about your codebase. Learnings compound across sessions.

- **ETHOS.md** — Three principles: (1) "Boil the Lake" — AI makes the marginal cost of completeness near-zero, so always do the complete thing. (2) "Search Before Building" — three layers of knowledge (tried-and-true, new-and-popular, first-principles). (3) "User Sovereignty" — AI models recommend, users decide, always.

- **Context continuity via filesystem** — Design docs, test plans, review findings all persist as files. Each skill reads what came before. No context lost between sessions.

- **"No fixes without root cause"** — The `/investigate` skill auto-freezes to the module being investigated. Iron Law: no fixes without investigation.

- **Auto-inject recall** — Top 3 relevant learnings from `learnings.jsonl` injected into skill preambles.

- **Parallel sprints** — 10-15 Claude Code sessions running simultaneously via Conductor, each in its own workspace. The sprint structure is what makes parallelism work.

**Strengths:**

- Extremely productive — 600k+ lines in 60 days, 10-20k lines/day
- Well-structured sprint pipeline with clear handoffs between skills
- Cross-model second opinions (`/codex` gets OpenAI review alongside Claude)
- Real browser testing (`/qa` with Playwright)
- Safety guardrails on demand (`/careful`, `/freeze`, `/guard`)
- `learnings.jsonl` is a simple but effective cross-session memory
- Works across 8 AI agents, not just Claude Code

**Limitations:**

- Optimized for greenfield "vibe coding" — less applicable to careful refactoring
- 600k+ lines claim includes generated code/tests — net value per line is lower
- The "virtual team" metaphor stretches thin — each "specialist" is the same LLM
- No structured issue tracking (no beads equivalent)
- Parallel sprints require Conductor (proprietary)
- Skills are heavily opinionated about process — may conflict with existing workflows

### Our Ecosystem

**km — Knowledge Machine.** TUI workspace for agentic knowledge workers. TypeScript, Bun, Silvery (React TUI), SQLite. Layered architecture: App → Board → Tree → Storage → Parser → Filesystem. Bidirectional markdown sync — edits in the TUI write to markdown, edits to markdown files reflect in the TUI. KNode is a flexible universal entity (just a title, title+body, title+blob, or richly structured with task status, due dates, property links, arbitrary JSON metadata). FTS5 full-text search with a rich query language (field filters, date shortcuts, path matching, property queries). Content-addressed blob store. 55 Claude Code skills (being consolidated to ~12). Beads for issue tracking.

**pam — Personal Assistant Machine.** Multi-channel AI assistant with ENGRAM memory and CRDT sandboxing. The intelligence layer that operates on km's workspace. Four layers: L0 (MCP tools — expose km's API to any agent), L1 (agent artifacts as KNodes), L2 (shared brain — ENGRAM extraction/injection/query/cite), L3 (events + knowledge graph — triggers and typed links). Feb 2026 convergence decision: km = data layer, pam = intelligence layer. Currently Phase 0 (validation).

**cloudi — Claude AI Apps.** Chat CLI + autonomous Gmail bot. All state in Gmail (drafts, tasks, labels). The ENGRAM memory implementation lives here: SPO triples (subject/predicate/object) with cognitive types (fact/event/instruction), source tracking (Transcript vs Operation), bi-temporal model (transaction time + valid time), per-category retrieval (K=8 per type), ranking formula (0.5 confidence + 0.3 recency + 0.2 category match). Phase 1 in progress. Being wound down — value migrates to pam and km.

**The Feb 2026 convergence.** KM is the shared brain. PAM sits on top. cloudi and kimmi become inactive — their value (ENGRAM, Gmail connector, CRDT sync, blob store) lives on in PAM and KM. The core insight: same data, same history, same truth — the user works through the TUI, PAM works through tool_use.

## Comparison Matrix

| Capability                 | gbrain                                           | km/pam                                              | Gap / Assessment                                         |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| **Vector search**          | Postgres pgvector, HNSW cosine, 1536-dim         | FTS5 keyword only                                   | km needs sqlite-vss or external embeddings               |
| **Hybrid search**          | Vector + keyword + RRF + multi-query expansion   | FTS5 + rich query language                          | gbrain ahead on semantic; km ahead on structured queries |
| **MCP tools**              | 30 tools, working today                          | Planned (L0), not built                             | Build km MCP server — critical path                      |
| **Entity model**           | Fixed types (people/companies/deals/etc.)        | Flexible KNode (any structure)                      | KNode is more powerful and adaptable                     |
| **Markdown sync**          | One-way import (git → Postgres index)            | Bidirectional (TUI ↔ markdown)                      | km is significantly ahead                                |
| **TUI**                    | None — CLI + raw markdown                        | Silvery (rich kanban, cards, columns, tabs)         | km is way ahead                                          |
| **Local-first**            | PGLite (embedded WASM Postgres)                  | SQLite always                                       | Both local; km's SQLite is lighter                       |
| **Enrichment**             | Automatic on every signal, 3 tiers, dream cycle  | Planned (ENGRAM L2), not built                      | gbrain is significantly ahead                            |
| **Multi-channel**          | Voice (Twilio), email, Twitter, calendar recipes | pam design (WhatsApp, email, Slack)                 | gbrain has working integrations; pam has designs         |
| **Session memory**         | None (stateless agent)                           | `bun recall` + beads + `learnings.jsonl`-like       | km is ahead                                              |
| **Dev workflow**           | gstack (23 skills, sprint pipeline)              | 55 skills → ~12 (beads, TDD, /complete)             | Different approaches; both mature                        |
| **Knowledge organization** | RESOLVER.md + MECE directories                   | Folder/file tree with free nesting                  | RESOLVER.md is a pattern to adopt                        |
| **Page model**             | Compiled truth + timeline (two-layer)            | KNode (title + body + metadata)                     | Complementary — adoptable in km                          |
| **Task management**        | None (no kanban, no status tracking)             | Full (kanban boards, task status, priority)         | km is way ahead                                          |
| **Links/graph**            | Typed edges (knows, invested_in, works_at, etc.) | Wikilinks + backlinks + property links              | Both capable; gbrain has graph traversal queries         |
| **Deduplication**          | Alias-based grep + merge protocol                | Not formalized                                      | gbrain's approach worth studying                         |
| **Fact store**             | Claims with provenance and confidence            | ENGRAM SPO triples with confidence                  | Architecturally similar; cloudi's is more principled     |
| **Cognitive types**        | Not explicit (all facts are equal)               | ENGRAM: fact/event/instruction (31% retrieval gain) | km/pam is ahead — cognitive separation is critical       |
| **Chunking**               | 3 strategies (recursive, semantic, LLM-guided)   | Not applicable (KNodes are already structured)      | KNode structure may eliminate the need for chunking      |
| **Autonomous maintenance** | Dream cycle (nightly), 20+ cron jobs             | None built                                          | gbrain is ahead — adopt the pattern                      |
| **Scale (production)**     | 14,700+ files, 3,000+ people pages               | ~10k tasks (Asana migration target)                 | Both targeting similar scale                             |
| **Voice**                  | Working (Twilio + OpenAI Realtime)               | Not planned                                         | gbrain has unique capability                             |

## Ideas to Adopt

### From gbrain

1. **RESOLVER.md** — Mechanical MECE enforcement via a numbered decision tree. Every directory gets a README.md answering "what goes here" and "what does NOT go here." The agent reads the resolver before creating any page. This prevents the knowledge rot that kills every wiki. For km: create a RESOLVER.md pattern for vault organization — especially useful when PAM starts creating KNodes autonomously. The agent should know where things belong.

2. **Compiled-truth/timeline split** — Two zones per knowledge page. Above the line: current synthesis, rewritten as understanding evolves. Below the line: append-only evidence trail with dates and sources. For km: this maps naturally to KNode body (compiled truth) + a timeline section or linked child nodes (evidence). Could be a convention for people/company/concept pages in the vault, especially pages that PAM enriches.

3. **Enrichment tiers** — Scaled effort based on entity importance. Tier 1: full API enrichment for high-value entities. Tier 2: partial enrichment. Tier 3: basic page creation only. For km: when PAM builds ENGRAM extraction (L2), tiered enrichment prevents wasting API calls on trivial mentions while ensuring important entities get rich dossiers. The notability gate ("is this worth writing down?") is the entry filter.

4. **Notability gate** — Before extracting or creating, evaluate whether the information is worth persisting. This directly addresses ENGRAM's biggest risk (noise flooding the workspace). For km: implement as a confidence threshold in the extraction pipeline — only extract high-confidence, non-trivial statements. Aligns with PAM vision's "precision >= 80% or don't ship" criterion.

5. **Citation mandate** — Every fact traceable to its source. `[Source: session-id, date]` on every finding. `.raw/` sidecars store original API responses. For km: ENGRAM's `sourceRef` (pointing to Transcript or Operation) already does this at the data model level, but the UX pattern of visible citations in compiled truth is valuable. When PAM answers using KNodes, it should cite which ones — this is already in the PAM vision (L2 CITE mode).

6. **Skillpack behavioral triggers** — Always/Before/When/Never format for agent behavior. "Before answering any question about people → search the brain first." For km: codify similar rules in PAM's system prompt or MCP tool descriptions. The pattern of making rules structural (wired into the pipeline) rather than behavioral (depending on the agent remembering) is the key insight.

7. **Vector search + hybrid ranking (FTS5 + embeddings + RRF)** — gbrain's search pipeline is the 2026 best practice. Multi-query expansion catches phrasings you didn't think of. RRF fusion gets both semantic and exact matches right. For km: add sqlite-vss or an external embedding service to km's SQLite. Implement RRF to merge FTS5 results with vector similarity results. This is the critical gap for PAM L2 (context injection needs semantic search).

8. **Dream cycle / autonomous maintenance** — Nightly cron jobs: entity sweep, citation fixes, stale page detection, memory consolidation. For km: once PAM has MCP tools (L0), implement periodic maintenance — detect stale nodes, fix broken links, consolidate related fragments. This is what turns a static knowledge base into a living brain.

9. **Entity deduplication protocol** — Before creating any page, search existing pages by name (exact + fuzzy), search aliases, check `.raw/` sidecars. If match found → update, not create. For km: critical when PAM starts creating KNodes from conversations. People mentioned in different contexts ("Mike," "Mike Chen," "Mike from accounting") must resolve to the same entity.

### From gstack

1. **`benefits-from:` frontmatter** — Skills declare upstream dependencies. A skill can state which other skills should run first. For km: add this to our skill metadata — currently skills are independent, but some (like `/tdd`) benefit from `/pm` running first. Making dependencies explicit enables smarter auto-chaining.

2. **`learnings.jsonl`** — Persistent cross-session learning store. Simple JSONL file, each entry a lesson learned. Auto-injected into skill preambles (top 3 relevant). For km: `bun recall` already provides session search, but a curated lessons file (more signal, less noise) is complementary. Could be a bead attachment or a dedicated KNode.

3. **Auto-inject recall into skill preambles** — Before any skill runs, inject the top 3 relevant learnings. For km: modify skill loading to query `bun recall` and inject relevant context. This is essentially what PAM's L2 READ mode does — proactive context injection. Implementing it for skills first is a low-risk prototype.

4. **"No fixes without root cause" guardrail** — `/investigate` enforces this as an Iron Law. Auto-freezes to the module being investigated. For km: our `/troubleshoot` and `/tdd` skills already encode "reproduce first, fix second," but the auto-freeze pattern (restricting edits to the investigation scope) is worth adopting.

5. **Context continuity via filesystem artifacts** — Design docs, test plans, review findings all persist as files. Each skill reads what came before. For km: beads already provide this, but the pattern of each skill explicitly reading predecessor artifacts (not just relying on context window) is more robust for long workflows.

6. **Sprint pipeline structure** — Think → Plan → Build → Review → Test → Ship → Reflect, with each step feeding the next. For km: our workflow is less structured (claim bead → code → test → commit → close bead). A more explicit pipeline with review gates could improve quality, especially for larger features.

### From Garry Tan's philosophy

- **"No one-off work"** — Every repeated task becomes a skill on a cron. If you do it twice, automate it. For km: audit our manual workflows and identify candidates for automation. The dream cycle pattern (maintenance as cron) is the prime example.

- **"Asked twice = failed"** — First time is discovery, second time should be automated. For km: when the user asks a question the second time, the system should already have the answer cached or a skill to generate it.

- **MECE skills** — Each work type has exactly one owner. No overlapping responsibilities. For km: our skill consolidation (55 → ~12) aligns with this. Each skill should have a clear, non-overlapping domain.

- **"Boil the Lake"** — AI makes completeness cheap. Always do the complete thing. "Ship the shortcut" is legacy thinking. For km: when implementing features, don't defer tests, edge cases, or docs. The marginal cost of completeness is near-zero with AI assistance.

- **"Search Before Building"** — Three layers of knowledge: tried-and-true, new-and-popular, first-principles. For km: our `/fresh` and `/deep` skills already encourage external research before coding. The three-layer framing is a useful mental model.

- **"User Sovereignty"** — AI recommends, users decide. Two AI models agreeing is signal, not proof. For km: already embedded in PAM's design (changeset approval, human always wins), but worth keeping as an explicit principle.

## The Evergreen + Changelog Pattern

gbrain's compiled-truth/timeline pattern is the most immediately adoptable idea. It maps cleanly to the km/pam ecosystem:

**The pattern:** Above the `---` separator: compiled truth (current best understanding, rewritten as new evidence changes the picture). Below: timeline (append-only evidence trail, never edited, only added to). The synthesis is pre-computed — unlike RAG, where the LLM re-derives knowledge from scratch every query.

**Mapping to km/pam:**

- **Obsidian dailies with [[date]] backlinks as the timeline layer.** Daily notes are already append-only evidence. The date backlinks create navigable trails.

- **ENGRAM memory extraction as the enrichment mechanism.** When PAM extracts facts from conversations, it updates the compiled truth (KNode body) and appends to the timeline (child nodes or a timeline section). The extraction pipeline is the automatic enrichment that keeps pages current.

- **KNodes as the compiled truth layer.** A person KNode's body is the compiled truth — current best understanding, rewritten by PAM when new information arrives. Child nodes or linked evidence nodes are the timeline. The KNode data field (JSON metadata) stores structured facts with provenance.

**Implementation sketch:**

```
KNode: "Mike Chen"
├── body: compiled truth (current synthesis, PAM rewrites)
├── data: { role: "CTO", company: "Acme", last_contact: "2026-03-15" }
├── child: "2026-03-15: Coffee at Blue Bottle — discussed Q2 roadmap"
├── child: "2026-02-20: Intro'd to Sarah Kim, potential advisor"
├── child: "2026-01-10: Met at YC Winter batch demo day"
└── links: [[Acme Corp]], [[Sarah Kim]], [[Q2 Roadmap]]
```

This is how gbrain pages already work, but with fixed markdown files. KNodes make it more powerful: structured queries, property links, task integration, and a TUI that shows the compiled truth prominently while the timeline is accessible via drill-down.

## Recommended Path

### Phase A: Trial gbrain directly (1-2 weeks)

Install gbrain in `~vault` (the Obsidian vault) as a retrieval layer over existing markdown. Learn from using it:

- Run `gbrain init` (PGLite, zero config)
- Import vault: `gbrain import ~/Bear/Journal/`
- Use `gbrain query` for a week alongside km's FTS5
- Set up 2-3 cron jobs (sync, embed --stale, basic dream cycle)
- Track: what queries work well? What's missing? What's annoying?

**Success criteria:** gbrain finds things that FTS5 misses (semantic matches). The enrichment loop feels valuable. The RESOLVER.md pattern helps organize the vault.

### Phase B: Adopt patterns into km workflow (1-2 weeks)

Integrate the best ideas from gbrain and gstack into km's existing infrastructure, independent of any code changes:

- **RESOLVER.md for vault structure** — Create a RESOLVER.md in the vault root with MECE filing rules. Add README.md resolvers to key directories (people/, projects/, reference/).
- **Behavioral triggers in skill preambles** — Add Always/Before/When rules to km skills. "Before answering questions about people → `bun recall` first."
- **`benefits-from:` in skill metadata** — Skills declare which other skills should run first.
- **Auto-inject recall** — Modify skill loading to inject top 3 relevant `bun recall` results.
- **Compiled-truth/timeline convention** — Document the pattern for person/company/concept KNodes. PAM should follow this convention when it starts creating nodes.

### Phase C: Add vector search to km's SQLite (weeks)

The critical technical gap. Phased approach:

1. **Evaluate sqlite-vss vs external service.** sqlite-vss is a SQLite extension for vector similarity search. Alternatively, use an external embedding service (OpenAI text-embedding-3-large) with results stored in SQLite.
2. **Add an embeddings table** to km's SQLite schema. Content hash for idempotency (same pattern as gbrain's import).
3. **Implement RRF fusion** — merge FTS5 results with vector similarity results. Score = sum(1/(60+rank)) for each source.
4. **Expose via `bun recall`** — hybrid search replaces keyword-only recall.
5. **Add multi-query expansion** (optional, uses Claude Haiku) — catches phrasings you didn't think of.

This is independent of PAM — km gets better search regardless of whether the intelligence layer ships.

### Phase D: Build the km MCP server (weeks)

The entry point for all agent integration. Expose km's API as MCP tools:

- `km.query` — structured queries on KNodes (tasks, contacts, events)
- `km.search` — hybrid search (FTS5 + vector if Phase C is done)
- `km.create` / `km.update` / `km.delete` — CRUD on workspace entities
- `km.get` — read a specific KNode by path or ID
- `km.links` — wikilink/backlink/property link traversal

This is PAM L0. Claude Code + km MCP tools is immediately useful. Any MCP client (Cursor, Claude Desktop, OpenClaw) gets workspace access.

### Phase E: Evaluate gbrain + pam convergence (after 2-week trial)

After using gbrain (Phase A) and having km's MCP server (Phase D), evaluate:

1. **What queries work well in gbrain vs km's FTS5?** — Quantify the semantic search advantage. If gbrain finds 30%+ more relevant results, vector search is critical path.
2. **What's missing from gbrain that km provides?** — Task management, bidirectional sync, structured queries, TUI. If these matter daily, km remains the primary workspace.
3. **What PAM L0 needs that gbrain already provides?** — MCP tools, enrichment pipeline, entity detection, dream cycle. Which should we build vs adopt?
4. **Build-vs-integrate decision for vector search.** sqlite-vss (lighter, local) vs PGLite (heavier, more capable) vs Supabase (managed, scalable). For a personal tool, sqlite-vss is likely sufficient.
5. **Does gbrain's entity model map to KNode, or is it too rigid?** — gbrain's fixed types (people/companies/deals) vs KNode's flexible structure. If KNode can represent everything gbrain pages do (it can), then km's model is strictly more expressive.

### Long-term: kbrain = km's storage + vector search + MCP

Not a separate product. Not a fork of gbrain. The convergence point:

- **km's SQLite** gets vector search (Phase C) — becoming a local-first alternative to gbrain's Postgres
- **km's MCP server** (Phase D) exposes the workspace to any AI tool — same role as gbrain's 30 MCP tools
- **PAM's ENGRAM** provides cognitive-type extraction (fact/event/instruction) — more principled than gbrain's "compiled truth rewrites"
- **km's KNode** is the entity model — flexible enough to represent people, companies, deals, meetings, ideas, tasks, and anything else
- **PAM's enrichment pipeline** (L2) fires on every conversation — same pattern as gbrain's enrichment, but writing to KNodes instead of markdown files
- **Autonomous maintenance** via PAM (L3) — triggers on KNode mutations, periodic health checks — same role as gbrain's dream cycle

The result: km becomes queryable by any AI tool. PAM operates on km's data. The brain is KNodes in SQLite with hybrid search, not markdown in Postgres. The TUI is the human interface. MCP is the agent interface. Everything gbrain does, km does — plus structured editing, bidirectional sync, task management, and a rich TUI.

This is PAM L0 + L1 + parts of L2. It doesn't require the full PAM vision to be useful.

## Key Differences in Philosophy

| Dimension              | gbrain/gstack                                 | km/pam                                                     |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| **Data model**         | Markdown files → Postgres index               | SQLite with bidirectional markdown sync                    |
| **Entity flexibility** | Fixed types, directory-per-domain             | Flexible KNode, any structure                              |
| **Search**             | Hybrid (vector + keyword + RRF)               | FTS5 + rich query language (vector planned)                |
| **Agent integration**  | MCP-first, agent-operated                     | TUI-first, agent integration planned                       |
| **Memory model**       | Compiled truth rewrites (latest wins)         | ENGRAM SPO triples with cognitive types                    |
| **Enrichment**         | Automatic on every signal, tiers, dream cycle | Planned (ENGRAM L2), not yet built                         |
| **Human interface**    | Raw markdown + CLI                            | Rich TUI (kanban, cards, columns, tabs)                    |
| **Task management**    | None                                          | Full (kanban boards, task status, priority)                |
| **Dev workflow**       | Sprint pipeline (23 skills, parallel sprints) | Issue-driven (beads, TDD, /complete)                       |
| **Scale ambition**     | Personal brain for a CEO                      | Personal workspace for knowledge workers                   |
| **Philosophy**         | "Boil the lake" — completeness is cheap       | "Correctness > maintainability > simplicity > performance" |
| **Openness**           | MIT license, designed for sharing             | Personal tool first, product maybe later                   |

## Links

- PAM vision: `~/Code/pim/pam/docs/vision.md`
- PAM architecture decision: `~/Code/pim/pam/docs/architecture-decision.md`
- cloudi ENGRAM spec: `~/Code/pim/cloudi/specs/active/ADR01/E01-memory.md`
- cloudi memory research: `~/Code/pim/cloudi/BACKLOG.md` (ADR23)
- gbrain: https://github.com/garrytan/gbrain
- gstack: https://github.com/garrytan/gstack
- gstack ETHOS.md: https://github.com/garrytan/gstack/blob/main/ETHOS.md
- gbrain skillpack: https://github.com/garrytan/gbrain/blob/main/docs/GBRAIN_SKILLPACK.md
- gbrain recommended schema: https://github.com/garrytan/gbrain/blob/main/docs/GBRAIN_RECOMMENDED_SCHEMA.md
