# Coding agent landscape — competitive map

_Internal research. Captured 2026-04-15, refreshed 2026-04-20. GitHub star counts sourced via `gh api repos/...` (2026-04-20). Numbers move fast; re-verify before external use._

## Why this doc exists

If we want to understand opencode's place in the world — or ever ship a coding agent of our own — we need a map of what's out there. This doc is that map. It covers the **major open-source coding agents** (the ones silvery/km might learn from or compete with), the **commercial agents** (for market context), and a note on **how they each render their UI**, because that's where silvery intersects.

## Tier 1 — The majors

Open-source agents with >20k GitHub stars and real usage.

### 1. opencode — anomalyco/opencode

- **Stars**: ~146,438 (2026-04-20)
- **Language**: TypeScript (Bun monorepo)
- **UI**: **OpenTUI + SolidJS** (custom TUI, previously Go/Bubble Tea). Also desktop (Tauri + Electron), web (Next.js/Astro), Slack, VS Code / JetBrains extensions, SDK.
- **Model providers**: 20+ via `@ai-sdk/*` — Anthropic, OpenAI, Google, AWS Bedrock, Azure, Vertex, Groq, Mistral, xAI, Perplexity, Cerebras, Cohere, DeepInfra, Alibaba, TogetherAI, Vercel Gateway, and OpenAI-compatible
- **Business model**: MIT OSS + hosted inference (`opencode Zen`) → "several million USD ARR" in 2025 (per TFN / Dev Genius)
- **Protocols**: MCP, ACP (Agent Client Protocol), LSP
- **Team**: Anomaly (ex-SST) — Jay V, Frank Wang, Dax Raad, Adam Elmore
- **Strengths**: Multi-provider, multi-surface, full TypeScript, sustainable business, strongest community
- **Weaknesses**: Surface is wide (desktop + web + Slack + CLI + TUI + extensions) for a ~10-person team
- **Recent**: shipping rapidly — v1.14.19 (2026-04-20), v1.14.18 (2026-04-19), v1.14.17 (2026-04-19); multiple point releases per day
- **Covered in depth**: [`opentui-opencode.md`](./opentui-opencode.md), [`anomaly-company.md`](./anomaly-company.md)

### 2. Claude Code — anthropics/claude-code

- **Stars**: ~116,200 (2026-04-20) — the repo is mostly docs/issues; the package is closed-source, shipped via npm `@anthropic-ai/claude-code`
- **Language**: TypeScript (bundle), Shell (repo shows Shell as primary language because of install scripts)
- **UI**: **Ink + React 19** on Yoga (the incumbent React-on-terminal stack). Uses Ink's scroll/virtualization, plus custom components.
- **Model**: Anthropic only (Claude Opus 4.x / Sonnet 4.x / Haiku 4.5) — no multi-provider support
- **Business model**: Free for Anthropic subscribers; enterprise tier; tightly bundled with the Anthropic API business
- **Protocols**: MCP (Anthropic-originated), hooks, skills, slash commands, extended subagents
- **Strengths**: First-party Anthropic — model is best-in-class, tooling is rich (hooks, skills, MCP servers, IDE integrations), bundled with the API business
- **Weaknesses**: Single-provider lock-in, closed-source, telemetry, data-handling concerns for some enterprises
- **Notable**: Uses Ink/React/Yoga — same stack we're building Silvery to replace. **Silvery's strongest real-world proof-case would be "what if Claude Code were rebuilt on silvery?"**
- **Recent**: v2.1.114 (2026-04-18), v2.1.113 (2026-04-17), v2.1.112 (2026-04-16) — daily releases; still on Ink stack

### 3. Gemini CLI — google-gemini/gemini-cli

- **Stars**: ~101,889 (2026-04-20)
- **Language**: TypeScript
- **UI**: **Ink + React** (same stack as Claude Code)
- **Model**: Gemini 2.x / 3.x via Google's API. Has some multi-provider shims but is strongly Google-biased
- **Business model**: Free (tied to Google AI Studio / Vertex AI)
- **Strengths**: Google's model breadth, fast iteration, strong TypeScript quality
- **Weaknesses**: Gemini-centric, less community ownership than opencode or Aider
- **Notable**: **Forked as `QwenLM/qwen-code` (~23,604 stars, 2026-04-20)** by Alibaba — see standalone Tier 2 entry below. Also the likely template for other provider forks.
- **Recent**: v0.38.2 (2026-04-17) on the stable channel; v0.40.0-nightly cut 2026-04-15 (active nightly cadence)

### 4. OpenHands — OpenHands/OpenHands (formerly All-Hands-AI/OpenHands, formerly OpenDevin)

- **Stars**: ~71,566 (2026-04-20) — `All-Hands-AI/OpenHands` now redirects to `OpenHands/OpenHands`
- **Language**: Python
- **UI**: Web-first (React + FastAPI backend). Not a TUI. Runs in a browser against a sandboxed runtime (Docker/Podman).
- **Model**: Multi-provider via LiteLLM (50+ providers)
- **Business model**: OSS. Company "All Hands AI" raised a $5M seed round (reported in 2024).
- **Strengths**: Academic pedigree (grew out of the Princeton/UIUC/CMU SWE-agent line), strong sandbox/runtime story, multi-provider
- **Weaknesses**: Python runtime, Docker-heavy setup, web UI rather than CLI
- **Notable**: The rename history (OpenDevin → OpenHands → All-Hands-AI → OpenHands) is a good illustration of how fast this market moves
- **Recent**: v1.6.0 (2026-03-30) — slower release cadence than the TypeScript/Rust agents (monthly minor bumps vs daily point releases)

### 5. Codex CLI — openai/codex

- **Stars**: ~76,515 (2026-04-20)
- **Language**: **Rust** (major rewrite from the original TypeScript version in 2025)
- **UI**: Custom Rust TUI (likely built on Ratatui or a custom primitive set)
- **Model**: GPT-5, o1, o3, o4 — OpenAI only
- **Business model**: Free, tied to OpenAI API / ChatGPT subscription
- **Strengths**: First-party OpenAI, Rust runtime (fast, small, secure), clean UX
- **Weaknesses**: OpenAI lock-in, closed-ish development (the repo exists but the team is OpenAI internal)
- **Notable**: The **Rust rewrite** is significant — OpenAI explicitly chose Rust over their original TypeScript stack. This is a vote against the Ink/React path for high-performance agent TUIs.
- **Recent**: 0.122.0-alpha.13 (2026-04-20) — daily alpha cadence on the Rust track

### 6. cline — cline/cline

- **Stars**: ~60,479 (2026-04-20)
- **Language**: TypeScript
- **UI**: **VS Code extension** (webview-based). Not a TUI. Runs inside the editor.
- **Model**: Multi-provider
- **Strengths**: IDE-native UX (no context switch, inline diffs, file tree access), strong Anthropic-compatible tool calling
- **Weaknesses**: VS Code only, not a standalone agent
- **Business model**: OSS + potential enterprise tier
- **Notable**: Alongside Roo-Code and Kilo-Code, cline defines the "agent-in-IDE" category — different UX shape from opencode/Aider
- **Recent**: v1.31.1 (2026-04-20), v1.31.0 (2026-04-17), v1.30.0 (2026-04-08) — weekly minor cadence

### 7. Aider — Aider-AI/aider

- **Stars**: ~43,612 (2026-04-20)
- **Language**: Python
- **UI**: **Plain CLI / REPL** (prompt_toolkit). Not a full-screen TUI; line-based interaction with rich terminal output (colors, markdown, diffs)
- **Model**: Multi-provider via LiteLLM
- **Business model**: OSS, community-driven (solo maintainer: Paul Gauthier)
- **Strengths**: Benchmark-driven engineering (Aider maintains its own code-editing benchmark leaderboard), extreme focus on editing quality, git-aware workflow, very active solo maintainer
- **Weaknesses**: Python runtime, line-based UI feels dated compared to modern TUIs
- **Notable**: **The OG modern coding agent**. Aider proved the "CLI-native coding assistant" pattern before it was cool. Still the most principled on code-editing benchmarks.
- **Recent**: last tagged release v0.86.0 (2025-08-09) — release cadence has slowed dramatically over the past ~8 months. Still a reference point on benchmarks, but no longer setting the pace on shipping.

### 8. goose — block/goose

- **Stars**: ~42,804 (2026-04-20)
- **Language**: **Rust**
- **UI**: Custom Rust TUI (also ships a desktop/web variant)
- **Model**: Multi-provider via MCP-native design
- **Business model**: Open-sourced by **Block** (Jack Dorsey's company; formerly Square). Fully OSS, built for internal Block use originally.
- **Strengths**: Rust runtime, MCP-first architecture, backed by a real company with engineering depth
- **Weaknesses**: Less brand recognition than opencode or Aider; Block's AI strategy is still evolving
- **Notable**: Along with `codex` (OpenAI) and `crush` (Charmbracelet), goose is part of the **Rust agent cohort** that thinks TypeScript/Python is too slow for serious agent work
- **Recent**: v3.79.0 (2026-04-16), v3.78.0 (2026-04-10), v3.77.0 (2026-04-01) — steady weekly minor releases

### 9. pi — badlogic/pi-mono (`@mariozechner/pi-coding-agent`)

- **Stars**: ~37,786 (2026-04-20)
- **Language**: TypeScript (npm-distributed; `npm install -g @mariozechner/pi-coding-agent`, binary `pi`)
- **UI**: **Custom TUI on `@mariozechner/pi-tui`** — their own from-scratch terminal UI library with **differential rendering**. Not Ink, not OpenTUI, not Bubble Tea. Yet another TS TUI stack to track.
- **Model providers**: 15+ via `@mariozechner/pi-ai` — Anthropic, OpenAI, Google, and others. Multi-provider unified API.
- **Modes**: four — interactive TUI, print/JSON, RPC, SDK
- **Business model**: Pure OSS (MIT). No hosted inference, no enterprise tier mentioned. Domain `pi.dev` donated by exe.dev. Marketing site at shittycodingagent.ai. Tagline "There are many coding agents, but this one is mine."
- **Team**: Mario Zechner (badlogic, libGDX creator) at Earendil Inc., with Armin Ronacher (mitsuhiko, Flask creator) as co-maintainer
- **Distinctive**: deliberately omits MCP, sub-agents, permission popups, and plan mode — offers extensible primitives instead. Doom runs as an extension example. Monorepo also ships `pi-mom` (Slack bot), `pi-pods` (vLLM deployment CLI), and `pi-web-ui` (web chat components).
- **Strengths**: Tiny dependency surface, philosophical clarity (primitives over features), serious engineering pedigree, multi-provider, ships nightly (v0.67.68 published 2026-04-17)
- **Weaknesses**: No MCP means no Anthropic-ecosystem tools; opinionated minimalism may not survive contact with enterprise asks; small team
- **Notable**: **Most relevant Tier 1 entrant for silvery's framework story.** Pi is the first major coding agent on a from-scratch TS TUI library with explicit performance focus (differential rendering). If pi-tui matures into a general-purpose framework, it joins OpenTUI as a peer to silvery rather than a migration target. Also publishes session datasets to Hugging Face (`badlogicgames/pi-mono`) for OSS training data — unique among the cohort.

### 10. continue — continuedev/continue

- **Stars**: ~32,671 (2026-04-20)
- **Language**: TypeScript
- **UI**: **VS Code + JetBrains extensions** + a newer CLI mode
- **Model**: Multi-provider
- **Business model**: OSS + **Continue, Inc.** (venture-backed; raised Series A in 2024). Enterprise features around policy, audit, and model routing.
- **Strengths**: Deep IDE integration (chat + autocomplete + actions), enterprise tier, established company
- **Weaknesses**: Historically editor-first, so the CLI story is newer; crowded segment
- **Notable**: One of the most mature commercial/OSS hybrids — the "Continue, Inc." vs "continuedev" split is a model for how to monetize an OSS coding agent

## Tier 2 — Serious players under 30k stars

### 11. qwen-code — QwenLM/qwen-code

- **Stars**: ~23,604 (2026-04-20)
- **Language**: TypeScript (fork of `google-gemini/gemini-cli`)
- **UI**: **Ink + React** (inherited from gemini-cli; not verified to have diverged)
- **Model providers**: Multi-protocol — OpenAI / Anthropic / Gemini-compatible APIs, Alibaba Cloud Coding Plan, OpenRouter, Fireworks AI, BYO API key. Optimized for Qwen3-Coder but framework-agnostic.
- **Business model**: Apache-2.0 OSS, backed by Alibaba. Was free via Qwen OAuth tier; that quota was capped 2026-04-13 (1k → 100 req/day) and discontinued entirely 2026-04-15 — users now route through Alibaba Cloud, OpenRouter, Fireworks, or BYO key.
- **Strengths**: Co-evolves with the Qwen3-Coder model release cycle, broad provider support inherited from gemini-cli plus Alibaba's network, IDE integrations (VS Code, Zed, JetBrains), nightly release cadence
- **Weaknesses**: OAuth free tier just got pulled — degrades the easy-onboarding story; provenance still reads as "gemini-cli with a Qwen skin" rather than independent architecture
- **Notable**: Brands itself as "an open-source AI agent that lives in your terminal" with a "Claude Code-like experience" — positioning is explicit. Most successful provider fork of gemini-cli to date. Same Ink+React UI substrate as Claude Code and Gemini CLI, so a silvery Ink-compat story applies here too.
- **Recent**: nightly v0.14.5-nightly cadence (latest 2026-04-20)

### 12. charmbracelet/crush

- **Stars**: ~23,247 (2026-04-20)
- **Language**: Go
- **UI**: **Bubble Tea** (their own framework) + Lip Gloss styling
- **Model**: Multi-provider
- **Business model**: OSS, built by Charmbracelet (the Bubble Tea / Glow / Lip Gloss / VHS team)
- **Strengths**: Beautiful UX (Charmbracelet has the strongest design sense in OSS TUIs), Go runtime, backed by a real company with Bubble Tea as their distribution
- **Weaknesses**: Less momentum than opencode or Aider; Go+Bubble Tea ecosystem is smaller than TypeScript+Ink for web-native developers
- **Notable**: Charmbracelet's whole brand is "beautiful terminals are possible." Crush is their coding agent bet — and a public signal that Bubble Tea is still the default for OSS Go TUIs. If OpenTUI is the React/Solid answer and Silvery is the React answer, **Crush/Bubble Tea is the Go answer.**

### 13. RooCode — RooCodeInc/Roo-Code

- **Stars**: ~23,227 (2026-04-20)
- **Language**: TypeScript
- **UI**: VS Code extension (fork of cline's lineage)
- **Model**: Multi-provider
- **Business model**: OSS + enterprise
- **Notable**: Spun out of or alongside cline. Strong in the IDE-agent segment.

### 14. opcode — winfunc/opcode

- **Stars**: ~21,589 (2026-04-20)
- **Language**: TypeScript
- **UI**: **GUI app** (not a TUI)
- **Notable**: "GUI app and Toolkit for **Claude Code**" — sits on top of Claude Code rather than replacing it. Lets users create custom agents, manage sessions, run background agents. Adjacent, not direct competition.

### 15. SWE-agent — SWE-agent/SWE-agent

- **Stars**: ~19,015 (2026-04-20)
- **Language**: Python
- **UI**: Headless — not really interactive
- **Notable**: **Academic origin** (Princeton NLP + collaborators, NeurIPS 2024). Architecturally significant: SWE-agent pioneered the "agent-computer interface" paradigm that most modern coding agents inherit. Focused on benchmark-driven autonomous issue resolution, not interactive coding.

### 16. kilocode — Kilo-Org/kilocode

- **Stars**: ~18,334 (2026-04-20)
- **Language**: TypeScript
- **UI**: VS Code extension (cline/RooCode lineage)
- **Notable**: Self-described as "#1 coding agent on OpenRouter" with "1.5M+ Kilo Coders". Another entrant in the IDE-agent segment. Branded as an "agentic engineering platform".

### 17. plandex — plandex-ai/plandex

- **Stars**: ~15,263 (2026-04-20)
- **Language**: Go
- **UI**: Terminal CLI (headless-ish; has a browser/TUI dashboard)
- **Business model**: OSS + Plandex Cloud (hosted)
- **Strengths**: Designed for **large projects** (long-horizon planning, diff review, context streaming). Plans → review → apply workflow
- **Notable**: Different shape from conversational agents — more of a planning/execution pipeline. Relevant for km-style long-horizon workflows.

### 18. kimi-cli (Kimi Code) — MoonshotAI/kimi-cli

- **Stars**: ~7,936 (2026-04-20)
- **Language**: **Python**, Apache-2.0
- **UI**: Terminal CLI (no Ink; Python rich-style TUI per upstream)
- **Model**: Kimi K2.6 / K2.5 (Moonshot proprietary open-weight — context 262k, described as matching Claude Opus 4.6 / GPT-5.4 on SWE-Bench Pro, Terminal-Bench 2.0)
- **Business model**: OSS CLI + Moonshot API tier at platform.kimi.ai. Open-weight model shipped via Hugging Face
- **Strengths**: **300-parallel-subagent coordination** ("agent swarms"), sustained long-horizon execution (12+ hour sessions in the marketing material), Vercel / Fireworks / Baseten gateway integrations. **Claw Groups** research preview lets heterogeneous agents from any device/model operate in a shared space with K2.6 as adaptive coordinator — closest analogue to km's Matrix-based `#channel` / tribe pattern in the public coding-agent ecosystem
- **Weaknesses**: Python runtime, newer to the coding-CLI scene, ecosystem is Moonshot-first (though model routing via OpenRouter / Vercel works), Chinese origin may hit enterprise-procurement friction in some markets
- **Notable**: **Most strategically interesting of the Chinese-origin coding CLIs** because of the Claw Groups multi-agent framing — not "another Claude Code clone," genuinely different product shape around agent coordination. Paired with MoonshotAI's open-weight releases and OpenClaw's 113-extension channel ecosystem. Watch for Matrix / ACP protocol adoption — if they land there, silvery's coordination story gets validated externally
- **Recent**: K2.6 released 2026-04 with 300-agent / 4000-step swarm support (up from K2.5's 100 / 1500)

### 19. mini-swe-agent — SWE-agent/mini-swe-agent

- **Stars**: ~3,915 (2026-04-20)
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

- **Stars**: ~79,426 (2026-04-20) (the editor itself is OSS)
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

**`@mariozechner/pi-tui` (custom from-scratch TS, differential rendering)**

- pi (badlogic / Earendil)

A new TS TUI substrate to track. If pi-tui generalizes beyond pi-coding-agent, it becomes a peer to silvery rather than a migration target. As of 2026-04-20 it's tightly coupled to pi-mono — no standalone framework branding yet.

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
4. **Pi joined the from-scratch-TS-TUI club.** As of 2026-04-20 there are now three serious TS TUI substrates in active coding-agent use (Ink, OpenTUI, pi-tui), plus silvery. pi-tui is currently single-app (`pi-coding-agent`); if Mario/Armin generalize it, that's a fourth peer framework on top of the existing three. Watch `badlogic/pi-mono` for any signs of `@mariozechner/pi-tui` getting standalone framework branding, docs, or external adopters.
5. **Don't build our own coding agent yet.** The space is crowded and the marginal value of another TUI coding agent is low. Silvery's job is to be the **best framework** for building coding agents. Pick a flagship migration target (Ink → silvery) and own that narrative.
6. **Respect the category's velocity.** This list was essentially empty 18 months ago. It will look materially different in another 18 months. Any internal comparison doc older than ~6 weeks is probably stale.

## Sources

- `gh api repos/...` — live star counts for each repo listed (refreshed 2026-04-20). All numbers above are verified against `gh api`.
- `npm view @mariozechner/pi-coding-agent` and `gh api repos/badlogic/pi-mono` — Pi entry data.
- `npm view @opentui/*` — OpenTUI ecosystem.
- `/tmp/opencode-analysis/packages/opencode/package.json` — opencode's 20+ `@ai-sdk/*` providers.
- TFN, Dev Genius, Technori — opencode / Anomaly business reporting (see [`anomaly-company.md`](./anomaly-company.md) for full source list).
- [Cursor funding](https://techcrunch.com/2025/06/05/cursor-funding) and [Windsurf acquisition](https://www.reuters.com/technology/artificial-intelligence/openai-acquire-coding-assistant-windsurf-2025-05-06/) — commercial agent context (generic references; verify with a fresh search before quoting specific dollar amounts).
- [All Hands AI seed round reporting](https://techcrunch.com/2024/03/24/openhands-ai-formerly-opendevin-raises-5m-seed/) — OpenHands company context.
- Paired internal docs: [`opentui-vs-silvery.md`](./opentui-vs-silvery.md), [`opentui-opencode.md`](./opentui-opencode.md), [`anomaly-company.md`](./anomaly-company.md), [`svelte-vue-tui-options.md`](./svelte-vue-tui-options.md).

Stars, ARR, funding rounds, and launch claims all move fast. Treat specific numbers as 2026-04-20 snapshots, not durable facts.
