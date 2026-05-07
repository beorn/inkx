# Agent-host authoring: build silvery-native agent hosts from the ground up

**Goal**: use the building blocks to *author* our own **agent hosts** (user-facing products) that are structurally better than alt-screen-byte-stream peers. Not a replacement for Anthropic/OpenAI's agents — a complement, focused on what we can do that existing hosts (Cline, opencode, Claude Code) can't easily.

**Terminology** (see README § Terminology): this doc is about building new **agent hosts** — products the user opens. Each host contains an **orchestrator** (multi-agent coordination — 07, 08) and N **agent harnesses** (one per agent — 02); each harness invokes an **agent** (LLM + tool loop).

**Why this deserves its own track**: the harness track (02) is about infrastructure for any agent host to reuse. This track is about a specific product built on that infrastructure. Different concern, different competitive landscape (competing with Cline, opencode, Cursor, Claude Code — not with Anthropic/OpenAI's models).

## What "silvery-native agent" means

A coding agent whose UI is assembled from silvery components and whose IO is typed end-to-end. Categorically different from running `curl claude.ai | bash` and printing responses to a byte-stream terminal.

### Core properties

- **Rich UI components** — blocks, forms, hover-docs, mouse-click actions, inline editors. Not just text.
- **Scrollback-first by default** — output lives in the real terminal's scrollback, not in an alt-screen buffer that disappears on quit. Transient affordances (palette, completion, help popups) use floating silvery overlays that erase on dismiss.
- **CAP-native tool use** — the agent's "tools" are typed CAP calls, not string commands. Typed input, typed output, explicit permissions.
- **Tape-recorded turns** — every user turn, LLM turn, tool call is a .tape entry. Replayable. Diffable. Regression-testable.
- **Tribe-coordinated by default** — multi-agent is the default, not the special case. One process, N peer agent sessions, typed messages between them.
- **Human peers** — humans can join any agent session, take over, hand back. Not a "review the agent's work after it's done" flow — live collaboration.
- **km-as-memory** — long-term context lives in km (the user's knowledge graph). Agent sessions are ephemeral; insights commit to km.
- **Typed personas** — planner, coder, reviewer, tester are separate sessions (not roles inside one monolith); they communicate via typed pipes. Composition over inheritance.

## Where this is categorically better

### Against Claude Code

- Claude Code owns the full screen (alt-screen); exit returns to bare terminal. Ours lives in scrollback; history is browsable after exit.
- Claude Code's "permission prompt" is a modal text box. Ours is a typed UI — list of files with diff preview, mouse-click to approve/deny per-file, keyboard-complete.
- Claude Code spawns sub-agents opaquely (Agent tool). Ours are peer sessions in `jobs`, steerable mid-flight, cancellable independently.
- Claude Code's context is session-local. Ours layers km for cross-session memory.

### Against aider

- aider is a REPL over git. Ours is a structured blocklist with saveable workflows.
- aider's context is the chat transcript. Ours is the block tree (structured, queryable).
- aider can't run multiple agents in parallel. Ours can.

### Against web-based agents (Copilot chat, Cursor)

- They live in an IDE; we live in the terminal + wherever silvery renders. Usable over SSH without port-forwarding.
- They can't compose with system tools cleanly. Ours composes with every CAP-speaking tool.
- They're opaque monoliths. Ours is a composition of silvery components, each replaceable.

## Product surface candidates

Not decisions, surface areas to prototype:

### 1. `silvery-coder` — a single-shot coding agent

One session, one task. Uses CAP tool calls for everything: `fs.read`, `fs.write`, `sh.run`, `git.diff`, `test.run`. Block output is typed (file tree, diff, test results). Scrollback-first: the whole conversation + tool calls stay in the shell history.

MVP: one week atop the substrate.

### 2. `silvery-team` — multi-agent coding sessions

Planner session spawns coder, reviewer, tester as peer sessions. Each is a separate `silvery-coder` instance connected via tribe bus. Human joins any session, observes all sessions. `jobs` shows all three; `fg reviewer` attaches you to the reviewer's pane.

This is where the sessions model (see [07-sessions.md](07-sessions.md)) pays off.

### 3. `silvery-pair` — live collaborative human↔agent coding

Human and agent share one session, real-time. Agent suggests edits as proposed-block; human accepts/rejects inline. Tribe bus handles cursor presence (who's typing where). Feels like pair-programming over SSH, but agent is one of the peers.

### 4. `silvery-ops` — agent for running system tasks

Constrained agent with CAP permissions scoped to ops work (system monitoring, log analysis, deploy triggers). Never gets fs-write unless explicit. Gated to run only in a designated workspace (see [big-ideas.md](big-ideas.md) — session workspaces).

### 5. `silvery-agent-kit` — the authoring SDK

The components + patterns above, packaged as a framework. Anyone can author a silvery-native TUI agent in ~1000 LOC. Shipped as `@silvery/agent-kit`. This is the "make this easy" leverage.

## Why we can do this and others can't (easily)

- **We own vterm** — we can emit/consume every OSC marker perfectly; no fighting shell integration
- **We own silvery** — rich UI components are cheap; byte-stream tools are not
- **We own tribe + recall** — multi-agent coordination + memory are already solved upstream
- **We own tape** — every agent run is replayable; test suite of "run prompt X on codebase Y" is trivial
- **We own CAP** (once it exists) — typed tool use instead of string parsing; the alignment win
- **We own km** — long-term memory is not a "vector DB" bolt-on; it's a user-owned knowledge graph

Anthropic/OpenAI have the models. We have the substrate. We're not competing on intelligence; we're competing on affordances.

## Relation to integration track

The two tracks share substrate. A silvery-native agent (authoring) IS also a CAP-speaking TUI that a meta-agent (integration) can wrap. Dogfooding: silvery-team wraps silvery-coder wraps silvery-agent-kit.

## Constraints & risks

- **Model access** — we need strong coding LLMs. Anthropic/OpenAI API is fine, but alignment with their agent products matters (don't compete directly on the same positioning).
- **Costs** — running N peer agents multiplies tokens. Need good budget enforcement (see [big-ideas.md](big-ideas.md) — contracts for long-running agents).
- **Adoption** — Claude Code has brand + distribution. Ours needs a clear wedge. Scrollback-first + multi-agent + replayable are candidates.
- **Focus** — this track is its own product. Don't let it sprawl into competing with Claude Code on general coding. Pick a niche (long-session refactors? multi-agent planning? collaborative pair-coding?) and own it.

## Phases

- **Phase 0** — prereqs land (substrate, CAP v0, commander Phase 1). ~3-4 months.
- **Phase 1** — `silvery-coder` single-shot. ~1 week atop prereqs.
- **Phase 2** — tape + tribe hookup, replayable runs. ~2 weeks.
- **Phase 3** — `silvery-team` multi-agent. Depends on sessions (L4). ~3 weeks.
- **Phase 4** — `@silvery/agent-kit` packaged. ~2 weeks.
- **Phase 5+** — specialized agents (ops, pair, etc.) on the kit.

## Open questions

- **Distribution**: standalone binary, silvery plugin, or hosted?
- **Licensing**: OSS framework + proprietary hosted? OSS everything?
- **Branding**: avoid claiming to be "the agent"; frame as "the authoring kit for domain-specific agents"?
- **Fit with km**: does km eventually become the "agent desktop" (kanban of agent sessions + knowledge layer + authoring IDE)?

No answers yet. Revisit after substrate lands.

