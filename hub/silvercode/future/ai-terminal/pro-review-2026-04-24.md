<!-- llm-meta: {"session":"6443387f","timestamp":"2026-04-24T07:01:44.342Z","query":"Review this speculative brainstorming document on 'AI-era terminal tooling built on silvery's terminal building blocks.' It's 8 layered design docs + a /big lens addition doc + a feasibility doc, orga","tokens":253271} -->

## 1. Overview / summary

**Short version:** the thesis is real, but the current plan is too wide. The strongest wedge is **not** “build a better shell” and probably not even “build a better tmux.” It is:

> **a local-first agent workspace** that can run existing coding agents in structured mode by default, normalize all activity into one session/event model, replay and search everything, and gate risky actions with explicit policy.

That wedge is now more urgent because the market moved fast in 2025–2026: Claude Code already exposes headless/structured output, local JSONL sessions, hooks, statusline JSON, checkpointing, subagents, and experimental agent teams; Codex now exposes CLI/app/server/SDK/MCP/non-interactive paths and cloud tasks; Warp now has local/cloud agents and a split terminal-vs-agent modality; cmux launched in February 2026 with a socket API aimed directly at multi-agent terminal workflows. In parallel, MCP is broadly supported and A2A/ACP are hardening the “agents talk to tools / agents” layer. ([code.claude.com](https://code.claude.com/docs/en/headless))

So my headline judgment is:

- **The thesis is credible.**
- **The current scope is not.**
- **The minimum proof should be an agent workstation, not a public protocol and not a login-shell replacement.**

A good reframing is: **one platform thesis wearing six product costumes**. Collapse it.

---

## My ranked concerns (P0–P3)

### **P0**
1. **Product overbreadth / sequencing risk**  
   `@silvery/pty` + mux + CAP + commander + sessions + agent authoring is too much surface to learn from at once. The biggest danger is not technical impossibility; it is building six half-products that never become a daily driver.

2. **CAP adoption / network-effect risk**  
   CAP is strategically the riskiest part. A protocol without high-quality manifests, trust, and incentives is dead-on-arrival. Community registry + `cap-wrap` scraping `--help` is **not enough**.

3. **Security/privacy model is underdeveloped relative to ambition**  
   The `/big` lens correctly elevates permissions, but it underweights **secret spillage, transcript indexing, manifest trust/provenance, and protocol-level confused-deputy / session-hijack style attacks**. MCP’s own security guidance is already deep here; CAP/sessions need an equivalent threat model. ([modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices))

4. **Competitive novelty window is shrinking**  
   Claude Code experimental agent teams, Codex app/server/cloud tasks, Warp local+cloud agents, cmux socket control, Zellij remote/web/json/scriptability, WezTerm/kitty/iTerm2 APIs: the world is converging on “terminal + agent + programmable control plane.” Your combination is still distinctive, but “nobody else has this stack” is overstated now. ([code.claude.com](https://code.claude.com/docs/en/agent-teams))

### **P1**
5. **The hidden missing primitive is not just PTY; it is a canonical session/event log.**
6. **PTY correctness tax is larger than the docs imply**: process groups, job control, alt-screen fidelity, Unicode width drift, IME/composition, OSC side effects, backpressure.
7. **Commander/shell replacement is a scope trap.**
8. **Public-standard CAP is likely premature; internal IR first is safer.**

### **P2**
9. **Daemon persistence semantics are underspecified** (attach/detach, crash recovery, idle-quit, ownership).
10. **Multi-client / collaborative semantics are underspecified** (cursor ownership, conflict handling, permissions).
11. **Windows and browser portability are likely later than the docs imply.**
12. **Replay determinism will need explicit boundaries around non-deterministic effects.**

### **P3**
13. Naming / packaging / OSS stance.
14. Exact transport choices for CAP and multiplex RPC.

---

## 2. Key details and facts / direct answers to the 8 questions

### 1) **Blockers you missed**

#### A. **“One missing primitive” is too optimistic**
In `01-building-blocks.md`, “Exactly one primitive” is rhetorically useful, but architecturally false. PTY is necessary; it is not sufficient.

The other hidden atom is a **canonical event model** that can unify:
- PTY byte streams / grid deltas
- shell semantic markers (OSC 7/8/52/133/633 etc.)
- structured agent streams (`stream-json`, hooks, statusline JSON, JSONL transcripts)
- typed CAP blocks
- session-control / policy / replay events

Without that, you will end up with **four incompatible data planes**.

#### B. **Process-group / job-control semantics**
Your docs talk about PTY wrapping, but the tricky PTY-adjacent blocker is really **controlling-terminal behavior**, process groups, and foreground/background semantics. If you want to host shells, pagers, vim, nested tmux, or agent-spawned TUIs cleanly, the kernel TTY/job-control model still matters. This is especially important because `07-sessions.md` wants to generalize Unix job control rather than merely skin it.

#### C. **Secret hygiene**
`bearly/recall` + transcript indexing + `.tape` replay + multi-agent logs is valuable, but it is also a **secret vacuum** unless you add:
- automatic redaction hooks,
- secret scanning,
- encrypted-at-rest logs,
- “never index this” scopes,
- per-workspace retention policies.

This is a likely **enterprise deal-breaker** if left late.

#### D. **Manifest trust / provenance**
A CAP registry becomes a software supply chain. You need:
- version pinning,
- maintainer verification,
- signing/provenance,
- trust scoring,
- “official vs community” distinction,
- sandbox implications attached to manifests.

MCP security guidance is already warning about authorization, token passthrough, SSRF, session hijacking, and least-privilege scope design. CAP and session buses will inherit the same class of problems. ([modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices))

#### E. **Daemon semantics**
`04-multiplex.md` suggests piggybacking on the bearly daemon. Reasonable, but note the mismatch: a daemon that owns long-lived detached PTYs cannot keep an **“idle quit after 30m”** mental model without more explicit lifecycle states. Detached sessions are not “idle” in the same sense as a coordination bus.

---

### 2) **Dimensions you didn’t think about / prior art you should consider**

#### A. **Standards collision**
The docs sometimes position CAP as if it can become the main external standard. That is risky. MCP already has broad support across clients/servers; A2A is moving as the agent-to-agent layer; IBM is pushing ACP for interoperable agent communication. CAP should probably become a **local command manifest / UI schema layer** that can project into MCP/A2A/ACP, not a parallel empire. ([docs.anthropic.com](https://docs.anthropic.com/en/docs/mcp))

#### B. **Shell metadata already exists in fragments**
You are treating `cap-wrap --help` scraping as the starting point. That should be the **lowest-quality fallback**, not the main ingestion path. Existing sources include:
- shell completion generators from common CLI frameworks like Cobra,
- framework-aware spec generation (Fig/withfig),
- package-manager metadata,
- OpenAPI/GraphQL for API CLIs,
- existing MCP servers for tool exposure. ([cobra.dev](https://cobra.dev/docs/how-to-guides/shell-completion/))

#### C. **Terminal-as-API prior art is richer than the docs imply**
You should explicitly study:
- **tmux control mode** (notifications, subscriptions, pane output, flow control), ([github.com](https://github.com/tmux/tmux/wiki/Control-Mode))
- **Zellij** (remote attach over HTTPS, JSON state queries, live output streaming, web client), ([zellij.dev](https://zellij.dev/features/))
- **WezTerm** (mux domains, pane text APIs, CLI send/get text, semantic zones), ([wezterm.org](https://wezterm.org/multiplexing.html))
- **kitty** remote control via socket, ([sw.kovidgoyal.net](https://sw.kovidgoyal.net/kitty//remote-control/))
- **iTerm2** tmux integration + Python API. ([iterm2.com](https://iterm2.com/3.3/documentation-tmux-integration.html))

#### D. **Cross-target UI prior art exists**
Your cross-target React-shape is still distinctive, but Textual already demonstrates meaningful terminal→web code reuse. That means the “same tree goes to web too” story is not unique enough to be the wedge by itself. ([textualize.io](https://www.textualize.io/))

#### E. **Typed shell prior art exists**
Nushell already proves users value typed/structured data pipelines, but it also proves how hard it is to displace the incumbent shell. That’s a strong signal to **defer shell replacement as a go-to-market wedge**. ([nushell.sh](https://www.nushell.sh/))

---

### 3) **Sequencing critique**

Your own `feasibility.md` is directionally right, but I would sequence even harder.

## Recommended sequence

### **Phase 0 — Session/event substrate**
Do **not** start with commander. Start with:
- `@silvery/pty`
- one canonical event envelope
- one persisted session store
- one `PtyPane`
- one replay format for both PTY and structured runs

This is the real substrate.

### **Phase 1 — Agent workstation MVP**
Target **Claude Code first**, using:
- `claude --bare -p ... --output-format stream-json` for live runs,
- local JSONL session files for history/resume/fork,
- hooks/statusline JSON for permission/idle/status enrichment. Anthropic now explicitly recommends `--bare` for scripted calls and says it will likely become the default for `-p`; that is a huge validation of your “non-interactive first” realization. ([code.claude.com](https://code.claude.com/docs/en/headless))

### **Phase 2 — Multi-session UI**
Add:
- panes/splits/tabs,
- attach/detach,
- session tree,
- task routing,
- permission inbox,
- replay/search.

At this point you have a real product.

### **Phase 3 — Second integration**
Add Codex. Because OpenAI is already platformizing aggressively (CLI, SDK, app server, MCP server, subagents, cloud tasks), supporting Codex early matters strategically. ([help.openai.com](https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started))

### **Phase 4 — Internal CAP, not public CAP**
Dogfood CAP on your own tools (`km`, `bd`, maybe one or two wrappers). Don’t go public-standard yet.

### **Phase 5 — Authoring track**
Build one silvery-native agent only after the workstation proves daily value.

### **Phase 6 — Commander**
Only if users clearly want the shell itself to be replaced. Otherwise keep commander as a component inside the workstation, not a standalone thesis.

---

### 4) **Scope sanity-check / minimum viable product**

Yes: **collapse the 6 tracks to 2–3.**

## Suggested collapse

### **Track A — Runtime substrate**
Merge:
- 01 building-blocks
- 04 multiplex
- 07 sessions

This becomes: **session runtime**.

### **Track B — Agent workspace**
Mostly 02, plus a very small slice of 06.

This becomes: **the product**.

### **Track C — Platform / protocol**
05 CAP + 03 authoring.

This becomes: **later leverage**, not MVP.

## Minimum viable product that proves the thesis

A believable MVP is:

- 2–4 Claude Code sessions in one silvery workspace
- default live mode = `--bare -p --output-format stream-json`
- local transcript tail / resume / fork
- permission inbox
- worktree-aware session cards
- replayable session logs
- search over prior sessions
- one “handoff” action from one session to another

That proves:
- structured ingestion,
- multi-agent session UX,
- replay,
- policy gating,
- and your layout stack.

It does **not** require CAP, a shell, or agent authoring.

If you need a one-line answer: **drop “super-shell” from MVP**.

---

### 5) **CAP adoption strategy — is cap-wrap + community registry enough?**

**No.** Helpful, not sufficient.

## What I would do instead

### A. Treat CAP first as an **internal manifest IR**
Don’t begin as “a new protocol the world must adopt.” Begin as:
- local manifest format,
- block schema,
- permission declaration,
- completion schema,
- projection targets: shell UI, MCP tool schema, docs page, telemetry, maybe A2A/ACP later.

### B. Ingest from many sources
Bootstrap quality from:
1. framework-generated completion/spec metadata,
2. Fig/withfig-style specs,
3. `--help`,
4. OpenAPI / GraphQL / SDK schemas,
5. hand-curated manifests. ([fig.io](https://fig.io/docs/guides/integrating/getting-started))

### C. Give upstream authors immediate payoff
A tool author maintains CAP only if one manifest yields **multiple wins**:
- richer shell completion,
- docs page,
- safer permission prompts,
- MCP tool export,
- agent UI,
- better telemetry / analytics.

### D. Add trust/governance from day one
Registry needs:
- maintainer verification,
- signature/provenance,
- package-version binding,
- permission audit UI,
- “official / community / heuristic” labels.

### E. Local-first before registry-first
For private tools, users should be able to:
- generate local manifests,
- override them locally,
- never publish.

A registry is essential later, but **local private manifests** are what make enterprise/internal adoption real.

### F. Don’t oversell “manifest doubles as MCP tool schema”
It’s **close**, but not exact. MCP tools are request/response-oriented; CAP also wants process lifecycle, streams, resumability, permissions, UI rendering, and completions. Think **projection**, not identity.

---

### 6) **Agent integration via non-interactive modes vs PTY wrapping**

**Yes, your recent realization is mostly right.** For Claude specifically, it is more than a hunch now.

Anthropic officially supports non-interactive `-p`, JSON and `stream-json` output, structured JSON-schema output, `--continue`/`--resume`, and recommends `--bare` for scripts/CI/programmatic usage. Claude also persists sessions locally as JSONL under `~/.claude/projects/<encoded-cwd>/*.jsonl`, exposes hooks, and can feed JSON session data to a statusline command. ([code.claude.com](https://code.claude.com/docs/en/headless))

So for Claude, your integration ladder should be:

1. **Structured mode** (`--bare -p --output-format stream-json`)  
2. **Transcript tail / session APIs** for history/resume/fork  
3. **Hooks/statusline JSON** for enrichment  
4. **PTY/TUI wrap** only when you truly need native interactive preservation

## The gotchas

- **Human takeover of exact TUI state still needs PTY.**
- **Some interactive affordances may exist only in TUI mode.**
- **Vendor schemas can drift.**  
- **JSONL/session files are local-host scoped**; Anthropic explicitly notes resume across hosts requires moving the session file or reconstructing state manually. ([docs.anthropic.com](https://docs.anthropic.com/id/docs/claude-code/sdk/sdk-sessions))
- **If you don’t use `--bare`, local hooks/plugins/MCP/skills can contaminate determinism.** ([code.claude.com](https://code.claude.com/docs/en/headless))

So: **structured mode should be the default, PTY the fallback, hybrid the debug path.** `02-agent-integration.md` should be updated from “Mode A primary choice” to “Mode A is the product path; Mode C is compatibility mode.”

---

### 7) **Competitive landscape — who to watch and what kills you if they ship first**

## Direct competitors / adjacent threats

### **Anthropic Claude Code**
Biggest immediate threat on the sessions side. Claude now has subagents, experimental agent teams, checkpointing, local JSONL sessions, hooks, and structured headless mode. If Anthropic stabilizes teams, adds better replay/oversight, or ships a control-plane/app-server story, a large piece of your integration wedge compresses. ([code.claude.com](https://code.claude.com/docs/en/agent-teams))

### **OpenAI Codex**
Probably the biggest strategic threat overall. Codex is already a CLI/app/platform story with subagents, cloud tasks, workflows, SDK/app server/MCP server, non-interactive mode, and broad “use Codex to build X” positioning. If the Codex app/server becomes the standard harness, your agent-workspace wedge narrows unless your local-first UX/policy/replay is clearly superior. ([help.openai.com](https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started))

### **Warp**
Warp already owns blocks, local/cloud agents, and agent modality. If they improve multi-agent oversight and make cloud/local handoff smoother, they can erase much of the “terminal with agent-native UX” novelty. ([warp.dev](https://www.warp.dev/blog/how-warp-works))

### **cmux**
You called them out, correctly. They are very close to your agent-multiplexer wedge: native terminal app, AI-agent positioning, socket API, notifications. If they move cross-platform and deepen programmatic/state APIs, they become much more serious. ([cmux.com](https://cmux.com/blog/introducing-cmux))

### **Zellij / WezTerm / kitty / iTerm2**
These are not AI-first, but they already have serious pieces of the control substrate:
- Zellij: web client, HTTPS remote attach, JSON state queries, output subscriptions. ([zellij.dev](https://zellij.dev/features/))
- WezTerm: mux domains, pane APIs, CLI control. ([wezterm.org](https://wezterm.org/multiplexing.html))
- kitty: socket-based remote control. ([sw.kovidgoyal.net](https://sw.kovidgoyal.net/kitty//remote-control/))
- iTerm2: tmux integration and Python API. ([iterm2.com](https://iterm2.com/3.3/documentation-tmux-integration.html))

## Protocol / ecosystem threats

### **MCP**
If MCP continues to absorb “tool metadata + UI affordances + auth + safety” territory, CAP as a separate public protocol becomes harder to justify. MCP already has broad ecosystem support and formal security guidance. ([docs.anthropic.com](https://docs.anthropic.com/en/docs/mcp))

### **A2A / ACP**
If cross-agent workflows standardize around A2A or ACP, your session bus should align with them, not compete with them. ([cloud.google.com](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade/))

## What kills you if they ship first?
- Anthropic stabilizes agent teams + replay + permissions.
- OpenAI makes Codex app server the default third-party harness.
- Warp/cmux/Zellij own “multi-agent terminal control plane.”
- MCP/A2A/ACP win the standards slot before CAP has adoption.

---

### 8) **Session job control generalization — novel or prior art?**

**Answer: not novel in isolation; novel in combination.**

The individual pieces all exist somewhere:

- Unix job control (`fg`, `bg`, `&`)
- tmux sessions/panes + control mode + subscriptions ([github.com](https://github.com/tmux/tmux/wiki/Control-Mode))
- systemd transient scopes/services for managed process lifecycles ([freedesktop.org](https://www.freedesktop.org/software/systemd/man/devel/systemd-run.html))
- Erlang/OTP supervision trees and workers/supervisors ([erlang.org](https://www.erlang.org/docs/27/system/design_principles.html))
- Temporal/LangGraph durable execution and pause/resume semantics ([docs.langchain.com](https://docs.langchain.com/oss/javascript/langgraph/durable-execution))
- CrewAI / AutoGen / Microsoft Agent Framework multi-agent orchestration and human feedback/stateful workflows ([microsoft.github.io](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html))
- Claude Code agent teams with lead/teammates/task-list/mailbox ([code.claude.com](https://code.claude.com/docs/en/agent-teams))

What is still differentiated in your proposal is the **unification** of:
- real PTY-backed terminal sessions,
- humans and agents as peers,
- typed events,
- attach/detach/handoff,
- replay/search/audit,
- local-first rendering.

That is valuable. But I would **align the vocabulary** more with:
- **OTP**: spawn, link, monitor, supervisor, restart policy
- **Temporal/LangGraph**: signal, child workflow, durable state, pause/resume
- **tmux/systemd**: session/pane/unit identity and lifecycle

I would avoid claiming “we invented job control for agents.” I would say:

> “We are building a local-first, PTY-aware supervisor/event model for human and agent sessions.”

That’s both more accurate and more legible.

---

## 3. Different perspectives / approaches

### Perspective A: **Product-first**
Build the best **agent workstation**.  
Best for proving value quickly.

### Perspective B: **Framework-first**
Ship `<PtyPane>`, `<SplitLayout>`, session runtime, event APIs.  
Best if your real business is infrastructure/platform.

### Perspective C: **Protocol-first**
Push CAP as the standard.  
Highest upside, highest risk. I would **not** start here.

### Perspective D: **Shell-first**
Build commander/super-shell.  
Most romantic; worst near-term bet.

**My recommendation:** A → then B → then maybe C. Skip D until proven.

---

## 4. Recent developments / current state (as of April 24, 2026)

- **Claude Code** now supports programmatic/headless runs, JSON and `stream-json`, JSON-schema structured outputs, `--bare`, local JSONL session storage/resume/fork, checkpointing, hooks, statusline JSON, subagents, and experimental agent teams. That validates your structured-mode strategy while reducing the need for screen-scraping. ([code.claude.com](https://code.claude.com/docs/en/headless))
- **Codex** is no longer “just a CLI.” OpenAI’s docs now show CLI + app + web + SDK + app server + MCP server + non-interactive mode + subagents + cloud tasks. ([help.openai.com](https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started))
- **Warp** has doubled down on agent UX: local agents, cloud agents, blocks, MCP support, and an explicit terminal-vs-agent conversation modality. ([docs.warp.dev](https://docs.warp.dev/agents))
- **cmux** launched on **February 12, 2026** with explicit multi-agent positioning and a Unix socket API. ([cmux.com](https://cmux.com/blog/introducing-cmux))
- **A2A** reached v0.3 with a more stable interface, gRPC, signed security cards, and Google says the project has momentum across 150+ organizations; Google also contributed A2A to the Linux Foundation in 2025. ([cloud.google.com](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade/))
- **MCP** is now a real ecosystem layer, with formal security best practices and broad host/client support. ([docs.anthropic.com](https://docs.anthropic.com/en/docs/mcp))

---

## 5. Concrete doc-by-doc review

### `01-building-blocks.md`
- **Agree:** `@silvery/pty` should be hidden behind a stable API.
- **Disagree:** “exactly one primitive” is too optimistic.
- **Add:** canonical event log, process-group/job-control semantics, secret hygiene, and daemon persistence semantics.

### `02-agent-integration.md`
- **Strongest doc.**
- Mode A/B/C taxonomy is exactly the right shape.
- But for Claude, go even further: **screen parsing should be last resort** because Anthropic already exposes headless output, sessions, hooks, and statusline JSON. ([code.claude.com](https://code.claude.com/docs/en/headless))

### `03-agent-authoring.md`
- Good long-term upside.
- Too early as a separate track.
- Authoring should come **after** you have a strong workstation and event model.

### `04-multiplex.md`
- Strong.
- But explicitly acknowledge tmux control mode, Zellij, WezTerm, kitty, iTerm2, and cmux as serious prior art. ([github.com](https://github.com/tmux/tmux/wiki/Control-Mode))

### `05-cap-protocol.md`
- Most strategically dangerous doc.
- Keep the semantic idea; drop the “new public protocol now” posture.
- CAP should begin as an internal manifest IR with projections to MCP/tools/UI/docs.

### `06-commander.md`
- This is the likely **scope graveyard**.
- Keep components, but don’t make “super-shell” the proving product.
- Shell replacement is far less urgent than agent workspace value.

### `07-sessions.md`
- Potentially your deepest idea.
- Recast it with supervisor/actor/durable-execution language.
- Make policy, replay, and identity first-class before adding many verbs.

### `big-ideas.md`
- Good instincts.
- Missing: trust/provenance, secret hygiene, registry governance, canonical event schema, and deterministic boundaries.

### `feasibility.md`
- Mostly right.
- I would make the sequencing even harsher: **workstation before commander, internal CAP before public CAP**.

---

## What I would do if I were you

1. **Adopt one product name internally:** `Agent Workspace`.
2. **Build one canonical event log.**
3. **Make Claude structured mode the golden path.**
4. **Ship multi-session oversight + replay + permissions before shell features.**
5. **Support Codex next.**
6. **Keep CAP internal until you have clear pull.**
7. **Defer public shell replacement.**

If you execute that, the thesis is **not** too ambitious. If you keep all six tracks live, it probably is.

---

## Sources / references / reading list

### Highest-priority official docs
- Claude Code headless/programmatic usage, sessions, hooks, statusline, checkpointing, subagents, agent teams. ([code.claude.com](https://code.claude.com/docs/en/headless))
- OpenAI Codex CLI/app/docs/models/use cases. ([help.openai.com](https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started))
- MCP intro + security best practices. ([docs.anthropic.com](https://docs.anthropic.com/en/docs/mcp))
- Google A2A docs/blog. ([google.github.io](https://google.github.io/adk-docs/a2a/intro/))
- IBM ACP overview. ([research.ibm.com](https://research.ibm.com/projects/agent-communication-protocol))

### Terminal / mux / API prior art
- tmux control mode. ([github.com](https://github.com/tmux/tmux/wiki/Control-Mode))
- Zellij features / remote / JSON / subscribe. ([zellij.dev](https://zellij.dev/features/))
- WezTerm mux + CLI + pane APIs. ([wezterm.org](https://wezterm.org/multiplexing.html))
- kitty remote control. ([sw.kovidgoyal.net](https://sw.kovidgoyal.net/kitty//remote-control/))
- iTerm2 Python API + tmux integration. ([iterm2.com](https://iterm2.com/python-api/))
- Warp blocks / agent modality. ([warp.dev](https://www.warp.dev/blog/how-warp-works))
- cmux intro / API. ([cmux.com](https://cmux.com/blog/introducing-cmux))

### Shell / structured-data / framework adoption
- Nushell. ([nushell.sh](https://www.nushell.sh/))
- Fig framework-based spec generation. ([fig.io](https://fig.io/docs/guides/integrating/getting-started))
- Cobra shell completion. ([cobra.dev](https://cobra.dev/docs/how-to-guides/shell-completion/))
- Textual terminal→web. ([textualize.io](https://www.textualize.io/))

### Multi-agent / orchestration / durability
- LangGraph durable execution + interrupts. ([docs.langchain.com](https://docs.langchain.com/oss/javascript/langgraph/durable-execution))
- CrewAI Flows. ([docs.crewai.com](https://docs.crewai.com/en/concepts/flows))
- AutoGen Teams. ([microsoft.github.io](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html))
- Microsoft Agent Framework workflows. ([learn.microsoft.com](https://learn.microsoft.com/en-us/agent-framework/user-guide/workflows/overview))
- Erlang/OTP supervision trees. ([erlang.org](https://www.erlang.org/docs/27/system/design_principles.html))
- systemd transient scopes/services. ([freedesktop.org](https://www.freedesktop.org/software/systemd/man/devel/systemd-run.html))

If you want, I can turn this into a **redlined review against each markdown file** with “keep / change / delete / add” annotations section-by-section.