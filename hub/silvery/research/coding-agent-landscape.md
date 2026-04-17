# Coding agent landscape — competitive map

_Internal research. Captured 2026-04-15. GitHub star counts sourced via `gh api repos/...` (2026-04-15). Numbers move fast; re-verify before external use._

## Why this doc exists

If we want to understand opencode's place in the world — or ever ship a coding agent of our own — we need a map of what's out there. This doc is that map. It covers the **major open-source coding agents** (the ones silvery/km might learn from or compete with), the **commercial agents** (for market context), and a note on **how they each render their UI**, because that's where silvery intersects.

## Tier 1 — The majors

Open-source agents with >20k GitHub stars and real usage.

### 1. opencode — anomalyco/opencode

- **Stars**: ~143,845 (2026-04-15)
- **Language**: TypeScript (Bun monorepo)
- **UI**: **OpenTUI + SolidJS** (custom TUI, previously Go/Bubble Tea). Also desktop (Tauri + Electron), web (Next.js/Astro), Slack, VS Code / JetBrains extensions, SDK.
- **Model providers**: 20+ via `@ai-sdk/*` — Anthropic, OpenAI, Google, AWS Bedrock, Azure, Vertex, Groq, Mistral, xAI, Perplexity, Cerebras, Cohere, DeepInfra, Alibaba, TogetherAI, Vercel Gateway, and OpenAI-compatible
- **Business model**: MIT OSS + hosted inference (`opencode Zen`) → "several million USD ARR" in 2025 (per TFN / Dev Genius)
- **Protocols**: MCP, ACP (Agent Client Protocol), LSP
- **Team**: Anomaly (ex-SST) — Jay V, Frank Wang, Dax Raad, Adam Elmore
- **Strengths**: Multi-provider, multi-surface, full TypeScript, sustainable business, strongest community
- **Weaknesses**: Surface is wide (desktop + web + Slack + CLI + TUI + extensions) for a ~10-person team
- **Covered in depth**: [`opentui-opencode.md`](./opentui-opencode.md), [`anomaly-company.md`](./anomaly-company.md)

### 2. Claude Code — anthropics/claude-code

- **Stars**: ~114,427 (the repo is mostly docs/issues — the package is closed-source, shipped via npm `@anthropic-ai/claude-code`)
- **Language**: TypeScript (bundle), Shell (repo shows Shell as primary language because of install scripts)
- **UI**: **Ink + React 19** on Yoga (the incumbent React-on-terminal stack). Uses Ink's scroll/virtualization, plus custom components.
- **Model**: Anthropic only (Claude Opus 4.x / Sonnet 4.x / Haiku 4.5) — no multi-provider support
- **Business model**: Free for Anthropic subscribers; enterprise tier; tightly bundled with the Anthropic API business
- **Protocols**: MCP (Anthropic-originated), hooks, skills, slash commands, extended subagents
- **Strengths**: First-party Anthropic — model is best-in-class, tooling is rich (hooks, skills, MCP servers, IDE integrations), bundled with the API business
- **Weaknesses**: Single-provider lock-in, closed-source, telemetry, data-handling concerns for some enterprises
- **Notable**: Uses Ink/React/Yoga — same stack we're building Silvery to replace. **Silvery's strongest real-world proof-case would be "what if Claude Code were rebuilt on silvery?"**

### 3. Gemini CLI — google-gemini/gemini-cli

- **Stars**: ~101,350
- **Language**: TypeScript
- **UI**: **Ink + React** (same stack as Claude Code)
- **Model**: Gemini 2.x / 3.x via Google's API. Has some multi-provider shims but is strongly Google-biased
- **Business model**: Free (tied to Google AI Studio / Vertex AI)
- **Strengths**: Google's model breadth, fast iteration, strong TypeScript quality
- **Weaknesses**: Gemini-centric, less community ownership than opencode or Aider
- **Notable**: **Forked as `QwenLM/qwen-code` (~23,309 stars)** by Alibaba. Also the likely template for other provider forks.

### 4. OpenHands — OpenHands/OpenHands (formerly All-Hands-AI/OpenHands, formerly OpenDevin)

- **Stars**: ~71,276
- **Language**: Python
- **UI**: Web-first (React + FastAPI backend). Not a TUI. Runs in a browser against a sandboxed runtime (Docker/Podman).
- **Model**: Multi-provider via LiteLLM (50+ providers)
- **Business model**: OSS. Company "All Hands AI" raised a $5M seed round (reported in 2024).
- **Strengths**: Academic pedigree (grew out of the Princeton/UIUC/CMU SWE-agent line), strong sandbox/runtime story, multi-provider
- **Weaknesses**: Python runtime, Docker-heavy setup, web UI rather than CLI
- **Notable**: The rename history (OpenDevin → OpenHands → All-Hands-AI → OpenHands) is a good illustration of how fast this market moves

### 5. Codex CLI — openai/codex

- **Stars**: ~75,460
- **Language**: **Rust** (major rewrite from the original TypeScript version in 2025)
- **UI**: Custom Rust TUI (likely built on Ratatui or a custom primitive set)
- **Model**: GPT-5, o1, o3, o4 — OpenAI only
- **Business model**: Free, tied to OpenAI API / ChatGPT subscription
- **Strengths**: First-party OpenAI, Rust runtime (fast, small, secure), clean UX
- **Weaknesses**: OpenAI lock-in, closed-ish development (the repo exists but the team is OpenAI internal)
- **Notable**: The **Rust rewrite** is significant — OpenAI explicitly chose Rust over their original TypeScript stack. This is a vote against the Ink/React path for high-performance agent TUIs.

### 6. cline — cline/cline

- **Stars**: ~60,319
- **Language**: TypeScript
- **UI**: **VS Code extension** (webview-based). Not a TUI. Runs inside the editor.
- **Model**: Multi-provider
- **Strengths**: IDE-native UX (no context switch, inline diffs, file tree access), strong Anthropic-compatible tool calling
- **Weaknesses**: VS Code only, not a standalone agent
- **Business model**: OSS + potential enterprise tier
- **Notable**: Alongside Roo-Code and Kilo-Code, cline defines the "agent-in-IDE" category — different UX shape from opencode/Aider

### 7. Aider — Aider-AI/aider

- **Stars**: ~43,389
- **Language**: Python
- **UI**: **Plain CLI / REPL** (prompt_toolkit). Not a full-screen TUI; line-based interaction with rich terminal output (colors, markdown, diffs)
- **Model**: Multi-provider via LiteLLM
- **Business model**: OSS, community-driven (solo maintainer: Paul Gauthier)
- **Strengths**: Benchmark-driven engineering (Aider maintains its own code-editing benchmark leaderboard), extreme focus on editing quality, git-aware workflow, very active solo maintainer
- **Weaknesses**: Python runtime, line-based UI feels dated compared to modern TUIs
- **Notable**: **The OG modern coding agent**. Aider proved the "CLI-native coding assistant" pattern before it was cool. Still the most principled on code-editing benchmarks.

### 8. goose — block/goose

- **Stars**: ~42,181
- **Language**: **Rust**
- **UI**: Custom Rust TUI (also ships a desktop/web variant)
- **Model**: Multi-provider via MCP-native design
- **Business model**: Open-sourced by **Block** (Jack Dorsey's company; formerly Square). Fully OSS, built for internal Block use originally.
- **Strengths**: Rust runtime, MCP-first architecture, backed by a real company with engineering depth
- **Weaknesses**: Less brand recognition than opencode or Aider; Block's AI strategy is still evolving
- **Notable**: Along with `codex` (OpenAI) and `crush` (Charmbracelet), goose is part of the **Rust agent cohort** that thinks TypeScript/Python is too slow for serious agent work

### 9. continue — continuedev/continue

- **Stars**: ~32,581
- **Language**: TypeScript
- **UI**: **VS Code + JetBrains extensions** + a newer CLI mode
- **Model**: Multi-provider
- **Business model**: OSS + **Continue, Inc.** (venture-backed; raised Series A in 2024). Enterprise features around policy, audit, and model routing.
- **Strengths**: Deep IDE integration (chat + autocomplete + actions), enterprise tier, established company
- **Weaknesses**: Historically editor-first, so the CLI story is newer; crowded segment
- **Notable**: One of the most mature commercial/OSS hybrids — the "Continue, Inc." vs "continuedev" split is a model for how to monetize an OSS coding agent

## Tier 2 — Serious players under 30k stars

### 10. charmbracelet/crush

- **Stars**: ~23,046
- **Language**: Go
- **UI**: **Bubble Tea** (their own framework) + Lip Gloss styling
- **Model**: Multi-provider
- **Business model**: OSS, built by Charmbracelet (the Bubble Tea / Glow / Lip Gloss / VHS team)
- **Strengths**: Beautiful UX (Charmbracelet has the strongest design sense in OSS TUIs), Go runtime, backed by a real company with Bubble Tea as their distribution
- **Weaknesses**: Less momentum than opencode or Aider; Go+Bubble Tea ecosystem is smaller than TypeScript+Ink for web-native developers
- **Notable**: Charmbracelet's whole brand is "beautiful terminals are possible." Crush is their coding agent bet — and a public signal that Bubble Tea is still the default for OSS Go TUIs. If OpenTUI is the React/Solid answer and Silvery is the React answer, **Crush/Bubble Tea is the Go answer.**

### 11. RooCode — RooCodeInc/Roo-Code

- **Stars**: ~23,142
- **Language**: TypeScript
- **UI**: VS Code extension (fork of cline's lineage)
- **Model**: Multi-provider
- **Business model**: OSS + enterprise
- **Notable**: Spun out of or alongside cline. Strong in the IDE-agent segment.

### 12. opcode — winfunc/opcode

- **Stars**: ~21,530
- **Language**: TypeScript
- **UI**: **GUI app** (not a TUI)
- **Notable**: "GUI app and Toolkit for **Claude Code**" — sits on top of Claude Code rather than replacing it. Lets users create custom agents, manage sessions, run background agents. Adjacent, not direct competition.

### 13. SWE-agent — SWE-agent/SWE-agent

- **Stars**: ~18,993
- **Language**: Python
- **UI**: Headless — not really interactive
- **Notable**: **Academic origin** (Princeton NLP + collaborators, NeurIPS 2024). Architecturally significant: SWE-agent pioneered the "agent-computer interface" paradigm that most modern coding agents inherit. Focused on benchmark-driven autonomous issue resolution, not interactive coding.

### 14. kilocode — Kilo-Org/kilocode

- **Stars**: ~18,158
- **Language**: TypeScript
- **UI**: VS Code extension (cline/RooCode lineage)
- **Notable**: Self-described as "#1 coding agent on OpenRouter" with "1.5M+ Kilo Coders". Another entrant in the IDE-agent segment. Branded as an "agentic engineering platform".

### 15. plandex — plandex-ai/plandex

- **Stars**: ~15,242
- **Language**: Go
- **UI**: Terminal CLI (headless-ish; has a browser/TUI dashboard)
- **Business model**: OSS + Plandex Cloud (hosted)
- **Strengths**: Designed for **large projects** (long-horizon planning, diff review, context streaming). Plans → review → apply workflow
- **Notable**: Different shape from conversational agents — more of a planning/execution pipeline. Relevant for km-style long-horizon workflows.

### 16. mini-swe-agent — SWE-agent/mini-swe-agent

- **Stars**: ~3,849
- **Language**: Python
- **UI**: Plain CLI
- **Notable**: **100-line coding agent** from the SWE-agent team — proves how small a functional agent can be. Scores >74% on SWE-bench verified. Not a competitor; a **calibration point**. When someone says "coding agents are too complex," point them at mini-swe-agent.

## Tier 3 — Commercial agents (context, not direct OSS competition)

Market shape, not something we'd fork or compete with directly.

### Cursor (cursor.sh / Anysphere)

- **UI**: Custom fork of VS Code
- **Model**: Claude, GPT, Gemini, custom routing
- **Business**: Commercial. Raised ~$900M (2025), valued ~$10B+
- **Role in the map**: The 800-pound gorilla of commercial AI editors. Different shape from opencode (editor, not CLI agent). Cursor's success is why everyone is building "IDE-native" agents (cline, continue, Roo, Kilo).

### Windsurf (windsurf.ai / Codeium)

- **UI**: Custom fork of VS Code (formerly Codeium)
- **Business**: Commercial. Acquired by OpenAI in 2025 for ~$3B (reported)
- **Role**: Cursor's biggest rival before the OpenAI acquisition. Now effectively part of OpenAI's editor play.

### Zed (zed-industries/zed)

- **Stars**: ~79,181 (the editor itself is OSS)
- **Language**: Rust
- **UI**: Native Rust editor — not a terminal app, but **ships an agent panel** alongside its standard editor UI
- **Business**: Commercial Zed Pro subscription on top of the OSS editor
- **Role**: Part of the "editor with a first-class agent panel" category alongside Cursor and Windsurf. Notable for native performance (Rust, GPU-accelerated rendering) and collaborative multiplayer editing.

### Devin (cognition-labs / cognition.ai)

- **UI**: Web app. Slack integration. Not a TUI.
- **Business**: Commercial. Raised ~$200M+ (2024-2025), valued several billion.
- **Role**: Kicked off the "autonomous agent" category with a famous 2024 demo. Execution has been mixed since, but remains a reference point for "fully autonomous coding agent with a browser + VM + GitHub integration."

### Jules (Google)

- **UI**: Web app, GitHub integration
- **Role**: Google's answer to Devin. Async coding agent that works in a sandbox and opens PRs. Smaller footprint than Gemini CLI.

### Amp (Sourcegraph)

- **UI**: CLI + web + IDE extension
- **Model**: Multi-provider
- **Business**: Commercial, from Sourcegraph
- **Role**: Sourcegraph's pivot from code-search to agent. Enterprise-flavored, high-quality.

### Codeium, Cody (Sourcegraph), TabNine, Copilot

- These are mostly **autocomplete / chat assistants** rather than agents (Copilot now has an "agent mode" but it's a layer on top of the autocomplete DNA). Mentioned for completeness; they're adjacent, not direct competitors to opencode.

## UI stack summary — how each agent renders

This is where silvery intersects. Grouped by UI approach.

**Ink + React + Yoga (WASM)**

- Claude Code (Anthropic)
- Gemini CLI (Google)
- qwen-code (Alibaba fork of Gemini CLI)

These are the prime targets for silvery's Ink-compat story. Claude Code is the most important — "Claude Code on silvery" would be the single biggest possible validation.

**OpenTUI + SolidJS**

- opencode (Anomaly)

Primary silvery competitor for new-build TUIs.

**Bubble Tea (Go) + Lip Gloss**

- crush (Charmbracelet)

Not a direct competitor — different language. But proves "the JS/TS monopoly is not a given."

**Custom Rust TUI (mostly Ratatui or bespoke)**

- codex (OpenAI, Rust rewrite)
- goose (Block, Rust from day one)
- plandex (Go, custom)

The "Rust agent cohort" — betting that native runtimes matter for serious agent workloads.

**Web / browser**

- OpenHands (Python + React web)
- Devin, Jules, Cursor, Windsurf, Zed (various)

Different shape entirely — no TUI story.

**IDE extensions**

- cline, RooCode, Kilocode, continue, Copilot

Another shape — ride on VS Code or JetBrains as the host.

**Plain CLI / prompt_toolkit**

- Aider (Python)
- mini-swe-agent (Python, 100 lines)

Minimalist. Aider in particular is a reminder that a good agent doesn't need a full TUI.

## What this means for silvery and km

1. **The TypeScript TUI lane is crowded at the top** — Claude Code + Gemini CLI both use Ink + React + Yoga. That's ~215k stars of distribution sitting on the exact stack silvery is designed to replace. If silvery ships a credible Ink-compat layer and a migration story (it mostly already has both), that's the highest-value migration target in the ecosystem.
2. **opencode is on OpenTUI/Solid and is very happy there** — not going to migrate to silvery voluntarily. Compete on framework quality, don't chase conversion.
3. **The Rust cohort (goose, codex, crush-ish) is betting against TS** — silvery's counter is correctness-first TS + declarative React ergonomics. Rust wins at peak throughput; silvery needs to win at DX, testing, and hackability, which it already does.
4. **Aider is the moral high ground of the ecosystem** — benchmark-driven, solo maintainer, no VC, no fluff. Don't compete with Aider on code-editing quality; learn from it. Any coding-agent thing we eventually build should probably publish benchmarks the way Aider does.
5. **IDE agents (cline/Continue/Roo/Kilo) are a different market shape** — we're not building one. But if km ever extends into "coding copilot for knowledge workflows," this is where the UX patterns live.
6. **The TUI coding-agent category is exploding but not saturated** — silvery's right-time, right-place window is real. Every major model provider now has a CLI coding agent; the quality of those agents depends on their TUI framework; most of them are on Ink. There's a real opportunity if silvery lands before the ecosystem crystallizes.

## Strategic notes

1. **Build an Ink-compat page specifically for coding-agent migrators.** Target: "if you're maintaining an Ink-based coding agent (Claude Code, Gemini CLI, or internal), here's what moving to silvery buys you." Concrete, benchmark-backed, migration-step-by-step.
2. **Track the Rust cohort's perf claims.** If goose/codex start publishing benchmarks, we need a response. Publish silvery's own numbers on scenarios that matter for agent TUIs (streaming markdown output, large diff views, scroll-back to long sessions) — not just synthetic kanban benchmarks.
3. **Watch OpenTUI's plugin API.** If they ship `@opentui/adapter-ink` or similar, that's a bridge that lets Ink apps migrate to OpenTUI without touching code — eroding silvery's Ink-compat lead. Monitor releases.
4. **Don't build our own coding agent yet.** The space is crowded and the marginal value of another TUI coding agent is low. Silvery's job is to be the **best framework** for building coding agents. Pick a flagship migration target (Ink → silvery) and own that narrative.
5. **Respect the category's velocity.** This list was essentially empty 18 months ago. It will look materially different in another 18 months. Any internal comparison doc older than ~6 weeks is probably stale.

## Sources

- `gh api repos/...` — live star counts for each repo listed (2026-04-15). All numbers above are verified against `gh api`.
- `npm view @opentui/*` — OpenTUI ecosystem.
- `/tmp/opencode-analysis/packages/opencode/package.json` — opencode's 20+ `@ai-sdk/*` providers.
- TFN, Dev Genius, Technori — opencode / Anomaly business reporting (see [`anomaly-company.md`](./anomaly-company.md) for full source list).
- [Cursor funding](https://techcrunch.com/2025/06/05/cursor-funding) and [Windsurf acquisition](https://www.reuters.com/technology/artificial-intelligence/openai-acquire-coding-assistant-windsurf-2025-05-06/) — commercial agent context (generic references; verify with a fresh search before quoting specific dollar amounts).
- [All Hands AI seed round reporting](https://techcrunch.com/2024/03/24/openhands-ai-formerly-opendevin-raises-5m-seed/) — OpenHands company context.
- Paired internal docs: [`opentui-vs-silvery.md`](./opentui-vs-silvery.md), [`opentui-opencode.md`](./opentui-opencode.md), [`anomaly-company.md`](./anomaly-company.md), [`svelte-vue-tui-options.md`](./svelte-vue-tui-options.md).

Stars, ARR, funding rounds, and launch claims all move fast. Treat specific numbers as 2026-04-15 snapshots, not durable facts.
