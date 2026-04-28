# Agent host landscape — Cline, opencode, Continue, aider, Claude Code, Codex, Cursor

**Status**: landscape survey for positioning an authoring track. Accuracy caveats throughout — where internal details aren't confirmed from source, I flag the uncertainty. This is a first-pass map, not a deep-dive audit.

**Scope**: agent **hosts** (own-loop products). For **agent routers** (delegated-loop meta-orchestrators that wrap other agent CLIs — OpenClaw, claude-squad, opcode, vibe-kanban, happy, conductor, hermes-agent-planned), see [10-agent-router-landscape.md](10-agent-router-landscape.md).

**MECE classifier** (the full taxonomy lives in doc 10):

- **Loop ownership**: own (L1) vs delegated (L2)
- **Model reach**: HTTP/SDK direct (B1) vs subprocess agent CLI (B2) vs inverted MCP (B3)

|  | B1 HTTP/SDK | B2 Subprocess CLI | B3 Inverted MCP |
|---|---|---|---|
| **L1 own** | **Type M — this doc** | impossible by definition | impossible by definition |
| **L2 delegated** | rare proxy oddity | **Type A — see doc 10** | **Type R — see doc 10** (container-use) |

**Terminology**:
- **Agent** — LLM + tool loop + behavior (Claude Sonnet doing work).
- **Agent host** — own-loop product packaging it (Cline, Claude Code, opencode, etc.).
- **Agent router** — delegated-loop meta-orchestrator that wraps multiple agent hosts as subprocess backends.
- **Coding agent** — colloquial term for the whole host+agent product.

## At-a-glance matrix

| Host | License | Surfaces | Models | Tool model | Extensibility | Agent loop | Memory/context |
|---|---|---|---|---|---|---|---|
| **Claude Code** | Proprietary (Anthropic) | CLI TUI + VSCode ext | Claude | Built-in + MCP | Hooks, Skills, settings | Single-agent + Task sub-agents | In-session + JSONL; `/compact` |
| **Cline** | Apache 2.0 | VSCode ext + **TUI** | Multi-vendor (Claude/GPT/Gemini/Ollama/local) | Built-in + MCP | MCP servers | Single-agent; Plan/Act modes | In-session; task history |
| **Continue** | Apache 2.0 | VSCode + JetBrains | Multi-vendor (everything) | Built-in + MCP | Config-driven + plugins | Single-agent; Chat/Edit/Agent/Autocomplete | In-session; indexed codebase |
| **opencode** | MIT (sst org) | TUI | Multi-vendor | Built-in + MCP | MCP + `opencode.json` config | Single + multi-session | In-session |
| **aider** | Apache 2.0 | TUI (Python) | Multi-vendor via LiteLLM | Built-in (edit/commit) | Commands, `/` prefix | Single-agent | **Repo map** (tree-sitter) + git history |
| **Codex CLI** | MIT / Apache (OpenAI) | CLI | GPT family | Built-in | JSON output mode | Single-agent | In-session |
| **Cursor** | Proprietary | Forked VSCode IDE | Multi-vendor | Built-in | Limited | Composer (multi-file) + Agent | Indexed codebase + "@" refs |
| **GitHub Copilot** | Proprietary | Multi-IDE + CLI + Web | GPT / proprietary | Built-in | Copilot Extensions | Chat + Edits + Workspace | Indexed codebase |
| **pi-mono** | MIT (badlogic) | TUI (`pi-coding-agent`) + Slack (`pi-mom`) | Multi-vendor via `pi-ai` (Anthropic, OpenAI, Google, Bedrock, Vertex, Azure) | Built-in (`pi-agent-core`) | Workspace packages | Single-agent | In-session; own message log |
| **sketch** | (Bold Software) | Web IDE in container | Anthropic only | Built-in (mostly shell) | n/a | Single-agent per sketch | Container-isolated; multiple parallel sketches |
| **maige** | OSS (RubricLab) | GitHub bot (Next.js webhook) | OpenAI via LangChain | LangChain tools + SerpAPI | Rules-based routing | Single-agent per webhook | None first-class |
| **hermes-agent** (today) | OSS (NousResearch) | Ink TUI | Multi-vendor (Nous Portal, OpenRouter, Anthropic, OpenAI-compat, Bedrock, vLLM) | Built-in | 6 exec backends (local/Docker/SSH/Daytona/Singularity/Modal) | Single-agent | In-session |
| **(silvery-native, speculative)** | TBD | Terminal + canvas + DOM | Claude (v1); multi-vendor (later) | Built-in + MCP + CAP | silvery components | Multi-agent peers via tribe/sessions | km graph + tape replay |

### What the columns mean

- **Surfaces**: where the agent runs (IDE extension, TUI, CLI, web)
- **Models**: single vs multi-vendor model support
- **Tool model**: how the agent gets its tools (hardcoded, MCP, pluggable)
- **Extensibility**: how users add capabilities
- **Agent loop**: single agent, multi-agent, or peer-agents
- **Memory/context**: how the host keeps and reuses context

## Per-host architecture notes

### Claude Code (Anthropic, proprietary)

**What it is**: Anthropic's official agent CLI; rich TUI; VSCode extension companion.

**Architecture** (inferred — not fully confirmed from source):
- Alt-screen TUI in Node/Ink; chat bubbles + tool-call boxes + permission UI
- Uses Anthropic API directly (not the SDK — CC is the reference implementation that the SDK abstracts)
- Built-in tools: Read, Write, Edit, Bash, Grep, Glob, Task (sub-agent), WebFetch, etc.
- Extensibility: MCP servers (tools + prompts + resources), Skills (loadable capability packs), Hooks (SessionStart, PreCompact, PostToolUse, etc.), settings.json
- JSONL session files at `~/.claude/projects/<proj>/<session-id>.jsonl`
- Non-interactive: `-p "prompt" --output-format=stream-json` emits typed events
- Multi-agent via Task tool (opaque sub-agents, not peer)

**Notable features**:
- Permission modes (plan / accept-edits / auto)
- Slash commands (`/compact`, `/rename`, `/clear`, `/help`, `/doctor`, `/agents`)
- Todos via TodoWrite tool
- SuperClaude-style activity indicators + status line
- Hook system for lifecycle events
- Skills (loadable by convention, e.g. `/big`, `/pro`, `/recall`)
- .claude/settings.json for config, permission rules, hooks

**Strengths**: the richest Claude integration; Anthropic-blessed path; deep tool use.
**Weaknesses**: Claude-only; alt-screen TUI (loses scrollback, SSH friction); closed source.

### Cline (formerly Claude Dev, OSS Apache 2.0)

**What it is**: OSS agent host; started VSCode-only, now ships a TUI alongside. Strong Plan/Act workflow.

**Architecture**:
- VSCode extension written in TypeScript; agent loop lives in the extension process
- **Dual-surface** since [recent]: shared agent core, VSCode webview UI + TUI UI
- Agent loop: vendor-SDK-direct via a provider abstraction (Claude / GPT / Gemini / Ollama / local)
- Built-in tools: file read/write, execute command (PTY-backed terminal), browser action, MCP servers
- Plan/Act distinction: "Plan" mode reasons without editing; "Act" mode proposes edits with diff-preview approvals

**Notable features**:
- Approval flow per tool with diff preview
- Multi-vendor from day one via provider abstraction
- MCP support
- Task history / resumability
- Browser tool (Puppeteer-based automation for web testing)
- Terminal integration (uses VSCode's shell integration API when in VSCode)

**Strengths**: mature; multi-vendor; very careful approval UX; now multi-surface.
**Weaknesses**: UI complexity; the webview/TUI parity is new territory.

### Continue (OSS Apache 2.0)

**What it is**: OSS multi-IDE extension with pluggable everything. VSCode + JetBrains.

**Architecture**:
- **Core engine** is a standalone TypeScript package (`core/`) — platform-independent agent loop, model abstraction, tool registry, prompt compilation
- **GUI** layer talks to core via IPC; separate packages for VSCode and JetBrains
- Config-file-driven (`.continuerc.json` / `config.yaml`); define providers, models, prompts, context providers
- Multiple "modes": Autocomplete (inline completion), Chat (Q&A), Edit (in-place refactor), Agent (tool-use loop)
- Context providers: `@file`, `@terminal`, `@problems`, `@codebase` (RAG), `@git`, custom
- Model backends: Anthropic, OpenAI, Gemini, Bedrock, Azure, Ollama, HuggingFace, LMStudio, llama.cpp — basically everything

**Notable features**:
- Configurable slash commands
- Docs context provider (fetch + embed docs for reference)
- Rich @-context system for targeted retrieval
- Platform-agnostic core — reusable across IDEs

**Strengths**: if you want maximum flexibility + broadest model support, Continue is the reference. Core is portable — we could reuse it.
**Weaknesses**: no TUI currently; configuration-heavy (more control = more knobs).

### opencode (MIT, anomalyco / ex-SST team)

**What it is**: TUI coding agent from the Anomaly team (ex-SST: Jay V, Dax Raad, Adam Elmore, Frank Wang). Strong polish in the terminal — and, as of 2026, **the de facto open agent platform** (see Kilo Code below).

**Architecture**:
- TypeScript implementation; TUI rendering
- Multi-vendor via `@ai-sdk/*` (20+ providers — Anthropic, OpenAI, Google, AWS Bedrock, Azure, Vertex, Groq, Mistral, xAI, Perplexity, Cerebras, Cohere, DeepInfra, Alibaba, TogetherAI, Vercel Gateway, OpenAI-compatible)
- Protocols: **MCP, ACP (Agent Client Protocol), LSP**
- `opencode.json` for config (providers, models, tools)
- Multi-session support
- Server core decoupled from surface — same engine powers TUI, desktop (Tauri), web (`opencode web`), and external consumers

**Notable features**:
- TUI polish: well-designed for terminal use
- ACP server — opencode can be consumed *as a backend* by other agent hosts
- Session management
- LSP awareness for richer code context

**Business**: MIT OSS + hosted inference (`opencode Zen`) → "several million USD ARR" (TFN/Dev Genius, 2025). Multi-surface team of ~10.

**Strengths**: best-in-class TUI UX; recent + active; **server-core / multiple-surfaces architecture proven in production**; speaks ACP natively; has a productized OEM downstream (Kilo Code).
**Weaknesses**: surface is wide for the team size (TUI + desktop + web + Slack + CLI + extensions); "anomaly" branding less recognized than "opencode" itself.

### Kilo Code (Apache 2.0, Kilo-Org — opencode OEM downstream)

**What it is**: A productized soft fork of opencode shipped as a multi-surface coding-agent product (VS Code + JetBrains + standalone CLI + Cloud Agents). The TUI/extension UX is essentially identical to opencode's; Kilo's value-add is auth + Orchestrator mode + Memory Bank + Agent Manager (multi-session diff reviewer with git-worktree isolation) layered on top via `kilocode_change` markers.

**Architecture**:
- Core engine package literally lives at `packages/opencode/` in the Kilo repo, published as `@kilocode/cli`
- Soft fork with CI-enforced annotation discipline: every Kilo-specific change in shared opencode files must be tagged `<!-- kilocode_change start --> ... <!-- kilocode_change end -->` (`check-opencode-annotations.ts` blocks merges otherwise)
- `@opencode-ai/app`, `@opencode-ai/desktop`, `@opencode-ai/util` package names preserved verbatim from upstream — they sync packages directly
- Cline-fork lineage from pre-April-2026 is dead code in current main; the runtime is opencode end-to-end

**Distinctive features**: Orchestrator mode (Architect/Coder/Debugger sub-modes), Memory Bank (persistent project context), Agent Manager, MCP Marketplace, Slack bot, voice commands, JetBrains support (the only Cline-family product with JetBrains).

**Company**: kilo.ai. Co-founders **Sid Sijbrandij** (GitLab co-founder/ex-CEO, Executive Chair) + **Scott Breitenother** (Brooklyn Data founder). ~34 people; **$8M seed (Dec 2025)** led by Cota Capital with General Catalyst, Breakers, Quiet Capital, Tokyo Black. Claims 1.5M+ users; "#1 coding agent on OpenRouter" by volume.

**Notable**: **The first publicly productized OEM-style soft fork of opencode.** Validates opencode-as-platform — the way Kilo built a coding-agent product without owning the runtime.

**Implication for silvercode**: see [02-agent-integration.md](02-agent-integration.md) for the ACP-vs-fork decision. Short version: silvercode should consume opencode over ACP (multi-backend host stays multi-backend, runtime outsourced over a wire), not soft-fork it (would commit silvercode to forever-tracking upstream and dilute multi-backend identity).

### aider (OSS Apache 2.0, Python)

**What it is**: Python TUI agent; pioneered "git-first + repo-map" approach.

**Architecture**:
- Python CLI; uses prompt_toolkit for TUI
- Multi-vendor via **LiteLLM** (the go-to Python LLM abstraction)
- **Repo map**: uses tree-sitter to build a symbol graph of the whole repository; includes relevant chunks in context automatically
- Git-integrated: every edit auto-commits with an LLM-generated message; easy revert
- Command system: `/add`, `/drop`, `/commit`, `/undo`, `/diff`, `/run`, `/web`, etc.

**Notable features**:
- Repo map is genuinely novel — context-efficient way to give the LLM a whole-repo view
- Git workflow is airtight
- Benchmarks: aider publishes SWE-bench / editing benchmarks; often leads on real-world edit quality

**Strengths**: the repo-map approach is better than naive RAG for many workflows; git integration is excellent; benchmarks back it up.
**Weaknesses**: Python-only (harder to embed in a JS/TS stack); TUI is functional but not flashy.

### Codex CLI (OpenAI, MIT/Apache)

**What it is**: OpenAI's official agent CLI. Released more recently than Claude Code; less mature in features.

**Architecture**:
- Rust-based CLI (I believe)
- GPT-family models only
- Built-in tool set (fs, shell)
- JSON output mode for non-interactive use

**Notable features**:
- OpenAI-blessed; follows OpenAI's evolving model capabilities
- Smaller surface area than Claude Code

**Strengths**: official OpenAI path; clean CLI.
**Weaknesses**: fewer features than Claude Code; narrower ecosystem; GPT-only.

### Cursor (proprietary)

**What it is**: VSCode fork with its own agent backend. Commercial product ($20/mo).

**Architecture**:
- Fork of VSCode (regularly rebased)
- Proprietary backend with model routing / caching / optimization
- Multi-vendor under the hood (users don't pick models for most flows; Cursor picks)
- "Tab" autocomplete, "Composer" for multi-file edits, "Agent" for autonomous tasks
- `.cursorrules` for repo-specific system prompts
- Indexed codebase with RAG

**Notable features**:
- Composer (multi-file edit preview + apply)
- Tab autocomplete is uniquely good (proprietary infra)
- @-references for targeted context
- BYOK available but default is Cursor's hosted model

**Strengths**: best-in-class user experience in the IDE segment; commercial polish.
**Weaknesses**: proprietary; fork drift from VSCode; subscription required for full features.

### GitHub Copilot (proprietary)

**What it is**: GitHub/MS's agent family. Multi-IDE + CLI + Web.

**Architecture**:
- Multiple products under one brand: Copilot (autocomplete), Copilot Chat, Copilot Edits, Copilot Workspace
- Backend: mix of OpenAI models + GitHub's own routing
- IDE surfaces: VSCode, JetBrains, Neovim, Visual Studio, Xcode, etc.
- CLI: `gh copilot` for shell/command suggestions
- Copilot Workspace: autonomous multi-file task execution in the browser
- Copilot Extensions: plugins that add skills to Copilot Chat

**Notable features**:
- Broadest IDE coverage
- Copilot Workspace for autonomous task mode
- Tight GitHub integration (PR-aware)

**Strengths**: distribution (everyone has GitHub); polish; enterprise adoption.
**Weaknesses**: proprietary; less cutting-edge feature velocity than Cursor/Claude Code.

## Feature dimensions to pick positions on

These are the axes where hosts differ materially. For an authoring track, we pick a position on each.

| Dimension | Options | Our likely position |
|---|---|---|
| **Surfaces** | CLI / TUI / IDE / Web / multi-surface | Multi-surface (silvery's thesis) |
| **Models** | Single vendor / multi / BYOK | Claude v1; multi later |
| **Tool source** | Built-in / MCP / pluggable / CAP | Built-in + MCP + CAP |
| **Permission model** | Auto / ask / plan+act / policy-gated | CAP permissions + commander gates |
| **Agent loop** | Single / single+sub / peer | Peer (sessions model, fibers) |
| **Memory** | In-session / repo-map / indexed / persistent graph | km graph (persistent) + tape (replayable) |
| **Extensibility** | Closed / config / plugins / protocol | Silvery components + MCP + CAP |
| **Git integration** | None / manual / auto-commit / diff-preview | Diff-preview via CAP blocks |
| **License** | Proprietary / OSS / source-available | TBD (see `what's not scoped` in README) |

## What we can learn (or steal) from each

- **Claude Code**: hook system, Skills convention, tool set baseline. Reference for "what a mature agent host looks like."
- **Cline**: dual-surface architecture (validates silvery multi-target), Plan/Act approval UX, approval-first-everything.
- **Continue**: portable core engine pattern. `@`-context providers. Consider reusing Continue's core for multi-vendor if we go that way.
- **opencode**: TUI polish benchmarks. Study how they lay out the screen.
- **aider**: repo-map approach (tree-sitter symbol graph) — we'd layer this on top of km's node graph for free context.
- **Codex**: not much; behind in features.
- **Cursor**: Composer (multi-file edit preview) pattern. Tab autocomplete's infrastructure is their moat; we don't compete there.
- **Copilot**: Extensions pattern; if MCP hadn't already eaten that space, this would be interesting.

## Where silvery-native would differentiate

Given the above, a silvery-native agent host's novelty isn't in any one feature — it's in the **composition**:

- **Peer-agent-by-default** (sessions + tribe) — nobody else has this as the native model. Everyone has single-agent + opaque sub-agents.
- **Replayable agent runs via tape** — nobody has this; it falls out of our stack.
- **km as persistent memory graph** — aider has repo-map; nobody has "the agent's memory is a bidirectionally-synced knowledge graph the user also edits."
- **Cross-surface (terminal + canvas + web)** — only Cline is approaching this, and their multi-surface is partial.
- **CAP-typed tool use** — nobody has a typed-manifest protocol for CLI tools that agents can call as MCP.
- **Supervision-tree-native** (08-supervision.md) — fault tolerance + unified addressing from fiber to region.

Any single one is modest. The compound is potentially a category-defining product — *if* the compound is legible to users (see `alignment-as-deployment-principle` in 08).

## Open questions

- Is Claude Agent SDK mature enough for us to build a full agent host on? (Probably yes; Anthropic ships with it.)
- How do we handle multi-vendor without reimplementing Continue's core?
- What is the killer-feature demo that distinguishes us from Cline's TUI in 15 seconds?
- Is there room for another agent host, or is the market already crowded?

These aren't answered in this doc — they're the right questions to resolve before writing code.

## Sources / verification status

Claims here are a mix of confirmed-from-public-info and inferred. Confidence levels:

- **High confidence**: Claude Code features/UX (direct use), Cline existence & license, Continue's multi-vendor architecture, aider's repo-map + git approach.
- **Medium confidence**: opencode internals, Cursor's composer architecture, Copilot Workspace specifics.
- **Low confidence / inferred**: specific implementation details of any host's internal agent loop (most are OSS so could be verified by reading source; out of scope for this doc).

Before using this as a basis for a real strategy, verify the medium/low-confidence items by reading source / public docs.
