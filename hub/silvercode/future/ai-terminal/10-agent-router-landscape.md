# Agent router landscape — meta-harnesses that wrap other agent CLIs

**Status**: 2026-04-26 — research dump from a deep-dive into nine projects that wrap, route, or front *other* agent CLIs (Claude Code, codex-cli, aider, gemini-cli, opencode, etc.) rather than implementing their own agent loop. Companion to [09-agent-host-landscape.md](09-agent-host-landscape.md), which covers agent hosts (own-loop). This doc covers agent **routers / meta-orchestrators / gateways** (delegated-loop).

**Why this exists**: 02-agent-integration.md previously claimed "Nobody important wraps someone else's TUI — that path is dead." That's true at the *agent-host* layer (Cline, Continue, opencode, aider, Cursor — all SDK-direct). It is **demonstrably wrong at the meta-orchestrator layer**: as of 2026 there are at least seven shipping projects whose value proposition is exactly "spawn other agent CLIs and front them with our UX." This doc is the corrective.

---

## MECE taxonomy

Two orthogonal axes. Together they classify everything in the agent-tooling stack.

**Axis 1 — Loop ownership**

- **L1 (own loop)**: the project implements `prompt → model call → parse tool calls → execute tools → iterate`.
- **L2 (delegated loop)**: the project spawns another process that owns the loop.

**Axis 2 — How it reaches the model**

- **B1 (HTTP/SDK)**: direct calls to model provider APIs (Anthropic, OpenAI, Google, Bedrock, OpenRouter, …).
- **B2 (subprocess agent CLI)**: spawns an agent binary (`claude`, `codex`, `aider`, `gemini`, `opencode`, …) and talks over stdio/pty/sideband.
- **B3 (inverted MCP)**: itself is an MCP server consumed *by* agents over JSON-RPC stdio.

**The cells:**

|              | B1 HTTP/SDK                                                                                                                       | B2 Subprocess CLI                                                                                            | B3 Inverted MCP                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| L1 own       | Type M — agent hosts (Claude Code, Cline, opencode, aider, Continue, Cursor, Copilot, sketch, maige, pi-mono, hermes-agent today) | impossible by definition                                                                                     | impossible by definition                       |
| L2 delegated | rare oddity¹                                                                                                                      | Type A — agent routers (OpenClaw, claude-squad, opcode, vibe-kanban, happy, conductor, hermes-agent planned) | Type R — agent-side primitives (container-use) |

¹ A delegated-loop process talking only to model APIs would just be a thin proxy/gateway — present in the wild as model-routing layers (LiteLLM proxy, Helicone, OpenRouter), but those don't run an agent loop, they just shuttle bytes. Out of scope here.

**This doc covers Type A and Type R.** [09-agent-host-landscape.md](09-agent-host-landscape.md) covers Type M.

---

## Type-A subspecies — by transport

Within Type A the meaningful split is *how* the harness talks to the wrapped CLI. Four subspecies, three observed in production, one only on a roadmap:

- **A1 — stream-json parser**: spawn with `--output-format stream-json` (or codex/gemini equivalent), parse JSONL line-by-line. *Practitioners*: OpenClaw, opcode, vibe-kanban.
- **A2 — PTY + screen-scrape**: launch the agent inside tmux/PTY, read the rendered terminal grid back, detect prompts via substring matching against English UI strings. *Practitioner*: claude-squad.
- **A3 — fd3 sideband + inherited TTY**: stdio 0/1/2 inherit (user keeps a real terminal), structured events flow on a side file descriptor. *Practitioner*: happy.
- **A4 — PTY + ACP (Agent Client Protocol)**: PTY for fallback, but prefer Zed's ACP over stdio/NDJSON when the agent supports it. *Roadmap only*: hermes-agent issues #413, #5257.

Sub-patterns differ in fragility, fidelity, and how much the wrapped CLI's UI changes break the wrapper. See § Pattern emerging? below for the analysis.

---

## Per-project deep dives

### A1 stream-json — the de-facto pattern

#### OpenClaw (Type A) — github.com/openclaw/openclaw

- **Purpose**: messaging gateway. WhatsApp/Telegram/Slack/Discord/iMessage/etc. → Claude Code / codex / gemini-cli / pi.
- **Transport**: subprocess + `--output-format stream-json`. Helpers in `src/agents/cli-runner/{prepare,execute}.ts`.
- **Backend matrix**: declarative — one `cli-backend.ts` config per vendor in `extensions/<vendor>/`. Shape: `{ command, args, modelArg, sessionArg, output: "jsonl", input: "stdin", bundleMcp, bundleMcpMode, sessionArgs?, resumeArgs }`. Adding a backend is a config file, not new code paths.
- **Data shape**: `EmbeddedPiRunResult { payloads, meta: { agentMeta: { sessionId, usage, cliSessionBinding }, executionTrace: { winnerProvider, winnerModel, attempts, fallbackUsed }, requestShaping, completion, systemPromptReport } }`. The trace is the most fully-developed normalized event shape of any project surveyed.
- **Session**: passes `--session-id <uuid>` on first turn; stores the id; uses `resumeArgs: ["--resume", "{sessionId}"]` on follow-ups. Templated placeholder substitution.
- **Auth**: rotation across `auth-profiles/` — injects whichever of `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `AI_GATEWAY_API_KEY`, `ANTHROPIC_BASE_URL` the backend declared into the child env. Sanitized via `sanitizeHostExecEnv` so unrelated host secrets don't leak.
- **MCP**: bundled into a Claude config file (`bundleMcpMode: "claude-config-file"`) and handed to the child via the appropriate flag. Per-backend.
- **Cleanness**: cleanest seam in the field. Per-backend = ~50–150 lines of declarative config. The runner is generic.
- **Layer**: gateway / control plane. No UI of its own — channels are the UI.

#### opcode (Type A) — github.com/winfunc/opcode (formerly Claudia)

- **Purpose**: desktop GUI shell over Claude Code. Tauri 2 + React + Rust.
- **Transport**: `tokio::process::Command` with piped stdio + `--output-format stream-json`. No PTY. `src-tauri/src/commands/claude.rs`.
- **Backend matrix**: Claude Code only and deeply wired. `commands/{claude,agents,mcp,proxy,slash_commands}.rs` are all Claude-specific. No abstraction layer — adding codex would mean cloning `claude.rs`.
- **Data shape**: forwards raw Claude Code stream-json events to the frontend largely as-is. Sniffs `msg.type === "system" && msg.subtype === "init"` to extract `session_id`. Process layer: `ProcessHandle { child: Arc<Mutex<Option<Child>>>, live_output: Arc<Mutex<String>> }`.
- **Session**: uses Claude Code's own session-id; functions `execute_claude_code`, `continue_claude_code`, `resume_claude_code`.
- **Auth**: inherits user env. No injection.
- **MCP**: Claude's own MCP config used as-is.
- **Cleanness**: thin — the wrapping itself is small (~few hundred LOC). All the substance is the desktop UI.
- **Layer**: native desktop chrome over a single agent CLI.

#### vibe-kanban (Type A — but **sunsetting**) — github.com/BloopAI/vibe-kanban

- **Purpose**: kanban board + per-task git worktrees, agent-runs-the-card. Rust core, TS frontend.
- **Transport**: `tokio::process::Command` + piped stdio + `--output-format=stream-json` + `--input-format=stream-json` for Claude. No PTY.
- **Backend matrix**: **most ambitious in the field, and why it's sunsetting**. A `StandardCodingAgentExecutor` Rust trait (`crates/executors/src/executors/`) with hand-written impls per backend: `claude.rs` (~2,200 LOC), `cursor.rs` (~1,300 LOC), plus `codex.rs`, `gemini.rs`, `droid.rs`, `copilot.rs`, `opencode.rs`, `qwen.rs`, `amp.rs`, `qa_mock.rs`. Average ~1,500 LOC per executor. Trait surface: `spawn`, `spawn_follow_up`, `normalize_logs`, `discover_options`, `get_preset_options`.
- **Data shape**: layered. Per-agent raw enum (e.g. `ClaudeJson { System, Assistant, User, ToolUse, Result, StreamEvent }`) → shared `NormalizedEntry { entry_type: ToolUse | AssistantMessage | Thinking | … }` → `ConversationPatch` (JSON patches over conversation state). Cursor has its own `CursorJson` / `CursorToolCall`.
- **Cleanness**: typed and disciplined, but **bespoke at scale**. Each new agent is 1–2k LOC of Rust, by hand.
- **Lesson**: the project is winding down with this taxonomy still in place. Polymorphic-typed-adapter-per-CLI is the *most* opinionated answer; it's also the most expensive to keep current as upstream CLIs change their schemas.

### A2 PTY + screen-scrape — the cautionary tale

#### claude-squad (Type A) — github.com/smtg-ai/claude-squad

- **Purpose**: Go TUI to manage parallel agent runs in tmux + git worktrees. ~7.2k stars.
- **Transport**: tmux + screen scraping. **Does not use stream-json.** `tmux new-session -d -s <n> -c <wd> <program>` then `tmux capture-pane -p -e -J -t <n>` to read rendered output. Stdin forwarded; Ctrl-Q intercepts as detach.
- **Prompt detection** (literal substring matching against captured pane content):
  - Claude trust: `"Do you trust the files in this folder?"`, `"new MCP server"`
  - Aider: `"Open documentation url for more info"`, `"(Y)es/(N)o/(D)on't ask again"`
  - Gemini: `"Yes, allow once"`
- **Change detection**: SHA-256 of pane content.
- **Backend matrix**: three hard-coded constants (`ProgramClaude = "claude"`, `ProgramAider = "aider"`, `ProgramGemini = "gemini"`) + free-form `Program` string for "anything else, no auto-yes." Backend-awareness scattered as `if strings.HasSuffix(program, ProgramClaude)` in tmux helpers.
- **Data shape**: there isn't one. Domain object is `Instance { Title, Path, Branch, Program, Status: Running|Ready|Loading|Paused, tmuxSession, gitWorktree, diffStats, AutoYes }`. The "event" surface is `HasUpdated() (updated, hasPrompt bool)`. Cannot extract structured tool calls or token counts — the screen doesn't have them.
- **Session**: tmux persistence; `Resume()` reattaches. Does **not** use Claude `--session-id` / `--resume`.
- **Auth/MCP**: inherits env; sources `.bashrc`/`.zshrc` to resolve aliases. No injection.
- **Cleanness**: ~1.5–2k LOC of harness logic, no clear backend-adapter seam.
- **Lesson**: PTY-scrape with English-string substring matching is fragile — any UI string change in the wrapped CLI breaks detection. It is also the most user-faithful reproduction of the agent's UI, because it just shows you the original. Trade-off is honest.

### A3 fd3 sideband — the clever outlier

#### happy (Type A) — github.com/slopus/happy + happy-cli

- **Purpose**: control your local Claude Code session from your phone. End-to-end encrypted relay.
- **Transport**: **dual-channel**. Spawns Claude Code with `stdio: ['inherit', 'inherit', 'inherit', 'pipe']`. Stdio 0/1/2 inherit (user sees a normal Claude Code TTY); fd 3 carries structured events parsed by `createInterface({ input: child.stdio[3] })`. Message types include `fetch-start` / `fetch-end` for thinking-state tracking with 500ms debounce.
- **Backend matrix**: per-agent directories (`src/claude/`, `src/codex/`, `src/gemini/`) — separate code paths, not a unified adapter.
- **Data shape**: `LauncherResult = { type: 'switch' } | { type: 'exit'; code: number }`. Higher-level `{ permissionMode, model, fallbackModel, allowedTools, disallowedTools, customSystemPrompt, appendSystemPrompt }`. Messages flow through `MessageQueue2<EnhancedMode>` + `session.sendClaudeSessionMessage()`.
- **Cleanness**: bespoke. ~280 LOC `claudeLocal`, ~550 LOC `runClaude`, separate `claudeRemoteLauncher`. Dual local/remote launcher.
- **Lesson**: the only project surveyed that lets the local user keep using Claude Code natively while mirroring state elsewhere. Almost no one else has tried this shape.

### A4 — ACP as transport (shipping)

ACP (Zed's Agent Client Protocol) has crossed from "interesting standard" to "shipping wire format" in the last few months. Type-A projects on ACP exist *today*, not just on roadmaps.

#### OpenACP (Type A, ACP wire) — github.com/Open-ACP/OpenACP, npm `@openacp/cli`

- **Purpose**: self-hosted bridge connecting AI coding agents to Telegram / Discord / Slack. **Direct architectural peer of OpenClaw**, but on ACP rather than stream-json.
- **Transport**: ACP JSON-RPC 2.0 over stdio. Uses the **ACP Registry** (`agentclientprotocol.com/get-started/registry`) for agent discovery — the registry is the canonical place to declare an ACP-speaking agent and lets clients enumerate them programmatically.
- **Backend matrix**: any agent in the ACP Registry. README claims "28+ agents" supported including Claude Code, Codex, Gemini, Cursor, Goose, opencode. Adding a backend is a registry entry, not custom code.
- **Layer**: messaging gateway. Same product shape as OpenClaw, fundamentally different transport choice.
- **Auth**: bring-your-own — agents authenticate as the user; OpenACP just relays.
- **Cleanness**: thin. Bridges JSON-RPC (ACP side) to chat-platform APIs (Telegram/Discord/Slack side). Most logic is per-platform message rendering, not per-agent integration. Per-agent code is ~zero — adding Cursor support is "Cursor publishes their ACP server, register it, done."

This is the existence proof that **ACP-based Type A is production-viable today**. The doc's earlier "if hermes-agent ships ACP wrapping" framing was stale within months of being written.

#### pi-acp adapters (community-built, fill the gap badlogic left)

After badlogic closed PRs #241 and #836 with the recommendation "build it externally on top of pi's RPC mode," at least four community adapters appeared:

- **`pi-acp`** — `npm i pi-acp` (svkozak) — spawns `pi --mode rpc` as a subprocess and bridges RPC ↔ ACP. *This is the architecture badlogic explicitly recommended*: external bridge, not in-tree.
- **`@victor-software-house/pi-acp`** — embeds pi via the `@mariozechner/pi-coding-agent` SDK directly (in-process). Richer feature set: ACP `agent_thought_chunk` for thinking, structured diffs on `edit`/`write`, multi-session, `usage_update`, slash commands, `unstable_resumeSession`, ACP `configOptions` for model + thinking-level selection.
- **`gsd-pi-acp`** + **`@zoumo/gsd-pi-acp`** — dual-backend (gsd + pi).
- **`@oh-my-pi/pi-coding-agent`** — full fork (different lineage; `can1357`'s `oh-my-pi` repo).

The architectural split between `pi-acp` (external process bridge) and `@victor-software-house/pi-acp` (in-process SDK embed) is itself a useful study: same goal, two valid implementations. Bridge is simpler and works with any pi version; SDK-embed gets richer ACP feature mapping but tracks pi's API surface.

#### hermes-agent (Type M today, Type A planned) — github.com/NousResearch/hermes-agent · hermes-agent.nousresearch.com

- **Today**: Type M. Ink TUI (`ui-tui/`, `tui_gateway/`, `hermes_cli/`, `agent/`), own loop, model-agnostic. Provider matrix: Nous Portal, OpenRouter, Anthropic, OpenAI-compatible, Bedrock, vLLM, etc. Six terminal-execution backends: local, Docker, SSH, Daytona, Singularity, Modal.
- **Disambiguation**: **not** Nous Hermes the LLM. Different artifact. The agent framework is model-agnostic.
- **Planned (issues #413, #5257)**: cross-CLI orchestration via PTY OR (preferred) ACP. Targets: Claude Code, codex, gemini, aider, goose, opencode. Less novel than it looked at first — OpenACP already does the ACP-router shape; hermes-agent's distinguishing axis is its execution-environment matrix (Daytona/Modal/Singularity), not its transport.

### The ACP wrapper ecosystem (shipping today)

**Zed ACP Registry — 25 ACP-speaking agents shipping as of 2026-04-26** (verified from the in-Zed Registry browser). Far broader than the 7 that surfaced in earlier adoption research. Not all are equally polished, but the breadth of vendors implementing ACP is a stronger ecosystem signal than the research initially credited.

| Agent          | Registry ID        | Version    | What it is                                                                                                            |
| -------------- | ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Amp            | amp-acp            | 0.7.0      | ACP wrapper for Amp (Sourcegraph's frontier coding agent)                                                             |
| Auggie CLI     | auggie             | 0.24.0     | Augment Code's coding agent                                                                                           |
| Autohand Code  | autohand           | 0.2.1      | Autohand AI coding agent                                                                                              |
| Claude Agent   | claude-acp         | 0.31.8     | ACP wrapper for Anthropic's Claude (the @agentclientprotocol/claude-agent-acp package — Zed-published, not Anthropic) |
| Cline          | cline              | 2.17.0     | OSS autonomous coding agent (newly ACP-native)                                                                        |
| Codebuddy Code | codebuddy-code     | 2.93.6     | Tencent Cloud's official coding agent                                                                                 |
| Codex CLI      | codex-acp          | 0.12.0     | ACP adapter for OpenAI Codex (the @zed-industries/codex-acp package)                                                  |
| Corust Agent   | corust-agent       | 0.5.1      | Rust-focused coding agent                                                                                             |
| crow-cli       | crow-cli           | 0.1.20     | Minimal ACP-native coding agent                                                                                       |
| Cursor         | cursor             | 2026.03.30 | Cursor's coding agent (no longer "in progress" — shipping)                                                            |
| DeepAgents     | deepagents         | 0.1.7      | Batteries-included AI coding + general-purpose agent                                                                  |
| Factory Droid  | factory-droid      | 0.108.1    | Factory AI's coding agent                                                                                             |
| Gemini CLI     | gemini             | 0.39.1     | Google's official CLI for Gemini                                                                                      |
| Github Copilot | github-copilot-cli | 1.0.36     | GitHub's AI pair programmer                                                                                           |
| goose          | goose              | 1.32.0     | Square's open-source extensible AI agent                                                                              |
| Junie          | junie              | 1417.47.0  | JetBrains' AI coding agent                                                                                            |
| Kilo           | kilo               | 7.2.24     | Open-source coding agent                                                                                              |
| Kimi CLI       | kimi               | 1.39.0     | Moonshot AI's coding assistant                                                                                        |
| Mistral Vibe   | mistral-vibe       | 2.8.1      | Mistral AI's open-source coding assistant                                                                             |
| Nova           | nova               | 1.0.180    | Compass AI's "fully-fledged software engineer" agent                                                                  |
| OpenCode       | opencode           | 1.14.25    | sst/opencode (the visual-parity target — also an agent)                                                               |
| Pi ACP         | pi-acp             | 0.8.26     | ACP adapter for pi (badlogic's coding agent)                                                                          |
| Qoder CLI      | qoder              | 0.1.48     | Qoder's agentic coding agent                                                                                          |
| Qwen Code      | qwen-code          | 0.15.3     | Alibaba's Qwen coding assistant                                                                                       |
| Stakpak        | stakpak            | 3.74       | Rust-based DevOps agent with enterprise security                                                                      |

Coverage by vendor category:

- **Frontier-model wrappers** (use Anthropic/OpenAI/Google APIs): Claude Agent, Codex CLI, Gemini CLI
- **Major IDE / IDE-vendor agents**: Cursor, Junie (JetBrains), Cline, Github Copilot, Auggie (Augment Code)
- **OSS/general agents**: goose (Square), OpenCode (sst), Cline, Kilo, crow-cli
- **Cloud-vendor agents**: Codebuddy (Tencent), Qwen Code (Alibaba), Kimi (Moonshot)
- **Specialized**: Stakpak (DevOps/Rust), Corust (Rust), Factory Droid, Nova, DeepAgents, Mistral Vibe, Amp, Autohand, Qoder
- **Community wrappers**: Pi ACP (third-party for pi-mono since badlogic declined first-party)

Plus the supporting npm ecosystem:

| Package                               | Direction       | What                                                                                                                                                                   |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @agentclientprotocol/sdk              | both            | Official ACP TypeScript SDK — schemas, JSON-RPC plumbing                                                                                                               |
| @agentclientprotocol/claude-agent-acp | server          | ACP server backed by @anthropic-ai/claude-agent-sdk. Tool calls, permissions, edit review, todos, interactive+background terminals, slash commands, client MCP servers |
| @zed-industries/codex-acp             | server          | ACP server for OpenAI Codex                                                                                                                                            |
| pi-acp                                | server          | ACP server for pi via pi --mode rpc bridge                                                                                                                             |
| @victor-software-house/pi-acp         | server          | ACP server for pi via SDK embed                                                                                                                                        |
| acpx                                  | client          | Headless ACP CLI — talk to any ACP server                                                                                                                              |
| @openacp/cli                          | client + bridge | Type-A-via-ACP messaging gateway (Telegram/Discord/Slack)                                                                                                              |

**Implication for silvercode** (recalibration of the earlier verdict):

The adoption-sentiment research said "ACP at the boundary, not as canonical, until Zed reaches 100% spec coverage AND protocolVersion bumps to 2." That guidance still holds for the *type surface* (SDK type churn is real). But the **agent-side adoption breadth** is materially stronger than the research suggested:

- Anthropic, OpenAI, Google, Microsoft, JetBrains, Alibaba, Tencent, Mistral, Moonshot, Cursor, Sourcegraph, Augment, Square, sst — most of the major frontier-model and IDE vendors have shipping ACP servers.
- Multiple community community implementations for vendors that haven't shipped first-party (pi-acp).
- A new Type-A project starting today can `npm i @agentclientprotocol/sdk` and immediately consume 25 agents via one parser. Per-vendor adapter cost for ACP-speaking agents goes to **zero**.

**Stream-json adapters are still needed for**: Claude Code in stream-json mode (when the user doesn't have `claude-agent-acp` installed), and the few legacy paths. But the bulk of silvercode's wrapped-agent surface is reachable via ACP today.

**Subscription-plan auth caveat — re-verified 2026-04-26**: each Registry agent inherits its underlying CLI's auth model, but Anthropic's `claude-agent-acp` *explicitly blocks* Claude.ai subscription accounts (`dist/acp-agent.js:1360` throws `"This integration does not support using claude.ai subscriptions."`). The Claude Agent SDK that `claude-agent-acp` wraps requires API billing for programmatic use; subscription quota is reserved for Claude Code's interactive surfaces. So **for Claude with Pro / Max subscriptions, no Registry-shipping ACP server works** — silvercode has to build its own ACP wrapper around the `claude` binary's stream-json mode.

**Other binary-wrap ACP packages exist but are abandoned**:

- `claude-code-acp@0.1.1` (carlrannaberg/cc-acp) — wraps `@anthropic-ai/claude-code` (the binary) instead of `@anthropic-ai/claude-agent-sdk`. Source contains explicit subscription-auth strings: `"Validating Claude Code subscription authentication"`, `"subscription authentication validated successfully"`, `"subscription login or CLAUDE_API_KEY"`. Architecturally proves the pattern works. **But abandoned**: 1★, 1 fork, single contributor, last commit 2025-09-03 (8 months stale).
- `claude-code-acp-agent@0.1.0` — single version, also wraps `@anthropic-ai/claude-code`, also abandoned (2025-08-28).
- Active forks of `claude-agent-acp` (`@sudocode-ai/claude-code-acp`, `claude-code-acp-ts`) all inherit the subscription block.

**Per-vendor subscription support — verified 2026-04-26 from package READMEs and source**. Anthropic is the outlier; others are fine:

| Vendor  | ACP path                                              | Subscription auth                                         | Verified from                                                                                                       |
| ------- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Claude  | @agentclientprotocol/claude-agent-acp                 | ❌ blocked at init                                         | dist/acp-agent.js:1360 throws on account.subscriptionType                                                           |
| Codex   | @zed-industries/codex-acp                             | ✅ "ChatGPT subscription" first-class                      | README explicitly lists it as auth method (caveat: doesn't work in remote projects — needs local browser for OAuth) |
| Gemini  | @google/gemini-cli (built-in ACP, registry id gemini) | ✅ "Sign in with Google" OAuth                             | README: free tier 60 req/min + 1000 req/day, no API key needed                                                      |
| Copilot | @github/copilot (registry id github-copilot-cli)      | ✅ Copilot subscription required                           | README: "active Copilot subscription" + /login GitHub auth                                                          |
| Pi      | pi-acp (third-party)                                  | ✅ pi's own provider config (auth unaffected by ACP layer) | n/a                                                                                                                 |

This means **silvercode's custom-wrapper work is only needed for Claude**. For Codex (ChatGPT Plus/Pro), Gemini (Google), Copilot (GitHub Copilot), and pi — silvercode just consumes the existing Registry packages. The custom adapters (`acp-adapter-codex`, `acp-adapter-gemini`) are **not just "likely redundant" — they are redundant for subscription users**. silvercode loads them only as fallbacks for users with API keys who don't want to install the Registry ACP wrappers.

- **Codex / `@zed-industries/codex-acp`** — likely similar restriction (unverified); ChatGPT Plus / Pro subscription quota may be reserved for OpenAI's own surfaces
- **Gemini CLI / first-party `gemini` ACP** — likely works with Google account login (Cloud Code Assist free tier is the same auth path either way; unverified for paid Gemini Advanced)
- **Pi / `pi-acp`** — pi handles its own provider config; auth unaffected by ACP wrapping
- **Other Registry agents** — vendor-by-vendor

This **inverts the earlier "stream-json adapter is fast-fallback only" framing**. For Claude with subscription auth, **silvercode must build its own ACP wrapper around the `claude` binary's stream-json mode** — no maintained Registry alternative exists.

#### Recommended path — internal-first, extract later

Three architectural choices:

**Option A — silvercode-internal stream-json → ACP-types adapter**. Inside silvercode's process. Spawns `claude -p --output-format stream-json --include-partial-messages`, parses JSONL, emits silvercode's ACP-shaped types directly. No extra child process, no extra npm package. silvercode components see ACP-typed events from day 1.

**Option B — `silvercode-claude-acp` standalone npm package**. Same code, wrapped in `AgentSideConnection` from `@agentclientprotocol/sdk`. Exposed as a Type-A4 ACP server consumable by silvercode (via `npx`), Zed, Neovim, OpenACP. Submittable to Zed's ACP Registry. ~50 LOC of additional packaging on top of Option A. Community good; bigger maintenance commitment.

**Option C (recommended) — internal first, extract later**. Start with Option A (~few-hundred-LOC adapter inside silvercode). If it stabilizes and external consumers want it, extract to `silvercode-claude-acp` as a published package without changing silvercode's consumption path. Lowest commitment, preserves option value, doesn't gate silvercode on external maintenance burden.

The architecture is identical between A and B — same parser, same translator, same output types. Extraction is mostly packaging.

**Architecture sketch** (Option A; becomes B by wrapping in AgentSideConnection):

```ts
async function spawnClaudeAsAcpSession(scope: Scope, opts: ClaudeOpts): Promise<AcpSession> {
  const child = scope.use(Bun.spawn([
    "claude",
    "-p", "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--setting-sources", "user",
    "--permission-mode", "bypassPermissions",
    ...(opts.sessionId ? ["--resume", opts.sessionId] : ["--session-id", crypto.randomUUID()]),
    ...(opts.model ? ["--model", opts.model] : []),
  ], {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...sanitizeEnv(process.env),
      // Subscription auth flows through Claude Code's own gate:
      //   CLAUDE_CODE_OAUTH_TOKEN if set (Pro/Max)
      //   ANTHROPIC_API_KEY if set (API billing)
      //   ~/.claude/auth.json fallback (whatever `claude login` set up)
    },
  }));

  const session = createAcpSession(scope, /* ... */);

  for await (const line of readLines(child.stdout)) {
    const msg = JSON.parse(line);
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") session.id.set(msg.session_id);
        break;
      case "assistant":
        for (const block of msg.message.content) {
          if (block.type === "text")
            session.apply({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: block.text } });
          else if (block.type === "thinking")
            session.apply({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: block.thinking } });
          else if (block.type === "tool_use")
            session.apply({ sessionUpdate: "tool_call", toolCallId: block.id, kind: kindOf(block.name), title: titleOf(block), status: "pending", /* ... */ });
        }
        break;
      case "user":  // tool results
        for (const block of msg.message.content) {
          if (block.type === "tool_result")
            session.apply({ sessionUpdate: "tool_call_update", toolCallId: block.tool_use_id, status: "completed", content: contentOf(block) });
        }
        break;
      case "result":
        // PromptResponse { stopReason }
        break;
    }
  }

  return session;
}
```

Turn it into Option B by wrapping in `AgentSideConnection` and serializing each `session.apply(...)` as a JSON-RPC `session/update` notification — ~50 lines of glue.

**Reference for prior art**: carlrannaberg's abandoned `cc-acp@0.1.1` is the closest published implementation; its source confirms the binary-wrap subscription path works (substrings: *"Validating Claude Code subscription authentication"*, *"subscription authentication validated successfully"*). Worth reading the repo before building — but don't depend on the npm package (8 months stale, single contributor).

#### ACP fake — a deterministic test double for the foundation

silvercode needs a **fake ACP server / fake AcpSession** that produces scriptable `SessionUpdate` sequences without spawning real CLIs. This lives alongside the foundation work, not after it.

**Why it earns its place**:

- **Deterministic component testing**. Storybook stories drive component states by feeding scripted ACP events. No flaky network calls, no LLM nondeterminism.
- **Adapter regression tests**. The stream-json → ACP boundary adapter (`acp-adapter-claude`) has a finite transformation surface; the fake plays back recorded JSONL fixtures and asserts the resulting SessionUpdate stream matches a golden file. Tape-driven.
- **Cross-agent orchestration tests**. Multi-agent scenarios need deterministic peer behavior; a fake makes "what if codex finishes before claude" testable.
- **Permission-flow tests**. Drive `RequestPermission` deterministically; assert silvercode's permission-policy projection.
- **Capability-gate tests**. Fake initialize-response with various `AgentCapabilities` combinations; assert silvercode's UI mounts/unmounts the right components.
- **Storybook fixtures**. Every story needs canned ACP data; the fake is the canonical fixture player.

**Two layers, both shipped together**:

**Layer 1 — `createFakeAcpSession({ script })`** — silvercode-internal. Returns an `AcpSession` whose signals fire from a scripted sequence of `SessionUpdate`s. Drop-in for `createAcpSession` in tests. Same shape, different driver.

```ts
const session = createFakeAcpSession(scope, {
  script: [
    { delayMs: 50, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Reading file..." } } },
    { delayMs: 200, update: { sessionUpdate: "tool_call", toolCallId: "t1", kind: "read", title: "Read src/auth.ts", status: "pending" } },
    { delayMs: 800, update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed", content: [{ type: "content", content: { type: "text", text: "/* auth.ts contents */" } }] } },
    { delayMs: 100, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Found a bug at line 42." } } },
  ],
  permissionPolicy: "auto-approve", // or "always-deny", or scripted decisions
  fsHandler: { /* canned file contents for fs/read_text_file */ },
});
```

**Layer 2 — `silvercode-acp-fake` standalone binary** — wraps Layer 1 in `AgentSideConnection` from `@agentclientprotocol/sdk`, exposed as a real ACP server over stdio. Lets silvercode's *real* `connectAcp` factory talk to a fake on the other side of the wire — full end-to-end test coverage of the JSON-RPC layer, capability negotiation, and connection lifecycle.

```bash
silvercode-acp-fake --script ./fixtures/edit-file-with-permission.json
# binary speaks ACP JSON-RPC on stdio; replays the scripted scenario when prompted
```

**Recordable + replayable**: the fake's script format matches real-session captures. Run silvercode against a real Claude session with `RECORD=1`, capture all `SessionUpdate`s + `RequestPermission` calls + `fs/*` requests as a JSON script. Replay the script through the fake in tests. Same primitive that powers silvery's `mdtest` tape replay, applied to ACP.

**Bead**: `km-silvercode.acp-fake` — Layer 1 alongside the foundation; Layer 2 follows the storybook bead.

### A5 — `WORKFLOW.md`-driven daemons (Symphony, 2026-03)

#### Symphony — github.com/openai/symphony

- **Vendor**: OpenAI; open-sourced 2026-03-05; reference impl in Elixir/BEAM, spec language-agnostic; Apache-2.0.
- **Shape**: long-running daemon that polls Linear for active issues, creates an isolated per-issue git workspace, spawns Codex inside it via `codex` app-server protocol, retires on terminal state. Bounded concurrency, retry queue, reconciliation tick. No human-in-the-loop per-issue; the issue tracker is the only operator surface.
- **Policy contract**: `WORKFLOW.md` in the repo — YAML front matter (`tracker`, `polling`, `workspace`, `hooks`, `agent`, `codex`) + Markdown prompt body. Lifecycle hooks (`after_create / before_run / after_run / before_remove`) are shell scripts. The repo owns the dispatch contract.
- **Loop ownership**: L2 (delegated to Codex via `codex` app-server protocol). Spawns one Codex session per active issue; tracks `<thread_id>-<turn_id>` plus token totals.
- **Transport**: subprocess of `codex` (vendor-specific app-server stream). Architecturally closer to A1 (stream-json subprocess) than A4 (ACP), but the `WORKFLOW.md`-as-repo-contract layer is genuinely new — it elevates the workflow prompt + runtime config into a versioned artifact, decoupled from any orchestrator runtime.
- **Status surface**: SPEC marks it OPTIONAL. Daemon runs headless; PR/comment writes happen *through Codex* using its own tool surface.
- **Verdict**: distinct subspecies — A5 in this taxonomy. Not a router (single backend, not a CLI multiplexer); not a host (no UI). It's a **dispatcher over a workflow-as-data contract**. The `WORKFLOW.md` pattern is worth stealing; the Linear-only / Codex-only / Elixir-only stack is not.
- **Under the km-as-workspace frame**: Symphony is a *runtime* that reads km plans as data and writes outcomes back into the workspace. The natural km expression: bead board with `workflow` facet → KNode with `workflow` facet (config + prompt) → `bun worktree` per claimed bead → silvercode pane bound to the worktree → tribe room for status events. km doesn't compete with Symphony; km is the workspace where the artifacts Symphony executes against live, and where the runtime's progress is rendered.

### A6 — heartbeat-driven control plane (multi-adapter, 2026)

#### Paperclip — github.com/paperclipai/paperclip

- **Vendor**: paperclipai org. MIT. Sibling to OpenClaw (same ecosystem; framing line *"If OpenClaw is an employee, Paperclip is the company"*). Node.js server + React/mobile dashboard.
- **Shape**: long-running control plane that turns BYO-agents into employees in an org chart. Cron-like heartbeat protocol wakes each agent on schedule; agent fetches assigned tickets via REST, runs to completion, exits. Persistent agent state across heartbeats; atomic ticket checkout (no double-work); per-agent monthly budgets with hard stops; board-style approval gates; multi-company isolation.
- **Loop ownership**: L2. Each heartbeat spawns the agent in one of several adapter shapes (see below).
- **Transport — eight adapters spanning A1, A4, A5-style HTTP webhooks** (`packages/adapters/`):
  - `claude-local` — `claude --print - --output-format stream-json --verbose` (A1). Subscription via `CLAUDE_CODE_OAUTH_TOKEN`, API via `ANTHROPIC_API_KEY`, Bedrock branch via `CLAUDE_CODE_USE_BEDROCK`. Typed failure detectors: `parseClaudeStreamJson`, `describeClaudeFailure`, `detectClaudeLoginRequired`, `extractClaudeRetryNotBefore`, `isClaudeMaxTurnsResult`, `isClaudeTransientUpstreamError`, `isClaudeUnknownSessionError`. Resolver `resolveClaudeBillingType()` returns `subscription | api | metered_api`.
  - `codex-local`, `gemini-local`, `cursor-local`, `pi-local`, `opencode-local` — A1 stream-json variants per vendor.
  - `acpx-local` — A4 ACP, wraps `claude-agent-acp` + `codex-acp`.
  - `openclaw-gateway` — HTTP webhook adapter into OpenClaw (their messaging gateway).
  - `http` / `process` — generic adapters in `cli/src/adapters/`.
- **Heartbeat protocol** (`docs/guides/agent-developer/heartbeat-protocol.md`): 9-step REST contract. `GET /api/agents/me` → handle approval if `PAPERCLIP_APPROVAL_ID` set → `GET /api/companies/{id}/issues?assigneeAgentId={you}&status=...` → priority pick → `POST /api/issues/{id}/checkout` (atomic CAS, `X-Paperclip-Run-Id` header, **never retry on 409**) → read context + comments → do the work → `PATCH /api/issues/{id} {status, comment}` → optionally delegate via `POST /api/companies/{id}/issues` with `parentId` + `goalId`. `request_confirmation` interactions for explicit yes/no decisions instead of asking in markdown.
- **Adapter-utils library** (`@paperclipai/adapter-utils`): the cleanest reusable piece. Owns the multi-target execution abstraction (`execution-target.ts`, `sandbox-managed-runtime.ts`, `remote-managed-runtime.ts`, `ssh.ts`, `sandbox-callback-bridge.ts`), skill materialization with content fingerprints, billing tier resolution, structured failure typology, auth-profile rotation. Local / Docker / SSH / sandbox / remote-Paperclip-bridge as a uniform target — `runAdapterExecutionTargetProcess()` is the same call for all of them.
- **Run liveness**: separate from issue status. `completed`, `advanced`, `plan_only`, `empty_response`, `blocked`, `failed`, `needs_followup`. Only `plan_only` and `empty_response` enqueue bounded continuation wakes. Workspace provisioning alone doesn't count as concrete progress.
- **What's around the agent**: org chart (titles, reporting lines, roles), atomic ticket checkout with execution locks, monthly $ budgets per agent with hard stops, board approval workflows, multi-company isolation, routines/cron, audit log. Identity gates: trusted-local OR authenticated mode, board users, agent API keys, short-lived run JWTs, company memberships, invite flows.
- **Status surface**: web + mobile dashboard ("manage your business goals, not pull requests"). 24/7 autonomous; user is the board.
- **Verdict**: distinct subspecies — **A6 in this taxonomy**. Not a router (governance + scheduling > multiplexing); not a host (UI is dashboard, not pane host); not Symphony's A5 (multi-adapter, multi-tracker, multi-company). The honest description is *control plane that wraps employees as a company*. Transport is multi-shape; the unifying axis is heartbeat + tickets + governance, not stdio convention.
- **Architectural mismatch with silvercode**: Paperclip's loop is async (heartbeat tickets between exits); silvercode's is sync (live ACP session, permission gating, ambient injection mid-turn). They don't compete — they compose. A future "Paperclip dispatches a silvercode session" wiring uses A2A-shaped HTTP outside (Paperclip → silvercode-as-agent) and ACP inside (silvercode-host ↔ claude-code-subprocess). Two protocols, each at the layer it's shaped for.
- **What silvercode should borrow**: see beads `@km/silvercode/borrow-paperclip-execution-target`, `@km/silvercode/borrow-paperclip-claude-failure-types`, `@km/silvercode/borrow-skills-fingerprint-materialization`. Not the agent-specific adapters (heartbeat-shaped, don't drop into a session host); the **adapter-utils library** is the reusable surface.

### Closed source / unverified

#### Conductor (presumed Type A) — conductor.build

- Mac app by Melty Labs. Spawns Claude Code + codex across git worktrees. Has Checkpoints (snapshot/rollback) and Spotlight (sync to main repo).
- Source not public (`meltylabs/conductor-releases` exists; app source does not). Architectural shape resembles claude-squad's worktree-orchestrator model in a native Mac shell, but transport mechanism, data shape, resume strategy, and backend seam **cannot be confirmed**.
- The team's open-source predecessor `meltylabs/melty` is a different category (chat editor, not CLI harness).

---

## Type R — agent-side primitives (the inverse)

### container-use (Type R) — github.com/dagger/container-use

**This is not an agent harness.** It is the inverse: an MCP server *consumed by* agent CLIs.

- **Direction**: agents (Claude Code, codex, cursor, goose, q) spawn `container-use stdio` as a child and speak JSON-RPC over stdin/stdout. Library: `github.com/mark3labs/mcp-go`.
- **Per-host adapters**: `cmd/container-use/agent/configure_{claude,codex,cursor,goose,q}.go`. Each writes that host's MCP-server registration (e.g. `claude mcp add container-use -- <bin> stdio`). **Cleanest per-host seam in the field** — declarative, ~50–150 LOC each. Worth studying as a model.
- **Tools exposed (13)**: `environment_create/open/list/checkpoint/config/add_service/update_metadata`, `environment_file_{read,write,edit,list,delete}`, `environment_run_cmd`. Domain object is `Environment { *EnvironmentInfo, dag *dagger.Client, Services []*Service, Notes Notes }`.
- **Layer**: per-task isolation primitive. Containers + git branches are the unit of work; the agent's session is the agent's problem.

Included in this survey because the *registration adapter pattern* (one Go file per host) is the cleanest backend-seam example anywhere — but architecturally container-use sits on the other side of the protocol from everything else here.

---

## How does pi-mono fit?

**pi-mono is Type M.** Specifically L1+B1 — own loop, model APIs direct.

- `@mariozechner/pi-ai` — unified multi-provider SDK. Each provider is an HTTP/SDK adapter producing a normalized typed event stream (`AssistantMessageEventStream`). Files at `~/Code/pi-mono/packages/ai/src/providers/`: `anthropic.ts`, `google.ts`, `google-vertex.ts`, `google-gemini-cli.ts`¹, `openai-completions.ts`, `openai-responses.ts`, `openai-codex-responses.ts`, `azure-openai-responses.ts`, `amazon-bedrock.ts`. Each is ~400–800 LOC of vendor-API-specific code that produces the same event-stream type.
- `@mariozechner/pi-agent-core` — agent runtime (tool calling, state management) consuming `pi-ai`'s normalized stream.
- `@mariozechner/pi-coding-agent` — *its own* coding agent built on `pi-agent-core`. Pi does not wrap Claude Code.
- `@mariozechner/pi-mom` — Slack bot delegating to the pi coding agent.

¹ The `google-gemini-cli` provider name is misleading — it is **not** a subprocess wrapper of the gemini-cli binary. It speaks the Cloud Code Assist HTTP endpoint, riding the OAuth token that gemini-cli sets up. Same trick as Claude Code's `CLAUDE_CODE_OAUTH_TOKEN`: piggyback on the CLI's auth, skip the CLI itself. This is **B1 (HTTP) using the CLI as an auth-bootstrap mechanism only** — not B2.

**Closest analog**: pi-ai is to coding agents what LiteLLM is to general LLM apps — a multi-provider SDK. pi-coding-agent is to pi-ai what Claude Code is to the Anthropic SDK — a reference consumer.

**Where pi sits in the family**:

- vs OpenClaw: completely different layer. OpenClaw would *spawn* `pi-coding-agent` as a subprocess backend; pi-coding-agent would never spawn another agent.
- vs Claude Code / opencode / Cline / Continue / aider: same layer (Type M), comparable architectural choices, different model coverage and feature set.
- vs hermes-agent (today): peer Type M, both model-agnostic. pi-mono is broader on model coverage; hermes is broader on execution-environment coverage (Daytona/Modal/Singularity).

---

## Comparison matrix — Type A only

| Project                | Transport        | Backends                                                           | Backend seam                         | Session                 | Auth/MCP                  | Surface                | Cleanness           | LOC/backend  |
| ---------------------- | ---------------- | ------------------------------------------------------------------ | ------------------------------------ | ----------------------- | ------------------------- | ---------------------- | ------------------- | ------------ |
| OpenClaw               | A1 stream-json   | claude-cli, codex-cli, google-gemini-cli, pi (declarative)         | declarative config                   | --session-id + --resume | rotated, injected         | messaging gateway      | clean               | ~50–150 LOC  |
| opcode                 | A1 stream-json   | Claude Code only                                                   | bespoke (single backend)             | Claude session-id       | inherits env              | desktop GUI            | thin                | n/a          |
| vibe-kanban            | A1 stream-json   | claude, codex, gemini, cursor, droid, copilot, opencode, qwen, amp | bespoke trait + per-agent normalizer | per-agent               | inherits env              | kanban + worktree      | typed but expensive | ~1,500 LOC   |
| claude-squad           | A2 PTY/scrape    | claude, aider, gemini (hard-coded) + free-form                     | substring matching + if program == X | tmux persistence        | inherits env (sources rc) | TUI + worktree         | small but coupled   | n/a          |
| happy                  | A3 fd3 sideband  | claude (deep), codex, gemini (separate dirs)                       | per-agent code path                  | Claude session-id       | inherits env              | mobile relay           | bespoke             | ~300–550 LOC |
| conductor              | unknown (closed) | claude, codex                                                      | unknown                              | unknown                 | unknown                   | desktop GUI + worktree | unknown             | unknown      |
| hermes-agent (planned) | A4 PTY+ACP       | claude, codex, gemini, aider, goose, opencode                      | trait (planned)                      | per-agent (planned)     | inherits env (planned)    | TUI                    | unshipped           | n/a          |

---

## Is a pattern emerging?

**Yes, partially.** Three convergence signals:

1. **Stream-json (A1) is winning where the wrapped agent supports it.** OpenClaw, opcode, vibe-kanban all converged independently on `subprocess + --output-format stream-json + JSONL parser`. This is the de-facto pattern for Claude Code wrapping in 2026. PTY-scrape (claude-squad) and fd3-sideband (happy) are outliers, each for a specific reason (claude-squad wants the user to see the original UI; happy wants the local terminal session to remain usable).
2. **Per-task git worktrees** are the dominant isolation primitive. claude-squad, vibe-kanban, conductor, container-use all use this. OpenClaw and opcode don't (different layer — gateway / single-window GUI), happy doesn't (it mirrors a single existing session).
3. **Session resume by passing the agent's own session-id** is the dominant pattern: OpenClaw does it, opcode does it, vibe-kanban does it. Only claude-squad sidesteps with tmux persistence.

**Two anti-convergence signals:**

1. **No shared schema for "normalized agent event."** OpenClaw has `EmbeddedPiRunResult`, vibe-kanban has `NormalizedEntry`+`ConversationPatch`, opcode forwards Claude raw, happy keeps minimal per-agent types. These don't talk to each other. Zed's ACP (Agent Client Protocol) is the only standardization attempt with momentum, and it's an *agent → editor* protocol, not an *orchestrator → agent* protocol.
2. **No shared backend-adapter contract.** OpenClaw's declarative `cli-backend.ts`, vibe-kanban's `StandardCodingAgentExecutor` Rust trait, container-use's per-host configurator files, claude-squad's hard-coded constants — every project has invented its own. There is no `agent-cli-spec.json` standard one could `npm install` to add a new backend universally.

**Convergence on capability, divergence on contract.** Everyone agrees roughly *what* the harness has to do (spawn → stream → normalize → render → resume → inject auth/MCP). Nobody agrees on *how* it should be expressed.

---

## Should silvery / km adopt one of these?

Short answer: **no — but steal the cleanest seam, study the ones that aren't.**

What we want for silvery's potential agent surface (per [02-agent-integration.md](02-agent-integration.md) + [03-agent-authoring.md](03-agent-authoring.md)) is a different shape from any of these:

- **Authoring-first**, not router-first. Silvery's bet is that owning the loop wins long-term (Type M), with the Claude Agent SDK as the model-side driver. Type-A is supplementary, not primary.
- **Multi-target rendering** (terminal + canvas + DOM). None of the surveyed Type-A projects render to anything but their native surface. Adopting their renderer code wouldn't carry over.
- **CAP / MCP-tool duality** (see [05-cap-protocol.md](05-cap-protocol.md)). None of these handle that, because none of them care about typed sub-agent invocations the way silvery's commander vision does.

**What to steal:**

- **OpenClaw's declarative `cli-backend.ts` shape** — `{ command, args, modelArg, sessionArg, output: "jsonl", input: "stdin", bundleMcp, sessionArgs?, resumeArgs }` is the cleanest backend-as-config representation in the field. If we ever need to spawn alien agents from inside silvery, this is the shape to adopt. ~50 lines per backend instead of 1,500.
- **container-use's per-host configurator pattern** — one Go file per agent host that registers an MCP server. We do the inverse direction (we'd register *into* claude/codex/cursor/goose), but the per-host adapter shape is the same.
- **Hermes-agent's ACP target** — if Zed's ACP gets traction, prefer it over stream-json. ACP is typed, schema-versioned, and is the only candidate for an industry-standard contract.

**What to avoid:**

- **vibe-kanban's per-agent typed Rust adapter pattern**. ~1,500 LOC × N agents is the most expensive answer. The project is sunsetting; learn from it.
- **claude-squad's substring-matching prompt detection**. Fine for a personal tool, structurally fragile for anything we'd ship.
- **happy's fd3 sideband as a *primary* transport**. Brilliant for its specific shape (mirror an existing user-facing session) but not the right default.

---

## Type-M features silvercode recovers as Type A — the homogenization play

**Frame**: silvercode's job as a Type-A pane host is to **make heterogeneous Type-M agents homogenized**. Each Type-M agent ships its own opinions about skills, tools, memory, slash commands, plan state, telemetry — formats that don't compose. silvercode-the-cockpit sits above all of them and projects a *single unified surface* that the user interacts with, materializing the per-backend native format at the wire boundary. The Type-A position is what makes this possible; a Type-M host can only ever be one opinion in a field of competing opinions.

The recovery target is everything that's currently **Type-M-locked but cross-cuts** — features each agent has built siloed because they own their own loop, where silvercode's wider lens lets it normalize. Inventory:

### 1. Cross-agent skill defs — the canonical example

Today: every agent has its own skill format. Claude Code = `~/.claude/skills/<name>/{SKILL.md, scripts/}` autoloaded by name match. opencode = its own format under `packages/opencode/.opencode/`. Hermes = `agentskills.io` published standard, SQLite-indexed, 10-turn-review extraction. None speak each other.

silvercode's recovery: define a **km-anchored skill format** once (probably markdown under `@km/skills/`), and **materialize per-backend at session-spawn** using the fingerprint pattern from Paperclip's `@paperclipai/adapter-utils/server-utils` (`packages/adapters/acpx-local/src/server/skills.ts` and `claude-local/src/server/skills.ts`). One source of truth in km-vault; zero, one, or many backends each get the skills they need in *their* native shape, idempotent under unchanged fingerprint, revoked from agent-home when removed from session config.

This is exactly what `@km/silvercode/borrow-skills-fingerprint-materialization` (P1) is scoped for, plus its enclosing epic candidate `@km/silvercode/cross-agent-feature-harmonization` (filed below). A user defines one km skill; silvercode injects it as `~/.claude/skills/<name>/SKILL.md` for Claude Code panes, as opencode-format under `.opencode/` for opencode panes, agentskills.io-format for Hermes-Type-M panes, etc. **Heterogeneous backends, homogenized authoring surface.**

### 2. Cross-agent permission policies

Today: Claude Code permissions are a 5-state ladder (`ask` / `plan` / `accept-edits` / `auto` / `bypass`). Codex permissions are binary `execute` / `plan`. Gemini and Copilot have their own. ACP normalizes the *protocol* of permission requests via `session/request_permission` but not the *policy* — each backend defines what triggers a permission ask differently.

silvercode's recovery: define a single **silvercode permission policy** (e.g. *"auto-approve reads of files inside the vault, ask on writes outside the vault, deny network calls outside an allowlist"*) and **project it to each backend's native vocabulary** at session-init. Codex sees `execute`; Claude Code sees `accept-edits` with allowed-tools list; Gemini sees its equivalent. The user authors policy once; silvercode's permission inbox renders consistently across panes. The cross-pane override queue (already in silvercode) becomes the unified surface.

### 3. Cross-agent plan / todo unification

Today: Claude Code emits `TodoWrite` tool calls with a structured todo list. Codex emits its own plan format. ACP has a `plan` SessionUpdate. Each renders differently in each agent's UI.

silvercode's recovery: silvercode's `<PlanDrawer>` already renders any of these — but the *authoring* and *cross-pane shared plan* is not yet homogenized. Recovery means a unified plan model owned by silvercode, populated by whichever native format any pane's agent emits, and projectable back into a peer pane's native format. Squad mode benefits directly: pane 1 (Claude) writes a plan via TodoWrite; pane 2 (Codex) reads it as part of its initial prompt context (translated to Codex's plan format); pane 3 (Gemini) sees the same plan again in Gemini's vocabulary. The plan is silvercode's, projected per-backend.

### 4. Cross-agent context / memory bank

Today: Hermes has self-managed memory (markdown + 10-turn review). Kilo has Memory Bank (persistent project context). Claude Code has `CLAUDE.md` + recall. Each is per-agent.

silvercode's recovery: a **vault-anchored memory** that survives backend swaps. silvercode's bearly recall is already Type-A-shaped (km-vault is the source of truth, recall hits flow through the ambient pipeline). Extend to: replace any backend's "memory bank" with the km vault — same skill-materialization pattern, but for memory artifacts. Pane 1 (Claude) reads vault memory of yesterday's session; pane 2 (Codex) sees the same memory; user closes silvercode, reopens with opencode panes tomorrow, same memory loads. Backend switches are lossless; agent-side memory is irrelevant.

### 5. Cross-agent telemetry / SessionTrace

Today: Claude Code emits session totals; Codex emits usage events; Gemini quota lines; opencode tracks per-session cost in its own shape. Heterogeneous, can't compare across panes.

silvercode's recovery: adopt OpenClaw's normalized `executionTrace` shape (`@km/silvercode/borrow-openclaw-execution-trace` P1) so every backend emits the *same* trace shape: `{ winnerProvider, winnerModel, attempts, fallbackUsed, requestShaping, completion, systemPromptReport }`. silvercode's "Last turn" hover popover renders consistently across Claude, Codex, Gemini, opencode panes. Cost dashboards span backends. Squad mode shows comparable per-pane cost in the same units.

### 6. Cross-agent slash commands / palette

Today: Claude Code's slash commands (`/help`, `/clear`, `/agents`, `/compact`, `/rename`, ...) are Claude Code-internal. opencode's are opencode-internal. Each pane shows different slash commands.

silvercode's recovery: silvercode-side slash commands (`/inbox`, `/history`, `/handoff`, `/claim`) work the same regardless of which backend is in the pane. Some are silvercode-native (cockpit-level: pane management, permission inbox); some project to backend-native commands (`/compact` triggers Claude's compaction or Codex's equivalent). The unified palette is silvercode's; backend-specific commands stay namespaced.

### 7. Cross-agent capability descriptors

Today: each backend has its own native vocabulary for thinking depth (Codex's `reasoning_effort`, Claude's `think` / `think hard` / `ultrathink`), permission modes, model selection. silvercode already homogenizes the *rendering* via `agent-capabilities.ts` (descriptor-driven UI per agent). The next step: silvercode-level **capability profiles** that let the user say *"deep mode"* once and have silvercode pick `reasoning_effort: high` for Codex panes, `ultrathink` for Claude panes, etc.

### 8. Cross-agent MCP injection

Today: each backend has its own MCP config — Claude Code's `~/.claude.json`, opencode's `opencode.json`, etc. Adding a new MCP server means editing every config separately.

silvercode's recovery: silvercode owns *one* MCP-server registry (it already injects `@km/km-mcp-server`); per-pane silvercode resolves which MCP servers to materialize into the spawned agent's native config at session-init. Same fingerprint pattern as skills. Add an MCP server in silvercode → it shows up in every pane regardless of backend.

### 9. Cross-agent session persistence + resume

Today: Claude Code stores sessions in `~/.claude/projects/<proj>/<id>.jsonl`. Codex has its own format. opencode has another. Resume is per-backend.

silvercode's recovery: silvercode owns a unified session model (already in flight per `@km/silvercode/state-split-client-server`); the per-backend storage becomes derived state. `silvercode --resume <agent>:<sid>` works regardless. *Today this is per-backend*; the bead reframes it as cross-agent.

### Summary — what's recoverable, where

The principle is uniform: **anything a Type-M agent built because it owns its loop is potentially silvercode-recoverable if (a) the cross-cut is real, (b) silvercode's authoring surface is better than N parallel per-vendor surfaces, and (c) the per-backend native format is materializable at session boundaries.** Skills are the prototype; everything in the inventory above follows the same shape.

### The cleavage line — ACP vs silvercode-side materialization

**ACP harmonizes what happens inside a session. silvercode-side materialization harmonizes what each backend reads from disk before a session.** That divide governs how much of the inventory is solvable by better ACP wrapping vs. how much requires silvercode-owned infrastructure:

- **Pure ACP-wrapping wins** (items 3, 6, 7, 9 — plan, slash, capability descriptors, resume): the `session/*` surface already carries the harmonization; silvercode-side adapters or upstream ACP servers translate per-backend native to ACP's homogeneous shape. No new abstractions; zero `_meta` extensions; mostly upstream PRs.
- **`_meta`-extension wins** (items 2, 5 — permission policies, telemetry/SessionTrace): protocol homogeneous via existing ACP surface (`session/request_permission`, `session/update`); semantics carried in `_meta` extensions (`_meta.category`, `_meta.executionTrace`, `_meta.failureFamily`). Silvercode defines conventions, ships in `@km/claude-acp`, proposes upstream once battle-tested.
- **Materializer-required wins** (items 1, 4, 8 — skills, memory, MCP injection): the agent reads from disk *before* any ACP session opens (`~/.claude/skills/<name>/SKILL.md`, `CLAUDE.md`, `~/.claude.json`). ACP is a session-time protocol; pre-session disk state is fundamentally outside its surface. silvercode owns a fingerprint-keyed materializer (Paperclip-pattern, generalized) that idempotently writes per-backend native files at session-spawn.

The first two groups are *commodity* — anyone with a Type-A pane host plus ACP wrappers can ship them; silvercode just gets there first via existing borrow beads. The third group is *the moat* — opencode-the-Type-M can't replicate items 1/4/8 without going Type-A; ACP can't grow into them without redefining its scope. Phases A + B make heterogeneous Type-M agents *look* uniform in the UI; Phase C makes them *behave* uniformly across what they read from disk before they ever reach silvercode's UI.

### Prior art — what to borrow from OpenClaw + Hermes

Two adjacent projects have already solved pieces of the harmonization problem for their own product shapes; their patterns transfer cleanly.

**OpenClaw** (per § A1 above) is the cleanest declarative-per-vendor-manifest precedent. Cross-cutting lesson: **per-vendor backend config as pure declarative data; runner + materializer are generic.** Specific patterns to lift:

- **`clawhub` skill directory** (item 1) — skills as a *first-class published-package concept* (versioned, hosted, distributable), not just per-user files. silvercode's `@km/skills/` should support both vault-local *and* published skill packs.
- **`extensions/memory-*` family** (item 4) — `memory-core` (interface) + `memory-lancedb` (vector) + `memory-wiki` (markdown wiki) + `active-memory` (running context) — pluggable memory backends behind one interface. silvercode's memory layer should expose this interface; km-vault is one backend among many.
- **`bundleMcpMode: "claude-config-file"`** (item 8) — *the* materializer pattern, just claude-only. silvercode generalizes it: same `bundleMcp` field in session config, different `bundleMcpMode` per backend. **This is the canonical Phase C primitive shape.**
- **Template-substitution resume contract** (item 9) — `resumeArgs: ["--resume", "{sessionId}"]` as declarative config. silvercode's session-spawn reads per-backend resume strategy from the same manifest.
- **Full meta envelope** (item 5) — `meta: { agentMeta, executionTrace, requestShaping, completion, systemPromptReport }`. silvercode's `_meta` should carry the full envelope, not just executionTrace.
- **`requestShaping` field** (item 7) — per-request *normalized* parameters captured as data ("user said 'deep mode' → resolved to `reasoning_effort: high` on Codex / `ultrathink` on Claude"). Auditable per-pane reasoning intensity.

**Hermes** (Type M today, Type A planned) is the closest published memory-architecture precedent:

- **agentskills.io as authoring format** (item 1) — silvercode's skill format aligns with the published standard; materializer projects to per-backend native. Two upsides: free corpus from agentskills.io; no new format for authors to learn.
- **Markdown-files-as-memory + 10-turn review consolidation** (item 4) — durable insights as markdown; foreground self-review extracts running session into structured insights. **silvercode runs the review loop as a Type-A primitive** — agent-agnostic, runs the same regardless of backend. Mem-thought Tier 4 (`hub/silvercode/design/recall-trigger-design.md`) is the existing internal name; harmonization frames it as cross-agent.
- **6 execution-environment backends** (Daytona/Modal/Singularity/SSH/Docker/local) — direct prior art for `@km/silvercode/borrow-paperclip-execution-target`. Validates the multi-environment pattern.

### Refined dimensional list (after prior-art pass)

Two refinements added to the original 9:

- **Item 4a — pluggable memory backends** (OpenClaw `memory-*` pattern): km-vault default, LanceDB/FAISS/wiki backends plug in.
- **Item 4b — silvercode-owned memory consolidation loop** (Hermes 10-turn review pattern): Type-A primitive, agent-agnostic. The cockpit owns the consolidation; backends don't need to know.
- **Item 1a — agentskills.io as authoring format**: silvercode's skill authoring format aligns with the published standard; materializer projects to per-backend.
- **Cross-cutting — declarative per-vendor manifest**: generalize `BUILTIN_AGENTS` to OpenClaw's full `cli-backend.ts` shape so Phase C materializers have uniform input. Not a dimension; an implementation discipline. Land as a new **Phase A.5** before any of Phase C lands.

### Phased execution

The harmonization epic `@km/silvercode/cross-agent-feature-harmonization` is structured in three phases (full detail in the bead body):

- **Phase A — pure ACP-wrapping wins** (items 3, 6, 7, 9). Lowest cost, fastest demo, no new abstractions. Mostly upstream PRs against `@agentclientprotocol/claude-agent-acp`, `@zed-industries/codex-acp`, plus polish in `@km/claude-acp`.
- **Phase A.5 — declarative per-vendor manifest** (cross-cutting from OpenClaw). Generalize `BUILTIN_AGENTS` to OpenClaw's full `cli-backend.ts` shape `{ command, args, modelArg, sessionArg, output, input, bundleMcp, bundleMcpMode, sessionArgs?, resumeArgs }`. Pure data; no behavior change. Unblocks Phase C generality.
- **Phase B — `_meta`-extension conventions** (items 2, 5). Three existing P1 borrow beads cluster here: `borrow-openclaw-execution-trace` (defines SessionTrace shape, full meta envelope from OpenClaw), `borrow-paperclip-claude-failure-types` (supplies `_meta.failureFamily`), `borrow-paperclip-execution-target` (orthogonal infrastructure for spawn; Hermes's 6-backend matrix is corroborating prior art).
- **Phase C — silvercode-side materializer** (items 1, 1a, 4, 4a, 4b, 8). The remaining P1 borrow bead `borrow-skills-fingerprint-materialization` lives here — it ships the canonical example (skills) and the fingerprint-keyed writer primitive that items 8 reuses unchanged. Items 4a (pluggable memory backends, OpenClaw pattern) and 4b (consolidation loop, Hermes pattern) are sibling primitives. Item 1a aligns the authoring format to agentskills.io.

Filed under epic **`@km/silvercode/cross-agent-feature-harmonization`** (P2) — gathers the four P1 borrow beads (skills, executionTrace, claude-failure-types, execution-target) under the harmonization narrative and queues the remaining P2 sub-beads (permissions, plan, memory, slash, capabilities, MCP, resume) per phase.

---

## Type M vs Type A vs ACP — three layers, not three peers

A common mistake is to put ACP in the same taxonomy slot as Type M and Type A. **ACP is not a peer category.** It's a *contract* that cuts across the M/A split. Properly framed:

- **Type M / Type A** = **architectural choice** — does this product own the agent loop, or does it delegate to another process?
- **ACP** = **interoperability protocol** — what wire format do those processes speak when they talk to each other?

A Type-M agent can expose an ACP server interface. A Type-A router can consume that interface. When both ends speak ACP, the per-vendor adapter cost in Type A collapses to zero. When neither does, Type A pays per-vendor cost forever (today's reality: stream-json is vendor-specific in subtle ways even though the high-level shape is similar).

### What each one actually defines

| Concern                | Type M                               | Type A (stream-json today)                                                              | ACP                                                                                                                                                       |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What it is             | Architectural decision: own the loop | Architectural decision: delegate the loop                                               | JSON-RPC 2.0 wire schema, capability-negotiated                                                                                                           |
| Who picks it           | Product author                       | Product author                                                                          | Both ends agree at session start                                                                                                                          |
| Wire format            | (n/a — internal)                     | Per-vendor: Claude system/assistant/user/tool_use/result, codex variant, gemini variant | One schema for everyone                                                                                                                                   |
| Schema versioning      | (n/a)                                | Implicit — vendor changes break wrappers                                                | Explicit — initialize exchanges protocolVersion                                                                                                           |
| Capability negotiation | (n/a)                                | None — flags are best-effort                                                            | clientCapabilities ↔ agentCapabilities                                                                                                                    |
| Session lifecycle      | Internal                             | --session-id <uuid> + --resume                                                          | session/new, session/load, session/cancel                                                                                                                 |
| Streaming events       | Internal                             | --output-format stream-json JSONL                                                       | session/update notifications: agent_message_chunk, agent_thought_chunk, tool_call, tool_call_update, plan, available_commands_update, current_mode_update |
| Tool calls             | Internal                             | Embedded as opaque blocks in stream-json                                                | First-class typed ToolCall + ToolCallUpdate with kind, status, locations[] for follow-along navigation                                                    |
| Permission flow        | Internal                             | Agent prompts via own UI; or --permission-mode bypassPermissions to skip                | session/request_permission { toolCall, options } → { outcome: { selected \| cancelled } }. Typed and client-rendered.                                     |
| File operations        | Internal                             | Agent does its own file IO directly                                                     | Client-mediated: agent calls fs/read_text_file / fs/write_text_file on the client. Inversion of control.                                                  |
| Terminal commands      | Internal                             | Bash tool runs in agent's process                                                       | terminal/create, terminal/output, terminal/wait_for_exit, terminal/kill — client owns the PTY                                                             |
| Cancellation           | Internal                             | SIGINT or close stdin (varies by agent)                                                 | session/cancel { sessionId } — typed                                                                                                                      |
| Authentication         | Internal                             | Env vars (ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, …)                                | authenticate { methodId } with authMethods enumerated up front                                                                                            |
| MCP integration        | Internal                             | Bundled config file passed via flag                                                     | mcpServers array passed in session/new params                                                                                                             |
| Bidirectionality       | n/a                                  | Mostly one-way (stdin in, stdout out)                                                   | Full duplex JSON-RPC — both sides issue requests                                                                                                          |
| Slash commands         | Internal                             | Inline in user prompt                                                                   | available_commands_update notification — client can render as menu                                                                                        |
| Maturity               | Decades of practice                  | 2023–present, every Type-A project                                                      | 2024–present, Zed-led, expanding                                                                                                                          |
| Adoption (agents)      | n/a                                  | Universal — every shipping agent CLI has some -p stream-json mode                       | Claude Code (via plugin), codex-cli, gemini-cli, opencode have ACP servers; growing                                                                       |
| Adoption (clients)     | n/a                                  | Every Type-A router                                                                     | Zed editor (primary), Neovim plugins, hermes-agent (planned)                                                                                              |

### The architectural inversion that matters

The single biggest difference between current Type-A practice and ACP is **client-mediated IO**.

- In **stream-json Type A**, the wrapped agent does its own filesystem reads, writes, and shell commands. The wrapper sees them as opaque tool-call entries in the JSONL stream. To enforce sandboxing or capture, the wrapper has to either (a) run the agent in a container (container-use's whole reason for existing) or (b) trust the agent's own permission system.
- In **ACP**, the agent declares it wants to read a file by sending `fs/read_text_file` to the client. The client decides whether to satisfy the request — from the real disk, from a virtual workspace, from a sandbox, from git history, with edits buffered for review. **The agent never touches the filesystem directly.**

This inversion is what makes ACP the architecturally cleaner contract. Workspace virtualization, edit-review-before-apply, snapshot/rollback, accessibility annotations on file paths — all become orthogonal concerns the client handles uniformly across any ACP-speaking agent. In stream-json Type A, each of these has to be solved per-agent or by sandboxing the whole process.

### Where each fits

- **Type M wins when**: you want maximum control over the loop (custom prompts, custom tool schemas, novel UI shapes, multi-agent coordination, replay/tape semantics). Every agent host today is Type M for this reason. Cost: you reimplement the loop, you're locked to whichever model providers you've integrated, you compete on capability with Anthropic/OpenAI's reference implementations.
- **Type A (stream-json) wins when**: you want to leverage someone else's agent loop wholesale and add a different surface (messaging gateway, mobile relay, kanban, GitHub bot, desktop chrome). Cost: per-vendor adapter, per-vendor schema drift, no client-side control over file IO or permissions without containerization.
- **Type A (ACP) wins when**: same as stream-json A *plus* you want client-mediated IO, typed permissions, capability negotiation, and one parser for every agent that speaks the protocol. Cost: only works for ACP-speaking agents, which today is a subset of the field; the contract is still evolving.

### Why a Type-A router doing ACP is the architecturally cleanest answer

If we set aside "what ships today" and ask "what's the right structure?":

1. The wire schema is a vendor-by-vendor mess in stream-json. ACP collapses it to one parser.
2. Permission flow as typed protocol beats per-agent UI scraping or trust-everything-mode.
3. Client-mediated IO means workspace virtualization, sandboxing, edit-review, and audit are orthogonal — solved once at the client, applied to every agent.
4. Capability negotiation lets the router *know* what the agent supports instead of feature-detecting empirically.
5. Cancellation and resume become typed, not "send SIGINT and pray."

The reason nobody ships this yet: ACP is two years younger than stream-json, fewer agents speak it, and the projects in this survey were started before ACP stabilized. **Hermes-agent's roadmap (issues #413, #5257) is the only Type-A project explicitly betting on ACP.** If they ship it cleanly, it's the architecturally cleanest Type A in the field — by a lot.

### ACP as silvery's internal domain model

The user's question 2026-04-26: "Does ACP provide a unified domain model / event types we could use internally and translate to when wrapping non-ACP agents?" Answer: **yes — and use it at the boundary, not as canonical.** See the [reality-check subsection](#reality-check-2026-04-26-do-not-adopt-acp-types-as-canonical) below; adoption-sentiment research that day flipped this recommendation.

ACP's schema (`github.com/zed-industries/agent-client-protocol/schema/schema.json`) defines **124 typed concepts** covering basically every dimension a Type-A wrapper has to model:

- **Session lifecycle** — `SessionId`, `NewSession*`, `LoadSession*`, `CloseSession*`, `ResumeSession*`, `ListSessions*`, `CancelNotification`
- **Content blocks** — `TextContent`, `ImageContent`, `AudioContent`, `EmbeddedResource`, `ResourceLink`, `BlobResourceContents`, `TextResourceContents` (deliberately the same shape MCP uses)
- **Tool calls** — `ToolCall { id, kind, status, locations[], content[] }` with typed `ToolCallStatus { pending|in_progress|completed|failed }`, typed `ToolKind`, follow-along `ToolCallLocation`, structured `Diff`, incremental `ToolCallUpdate`
- **Permissions** — typed `RequestPermissionRequest { toolCall, options }` → `RequestPermissionResponse { outcome: Selected | Cancelled }`, with typed `PermissionOptionKind`
- **Plans** — `Plan` + `PlanEntry { priority, status }` (a typed TodoWrite)
- **Streaming updates** — `SessionUpdate` discriminated union: `agent_message_chunk` / `agent_thought_chunk` / `tool_call` / `tool_call_update` / `plan` / `available_commands_update` / `current_mode_update` / `user_message_chunk`
- **Modes** — `SessionMode` + `CurrentModeUpdate` (Plan/Act/Agent etc.)
- **Slash commands** — `AvailableCommand`, `AvailableCommandsUpdate`, `UnstructuredCommandInput`
- **Capabilities (negotiation)** — `AgentCapabilities`, `ClientCapabilities`, `FileSystemCapabilities`, `McpCapabilities`, `PromptCapabilities`, `SessionCapabilities` + the per-method capability records
- **Client-mediated FS** — `ReadTextFile*`, `WriteTextFile*`
- **Client-mediated terminal** — `CreateTerminal*`, `TerminalOutput*`, `KillTerminal*`, `ReleaseTerminal*`, `WaitForTerminalExit*`
- **MCP** — `McpServer` (stdio/http/sse variants), `McpCapabilities`, `EnvVariable`, `HttpHeader`
- **Auth** — `AuthMethod`, `AuthenticateRequest/Response`
- **Session configuration** — `SessionConfig*` family for typed config UIs (model selector, thinking-level selector, etc.)
- **Escape hatch** — `ExtNotification`, `ExtRequest`, `ExtResponse` for vendor features outside the spec without forking the schema

Coverage check — every Claude Code stream-json event has a clean ACP target:

| Claude stream-json       | ACP target                                                    |
| ------------------------ | ------------------------------------------------------------- |
| system/init (session_id) | InitializeResponse + NewSessionResponse                       |
| assistant text chunk     | SessionUpdate.agent_message_chunk                             |
| assistant thinking       | SessionUpdate.agent_thought_chunk                             |
| tool_use block           | SessionUpdate.tool_call (status: pending, locations[])        |
| tool_result block        | SessionUpdate.tool_call_update (status: completed, content[]) |
| result (stop)            | PromptResponse { stopReason }                                 |
| permission prompt        | RequestPermissionRequest (typed options[])                    |
| partial_message chunks   | repeated agent_message_chunk                                  |
| slash commands           | AvailableCommandsUpdate                                       |
| Plan/Act mode            | CurrentModeUpdate + SessionMode                               |
| compaction               | ExtNotification (no native equivalent — use the escape hatch) |

Codex and Gemini map similarly. The ~1,500 LOC/agent that vibe-kanban paid for `NormalizedEntry`+`ConversationPatch` was reimplementing a vocabulary ACP already standardizes.

**Recommended architecture for silvery / silvercode**:

```
                    silvery components (UI)
                            ▲
              ACP types as canonical domain model
                            ▲
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ACP client          stream-json          PTY/screen-scrape
   (native,            adapter             adapter (last resort)
    cheap)             (per-vendor          for legacy / no-stream-json
                       JSONL → ACP)         agents
        ▲                   ▲                   ▲
        │                   │                   │
  ACP-speaking          claude-cli,           ad hoc
  agents (Claude        codex-cli,           (rare)
  Code via              gemini-cli
  claude-agent-acp,     etc. (today)
  codex-acp, pi-acp)
```

What this gets you:

1. **One internal vocabulary** across all wrapped agents. silvery components render `ToolCall`, `Plan`, `RequestPermission`, etc. — they don't know or care which agent produced them.
2. **Stream-json adapters become stateless mappers**, ~200–400 LOC per agent (vs vibe-kanban's ~1,500). They receive vendor JSONL, emit ACP types. No business logic in adapters.
3. **ACP-speaking agents become pass-through** — `npm i @agentclientprotocol/sdk`, decode messages, render. Per-agent code: zero.
4. **Free interop on the way out**: silvery agents implementing the ACP server side become consumable by Zed, Neovim, OpenACP, and anything else that speaks ACP. No additional work.
5. **Schema versioning is solved**: `InitializeRequest.protocolVersion` exchange. Adapters can target a known protocol version; schema migrations are a normal versioning problem rather than tracking each vendor's breaking changes silently.
6. **Capability detection is solved**: `AgentCapabilities` declares what the agent supports. silvery's UI can disable features (no thinking? hide thinking pane) based on declared capabilities, not feature-detection guesses.
7. **Future-proof**: when more agents ship native ACP, stream-json adapters age out without a code change on our end.

Caveats and gaps:

- **Some Claude Code concepts have no native ACP type** — compaction (`/compact`), hooks (PreCompact/SessionStart), Skills loading. Use `ExtNotification` for these. ACP designed the escape hatch for exactly this.
- **ACP types are evolving**. Pin to a `protocolVersion` in `InitializeRequest`. Track upstream schema bumps.
- **Don't over-translate**. Some stream-json messages are noise (heartbeats, auth churn). Drop them at the adapter, don't try to map them to ACP. The adapter has a license to filter.
- **Subscription-auth still rides the underlying agent** (see auth-dimension section below). Using ACP types internally doesn't change which process holds the OAuth token.

**Concrete first step for silvercode**: define silvercode's own canonical types (heavily *inspired by* ACP — same shapes for `ToolCall`, `Plan`, `SessionUpdate`, content blocks, capabilities — but in silvercode's own namespace). Write boundary adapters: ACP↔silvercode-types (used for `@zed-industries/claude-code-acp`, `@zed-industries/codex-acp`, `pi-acp`, OpenCode's `opencode acp`, etc.) and stream-json↔silvercode-types (used for direct Claude Code / codex-cli / gemini-cli when no ACP server is installed). silvery components consume silvercode types only — never raw vendor JSONL, never raw ACP types.

#### Reality check (2026-04-26): do not adopt ACP types as canonical

Research into ACP adoption sentiment (April 2026) surfaced four signals that flip the "adopt ACP types directly" recommendation. Captured here so the bet is honest:

1. **Zed doesn't fully implement its own spec months after release.** Session resume doesn't replay history; permission requests under-implemented; plan updates limited. Independently confirmed by OpenClaw's ACP gap audit ([shashikantjagtap.net/openclaw-acp-…/](https://shashikantjagtap.net/openclaw-acp-what-coding-agent-users-need-to-know-about-protocol-gaps/)) — same gaps badlogic cited when closing pi-mono PRs #241 and #836. This is real, reproducible, multi-source.
2. **SDK type surface has churned twice in 5 months** (v0.7.0 Nov 25, v0.8.0 Nov 28; CHANGELOG at `agentclientprotocol/agent-client-protocol`). Wire `protocolVersion` pinned at 1, but the TypeScript and Rust *type* surfaces aren't stable. Importing ACP types directly into silvercode's domain means tracking those breaking changes.
3. **Naming/governance fragility.** Zed's ACP collides with IBM's earlier "Agent Communication Protocol" (now folded into Google A2A under Linux Foundation). No foundation backing for Zed's ACP; single-vendor-led. If A2A absorbs the namespace or Zed pivots, code that imports ACP types is stuck.
4. **`@agentclientprotocol/claude-agent-acp` is Zed-published, not Anthropic-published.** Anthropic issue [claude-code#6686](https://github.com/anthropics/claude-code/issues/6686) is still a feature request. The canonical Claude ACP wrapper today is community/Zed-aligned. **Critically — verified from `claude-agent-acp@0.31.0` source 2026-04-26 — this package does NOT support Claude.ai subscription accounts.** The auth-method picker shows "Claude Subscription" as a choice (line 242), but at session-init `dist/acp-agent.js:1360` checks `initializationResult.account.subscriptionType` and throws `"This integration does not support using claude.ai subscriptions."` Anthropic's policy: subscription quota (Pro / Max) is reserved for Claude Code's own interactive surfaces. Programmatic use via the Claude Agent SDK requires API billing (`ANTHROPIC_API_KEY` via the "Anthropic Console" auth method).

**What this means for silvercode**:

- Define silvercode's own canonical types — `SilvercodeMessage`, `SilvercodeToolCall`, `SilvercodePlan`, etc. Shape them like ACP (same fields, same discriminated unions) so the boundary adapter is mostly identity. But the namespace is silvercode's, evolution is silvercode's call, and the type surface doesn't move when Zed cuts a breaking SDK release.
- The boundary adapter `acpToSilvercode(update: SessionUpdate) → SilvercodeUpdate` is small (~50–100 LOC) and the only place ACP types are imported. If the ACP type surface churns, that one file changes — not the rest of the codebase.
- This is exactly how silvercode would treat LSP, MCP, or any other vendor protocol: typed at the boundary, owned domain inside.
- **Re-evaluate quarterly**: if Zed reaches 100% spec coverage in its own client *and* the protocol version bumps to 2 with a real deprecation policy, consider promoting ACP types to canonical and dropping the silvercode-types layer. Until both happen, keep the layer.

**Adoption is real but uneven** (research detail):

- ✅ shipping ACP servers: Goose, OpenCode (`opencode acp` subcommand), Gemini CLI, Augment/Auggie, GitHub Copilot CLI, plus Zed-built wrappers for Claude Code and Codex
- ✅ ACP clients beyond Zed: JetBrains (native, co-drove the spec), Neovim (CodeCompanion, avante.nvim, agentic.nvim), Emacs (agent-shell), marimo
- ✗ no VSCode ACP client found
- ⏳ Cursor and Aider were "in progress" per Zed's Oct 2025 progress report; no 2026 update found
- ⚠ pi has no first-party ACP — community adapters only (`svkozak/pi-acp`, `aadishv/pi-acp`, `@victor-software-house/pi-acp`)

**The architecture survives, the recommendation shifts one layer**:

```
                silvery components (UI)
                          ▲
              silvercode canonical types
                          ▲
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ACP boundary       stream-json        PTY adapter
   adapter            → silvercode       (last resort)
   (~50-100 LOC,      adapter
    isolated change   (per-vendor,
    surface)           ~200-400 LOC)
        ▲                 ▲                 ▲
        │                 │                 │
  ACP-speaking        claude-cli,         legacy / no
  agents (Goose,      codex-cli,          stream-json
  OpenCode, Gemini    gemini-cli direct
  CLI, Augment,
  Copilot CLI, etc.
  via @agentclient-
  protocol/sdk)
```

The `@agentclientprotocol/sdk` is still useful — for actually speaking the wire protocol with ACP-supporting agents. But its *types* are imported only at the boundary. silvery components see silvercode types, never raw `SessionUpdate`.

The component inventory below is unchanged — components render silvercode types, which happen to be ACP-shaped at v1 (because ACP got the shape mostly right). If silvercode's needs diverge from ACP later, it's a free move.

### How ACP is set up and consumed (concrete)

The SDK exposes two connection classes — `ClientSideConnection` and `AgentSideConnection` — plus the `Stream` abstraction (`ndJsonStream(output, input)` builds one over stdio).

**Minimum viable client** (silvercode is the client; the agent is Claude Code via `@agentclientprotocol/claude-agent-acp`):

```ts
import { ClientSideConnection, ndJsonStream, type Client } from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";

// 1. Spawn the ACP server. Stdio is the wire.
const child = spawn("npx", ["-y", "@agentclientprotocol/claude-agent-acp"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env /* ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN already set */ },
});
const stream = ndJsonStream(
  Bun.write(child.stdin),       // bytes out
  Bun.readableStreamFrom(child.stdout), // bytes in
);

// 2. Implement the Client interface. These are the four hooks the agent calls back into.
const client: Client = {
  // Streaming updates: the discriminated union we render in the UI.
  async sessionUpdate({ sessionId, update }) {
    session.applyUpdate(update);  // signals fire, components re-render
  },
  // Permission requests. Return a typed outcome.
  async requestPermission({ sessionId, toolCall, options }) {
    const choice = await ui.askPermission({ toolCall, options });
    return { outcome: { selected: { optionId: choice.id } } };
  },
  // Client-mediated FS — agent never reads/writes directly.
  async readTextFile({ path }) {
    return { content: await workspace.read(path) };
  },
  async writeTextFile({ path, content }) {
    await workspace.write(path, content);
    return {};
  },
  // Plus terminal/* methods if FileSystemCapabilities advertise them.
};

// 3. Wire up the connection.
const agent = new ClientSideConnection(() => client, stream);

// 4. Initialize → exchange capabilities + protocol version.
const init = await agent.initialize({
  protocolVersion: 1,
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: true,
  },
});
console.log("agent caps:", init.agentCapabilities);
console.log("auth methods:", init.authMethods);

// 5. Authenticate if needed (subscription OAuth: methodId = "claude-code-oauth", etc.)
if (init.authMethods.length > 0) {
  await agent.authenticate({ methodId: init.authMethods[0].id });
}

// 6. Open a session.
const { sessionId } = await agent.newSession({
  cwd: process.cwd(),
  mcpServers: [{ type: "stdio", command: "context7", args: [], env: [] }],
});

// 7. Send a prompt. Updates flow back through client.sessionUpdate(...) above.
const { stopReason } = await agent.prompt({
  sessionId,
  prompt: [{ type: "text", text: "fix the failing test in src/foo.ts" }],
});
```

**Symmetric server side** (when silvery itself is the agent, exposed to Zed/Neovim/OpenACP):

```ts
import { AgentSideConnection, ndJsonStream, type Agent } from "@agentclientprotocol/sdk";

const agent: Agent = {
  async initialize({ protocolVersion, clientCapabilities }) {
    return { protocolVersion: 1, agentCapabilities: { /* … */ }, authMethods: [] };
  },
  async newSession({ cwd, mcpServers }) {
    const sessionId = createSession({ cwd, mcpServers });
    return { sessionId };
  },
  async prompt({ sessionId, prompt }) {
    // run the silvery-native loop; emit conn.sessionUpdate(...) for each step
    return { stopReason: "end_turn" };
  },
  async cancel({ sessionId }) { /* abort */ },
  // … loadSession, listSessions, etc.
};

const conn = new AgentSideConnection(
  () => agent,
  ndJsonStream(stdoutWritable, stdinReadable),
);
```

That's the protocol. ~150 lines of plumbing on either side.

### Component inventory — what silvercode actually has to build

Driven directly by ACP's `SessionUpdate` discriminated union plus the four client-side capability surfaces. Mostly silvery primitives that already exist; missing ones are flagged.

**Streaming-update renderers** (one per `SessionUpdate` variant — 11 cases):

| SessionUpdate.sessionUpdate | Component                                             | Source                                                         |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| user_message_chunk          | <UserMessage>                                         | uses existing <MessageList> slot — exists                      |
| agent_message_chunk         | <AssistantMessage>                                    | uses existing <MessageList> slot — exists                      |
| agent_thought_chunk         | <ThinkingBlock>                                       | new — collapsed-by-default disclosure                          |
| tool_call                   | <ToolCallBlock>                                       | new — header + status badge + body slot                        |
| tool_call_update            | (mutation only — re-renders existing <ToolCallBlock>) | n/a                                                            |
| plan                        | <PlanView>                                            | new — checklist with PlanEntryStatus icons + PlanEntryPriority |
| available_commands_update   | <SlashCommandPalette>                                 | partly exists (silvercode CommandBox); needs ACP binding       |
| current_mode_update         | <ModeIndicator>                                       | new — small label in StatusLine                                |
| config_option_update        | <SessionConfigPanel>                                  | new — typed selectors (model, thinking-level)                  |
| session_info_update         | (status-line refresh only)                            | n/a                                                            |
| usage_update                | <UsageBadge>                                          | new — token + cost in StatusLine                               |

**Tool-call body renderers** (one per `ToolKind` — `read | edit | execute | search | move | delete | other` — pluggable registry):

| ToolKind         | Component                                                       |
| ---------------- | --------------------------------------------------------------- |
| read             | <FilePreview> keyed on ToolCallLocation (path, optional line)   |
| edit             | <DiffView> consuming ToolCallContent.diff: { oldText, newText } |
| execute          | <TerminalPane> if interactive; <CommandOutput> for one-shot     |
| search           | <SearchResults> for grep/find tools                             |
| move/delete      | <FsOpSummary>                                                   |
| other (fallback) | <GenericToolCall> rendering raw ToolCallContent[]               |

**Content-block renderers** (one per `ContentBlock` variant — same shape as MCP):

| ContentBlock.type   | Component                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| text                | <TextContent> — markdown via existing <MarkdownView>                   |
| image               | <ImageContent> — needs Sixel/Kitty-graphics adapter on terminal target |
| audio               | <AudioContent> — placeholder on terminal; first-class on canvas/DOM    |
| resource_link       | <ResourceLink> — typed clickable to open in workspace                  |
| resource (embedded) | <EmbeddedResource> — recurse into resource type                        |

**Client-capability surfaces** (the four request methods the client implements):

| Capability                               | Component / runtime                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| requestPermission                        | <PermissionDialog> rendering RequestPermissionRequest.options[] typed by PermissionOptionKind                                                                                                                                                                                                                                                                                                                                                                                            |
| fs.readTextFile / fs.writeTextFile       | <WorkspaceProvider> runtime — virtualizable: real disk / sandbox / git-worktree / staged-edits                                                                                                                                                                                                                                                                                                                                                                                           |
| terminal/create … terminal/wait_for_exit | <TerminalBackend> runtime + <TerminalPane> view. Pipes-first at v0 — plain Bun.spawn with stdio:pipe covers ~80% of agent commands (tests, builds, greps, file tools). Strategy plugins: pipeBackend (default), recordingBackend (storybook + tape, spawn-free), ptyBackend (when @silvery/pty lands; for interactive REPLs / TUIs / gh pr create-style prompts). Same TerminalBackend interface; agent never knows which is in use. PTY is no longer on silvercode's MVP critical path. |

**Session/connection plumbing**:

- `<AcpConnection>` — factory returning a scope-bound `Connection` ({ initialize, newSession, prompt, cancel, … })
- `<AcpSession>` — factory returning the live session ({ id, messages, toolCalls, plan, currentMode, usage, prompt, cancel, … })
- `<SessionPicker>` / `<SessionHistory>` — for `session/list` + `session/load`
- `<AuthMethodPicker>` — for the `authenticate` flow when `authMethods[]` is non-empty

**Adapters** (Type-A subspecies):

- `acp-adapter` — direct pass-through for ACP-speaking agents
- `stream-json-adapter-claude` — Claude Code JSONL → ACP `SessionUpdate` (~200–400 LOC)
- `stream-json-adapter-codex` — codex variant → ACP
- `stream-json-adapter-gemini` — gemini variant → ACP
- `pty-adapter` (last resort) — for legacy / non-stream agents

That's the whole inventory. Most of it is silvery components that already exist and already render markdown / lists / status lines. The genuinely-new components (ThinkingBlock, ToolCallBlock, PlanView, DiffView, PermissionDialog, ConfigPanel, UsageBadge) are ~10–20 lines each given silvery's primitives. The biggest missing piece is `@silvery/pty` for the terminal capability — already flagged elsewhere as the critical-path atom.

### Component reconciliation — opencode and OpenTUI

The component inventory above is derived from ACP primitives (SessionUpdate × ToolKind × ContentBlock × capability surfaces). Two adjacent projects ship richer component sets and are worth borrowing from: **opencode** (the visual-parity target — sst/opencode, SolidJS-based desktop/web pivot as of 2026-04, ships ~95 components) and **OpenTUI** (anomalyco/opencode, 10.5k stars, the native Zig TUI core that powers opencode's terminal showcase and terminal.shop).

Important context corrections from research:

- **opencode pivoted off the terminal.** Current `dev` branch is SolidJS desktop/web (Electron-shelled). No more Bubble Tea / Ink / Go TUI in the current tree. Visual parity now means parity with a desktop chat UI, not a TUI — but the component vocabulary is the right reference because it's what users compare against.
- **opencode confirmed has ACP support** at `packages/opencode/src/acp/{agent,session,types}.ts`. The agent core is ACP-native; the renderer choice (SolidJS) is independent.
- **OpenTUI is the native Zig TUI core with a C ABI** + React reconciler + Solid reconciler. opencode-the-TUI was built on it; terminal.shop is also using it.

**What opencode ships beyond the ACP-derived list** (worth adopting for parity):

| Category               | Components opencode has that we don't                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session-turn anatomy   | session-turn (top-level turn container with retry/reveal animations), message-divider, session-retry (inline retry-on-error), AgentPart (sub-agent spawn rendering — nested turn-within-turn)                                                                                                                        |
| Tool rendering         | BasicTool / GenericTool (collapsible header+body card, animated), tool-status-title (animated title morph: "Reading file…" → "Read 3 files"), tool-count-summary + tool-count-label (rolling-digit counters), tool-error-card, apply-patch-file (Aider-style search/replace blocks, distinct from regular edit diff) |
| Diff                   | diff-changes with inline line-comment / line-comment-annotations — PR-review-style annotations on individual diff lines                                                                                                                                                                                              |
| Composer               | prompt-input suite: slash-popover, context-items (@-mentions), image-attachments, drag-overlay, paste, history, placeholder, editor-dom (rich contenteditable). Plus dock-prompt / dock-surface (bottom-docked composer surface)                                                                                     |
| Workspace shell        | sidebar-shell, sidebar-workspace, sidebar-project, sidebar-items, titlebar + titlebar-history, session-side-panel, file-tabs + file-tab-scroll, session-sortable-tab, session-sortable-terminal-tab — multi-pane with sortable tabs                                                                                  |
| Terminal-as-tab        | terminal.tsx + terminal-panel.tsx + terminal-label.ts — embedded xterm-style terminals as session tabs                                                                                                                                                                                                               |
| Token budget           | session-context-usage + session-context-breakdown + session-context-metrics — token/context-window meters with breakdown popover                                                                                                                                                                                     |
| Model marketplace      | dialog-connect-provider, dialog-custom-provider, dialog-manage-models, dialog-select-model, dialog-select-provider, model-tooltip, ~20 provider icons                                                                                                                                                                |
| MCP UX                 | dialog-select-mcp, dialog-select-server                                                                                                                                                                                                                                                                              |
| Settings               | 5 settings panels (general, keybinds, list, models, providers) + a dedicated Keybind display component                                                                                                                                                                                                               |
| Session lifecycle      | dialog-fork (session forking), dialog-release-notes (in-app changelog), session-history dropdown, dialog-select-directory, dialog-select-file                                                                                                                                                                        |
| Status indicators      | status-popover + status-popover-body (status pill in titlebar with popover)                                                                                                                                                                                                                                          |
| Streaming-text effects | text-shimmer, text-reveal, typewriter, text-strikethrough (used during streaming)                                                                                                                                                                                                                                    |
| Animation vocabulary   | animated-number, motion-spring, framer-motion-style spring animations on accordion, dock entrance, count summaries, todo panel                                                                                                                                                                                       |
| Generic primitives     | Polaris-shaped library: accordion, collapsible, tabs, popover, hover-card, tooltip, dropdown-menu, context-menu, resize-handle, sticky-accordion-header, radio-group, switch, progress-circle, tag, avatar, image-preview, app-icon, file-icon, provider-icon, favicon, logo, font                                   |
| Theme system           | 37 JSON themes at ui/src/theme/themes/*.json — Catppuccin, Tokyo Night, Dracula, Gruvbox, Synthwave84, etc. Published JSON Schema (desktop-theme.schema.json). Dedicated Font component as a first-class theme primitive.                                                                                            |
| Stories                | Every component has *.stories.tsx; packages/storybook hosts                                                                                                                                                                                                                                                          |
| Mid-turn input         | Question/Answer parts rendered as inline form widgets — agent asks the user a structured question mid-turn, user answers inline (this maps cleanly to ACP's RequestPermission + a prompt-input continuation)                                                                                                         |

**What OpenTUI ships beyond what silvery has** (primitives worth adopting at the framework level, separate from silvercode):

- **`Diff`** — unified-diff renderable with regression tests (silvery has none today)
- **`Code`** — tree-sitter syntax-highlighted code block, WASM grammars bundled (TS/JS/MD/Zig minimum)
- **`Textarea`** — production multi-line editor with selection / undo-redo / paste / visual-line wrap / highlights (silvery only has `TextInput` today)
- **`LineNumber`** gutter primitive (pairs with Textarea + ScrollBox)
- **`Link`** — first-class hyperlink node with `href` + OSC-8 emit
- **`ASCIIFont`** — figlet/banner with bundled font JSONs
- **`Slider`** — numeric slider primitive
- **`TabSelect`** — tab strip / segmented control as a first-class primitive
- **`Timeline`** — keyframe/tween primitive + post-FX layer (color matrices, grayscale, transparency, attenuation)
- **`TimeToFirstDraw`** — instrumentation primitive matching silvery's perf-first stance
- **Plugin slot registry** — named slots both reconcilers expose
- **Tree-sitter pipeline** — bundled grammars, worker, hast-styled-text. Silvery's markdown is mdast-based without TS-grade syntax highlighting in code fences.
- **Stretch / brand** — WebGPU/canvas backend, sprite/physics demos. Silvery's multi-target thesis could exercise this beyond what OpenTUI can (silvery is web/canvas/DOM by design; OpenTUI is terminal-primary).

**What silvery already has that OpenTUI doesn't** (don't lose these):
`SelectList`, `ListView` (virtualized), `focusScope`, semantic theme tokens with typography presets, `PickerDialog`, autocomplete, `useReadline`, `Box theme={}`, multi-target reconciler thesis, `mdtest` tape replay.

**Punch list — additions to silvery / silvercode for parity**:

*silvery framework primitives* (cross-app, useful for km too):

- `<Diff>` — unified diff with hunk highlighting
- `<Code>` — tree-sitter syntax-highlighted code block
- `<Textarea>` — multi-line editor (selection, undo-redo, paste, wrap, highlights)
- `<LineNumber>` gutter
- `<Link>` — first-class hyperlink with OSC-8
- `<ASCIIFont>` — figlet banner
- `<Slider>` — numeric slider
- `<TabSelect>` — tab strip
- `<Timeline>` + post-FX — keyframe animation primitive + filter layer
- `TimeToFirstDraw` instrumentation
- `<Accordion>` / `<Collapsible>` / `<StickyAccordionHeader>` — first-class disclosure primitives
- `<Tooltip>` / `<Popover>` / `<HoverCard>` / `<DropdownMenu>` / `<ContextMenu>` — overlay vocabulary
- `<ProgressCircle>` — circular progress indicator
- `<Tag>` — pill / badge primitive
- `<Switch>` / `<RadioGroup>` — form primitives we don't ship today
- `<TextShimmer>` / `<TextReveal>` / `<Typewriter>` — streaming-text effects (silvery already has some animation; curate the set)
- `<AnimatedNumber>` — rolling-digit counter
- Theme JSON system + ~30 community themes (Catppuccin, Tokyo Night, Gruvbox, Dracula, Solarized, …) with JSON Schema validation
- Plugin/slot registry exposed at framework level
- Tree-sitter pipeline as an optional package (workers + grammar download + cache)

*silvercode-specific* (parity with opencode's chat UI):

- `<SessionTurn>` — top-level turn container with retry / reveal animations / sub-agent nesting
- `<MessageDivider>` — between-turns divider
- `<SessionRetry>` — inline retry-on-error
- `<AgentPart>` / nested turn-within-turn rendering — sub-agent spawns
- `<BasicTool>` / `<GenericTool>` — collapsible animated tool card (replaces our planned `<ToolCallBlock>` with the parity-grade variant)
- `<ToolStatusTitle>` — animated title morph during streaming
- `<ToolCountSummary>` + `<ToolCountLabel>` — rolling-digit counters
- `<ToolErrorCard>` — error envelope
- `<ApplyPatchFile>` — Aider-style search/replace block renderer (distinct from regular `<DiffView>`)
- `<LineComment>` + `<LineCommentAnnotations>` — PR-review-style inline diff comments
- `<PromptInput>` suite: slash popover, @-mention context-items, image attachments, drag-overlay, paste, history, placeholder, rich editor model
- `<DockPrompt>` / `<DockSurface>` — bottom-docked composer
- Workspace shell: sidebar (workspace/project/items), titlebar + history, side panel, file tabs, sortable tabs (session and terminal)
- `<TerminalPanel>` — embedded xterm-style terminal as session tab (uses pipeBackend at v0)
- `<SessionContextUsage>` + breakdown — token meter with popover
- Provider/model marketplace: `<DialogConnectProvider>`, `<DialogCustomProvider>`, `<DialogManageModels>`, `<DialogSelectModel>`, `<DialogSelectProvider>`, `<ModelTooltip>` + provider-icon set
- `<DialogSelectMcp>` / `<DialogSelectServer>` — MCP server pickers (bridges to ACP `mcpServers` config)
- 5 settings panels + `<Keybind>` display
- `<DialogFork>` — session forking
- `<DialogReleaseNotes>` — in-app changelog
- `<StatusPopover>` — titlebar status pill
- `<QuestionInput>` / `<AnswerWidget>` — mid-turn structured input (maps to ACP `RequestPermission` extended)
- Stories for every component (Storybook host already in `acp-storybook` bead)

**Net**: opencode is ~95 components; our ACP-derived inventory is ~25–30. Parity needs ~30 more silvercode-specific components and ~15 silvery framework primitives. Most are 10–50 LOC given silvery's existing primitives.

### Custom commands like `fs/read_text_file` — yes, three paths (use the right one)

The user's question: can we add custom JSON-RPC method names beyond what ACP defines (e.g., `km/read_card`, `silvercode/render_chart`)? Answer: **technically yes via `Ext` notifications, but in practice the right answer is almost always one of the other two paths.**

**Path 1 — Reuse existing ACP methods with custom URIs (preferred for client-mediated capabilities)**

`fs/read_text_file` takes a `path` parameter that's just a string. silvercode's handler decides what the string means:

```ts
async readTextFile({ path }: ReadTextFileRequest): Promise<ReadTextFileResponse> {
  if (path.startsWith("km://"))     return { content: serializeKmNode(path) };
  if (path.startsWith("lore://"))   return { content: await lore.brief(parseUri(path)) };
  if (path.startsWith("recall://")) return { content: await recall.search(parseUri(path)) };
  if (path.startsWith("ambient://")) return { content: queuedChannelEvent(parseUri(path)) };
  return { content: await fs.readFile(path, "utf8") };
}
```

The agent uses `fs/read_text_file` — already a primitive it knows. silvercode resolves URI schemes to whatever it wants. **No new method, no spec extension, no agent cooperation needed.** This is how to expose km cards, lore briefs, channel buffers, anything reads-as-text.

For writes, same trick with `fs/write_text_file`. Side effects (mutate the board, save to memory) live behind virtual write paths. silvercode controls validation, permission flow, edit review.

**Path 2 — MCP server (preferred for agent capabilities)**

Anything the agent calls during reasoning (queries, mutations, side effects) belongs in an MCP server passed via `session/new { mcpServers: [...] }`. Tools are typed (JSON Schema), introspectable, agent-discoverable. No protocol extension needed. Works with any ACP agent.

`km_query`, `km_create_card`, `tribe_send`, `lore_inject_delta` — all MCP. Agent calls when it decides to. Silvercode hosts the MCP servers as child processes (or in-process for first-party ones).

**Path 3 — `Ext{Notification,Request,Response}` (last resort, for genuinely new RPC shapes)**

ACP's escape hatch. silvercode and the agent agree on a method name like `ext/silvercode.render_chart` and pass arbitrary params. Three caveats:

- **Only works with cooperating agents.** Stock Claude Code, codex-cli, gemini-cli will not handle `ext/silvercode.*` — silvercode would have to be the agent too (or have agent-side cooperation via MCP).
- **Untyped at the protocol layer.** ACP doesn't validate `Ext*` payloads; it's a raw JSON-RPC pass-through.
- **Brittle across ACP versions.** When the spec eventually adds an official method that overlaps, you'll want to migrate.

When you genuinely want it: a real-time bidirectional capability that doesn't fit "the agent calls a tool" or "the client mediates an existing primitive." Examples might be: streaming sensor data, live collaborative editing handshakes, sub-agent spawn protocols. Rare.

**Decision rule**: client-mediated read/write → reuse `fs/*` with custom URIs. Agent capability → MCP. Genuinely new RPC shape → `Ext*`. Don't add new ACP methods.

The other dimension — `_meta` field on every type — is also worth knowing about. You can extend any existing call with vendor metadata: `fs/read_text_file { path: "km://card/x", _meta: { km: { format: "outline" } } }`. silvercode reads `_meta`, agent ignores fields it doesn't know. Strictly less invasive than custom methods or `Ext*` for "decorate an existing call with extra info."

### Cross-agent cooperation — silvercode is the orchestrator, not the agents

Multi-agent setup: silvercode is running Claude Code (analysis), codex-cli (refactoring), pi (testing) in parallel sessions. How do they share state?

**The architectural rule**: agents don't talk to each other. **silvercode owns the cross-agent state and projects relevant slices into each agent's context.** Same shape as tribe — orchestration is a layer above the protocol, not inside it.

ACP doesn't define cross-session sharing. Each `sessionId` is its own conversation. That's a feature, not a gap — it keeps each agent's context surface clean and predictable. The cooperation happens at silvercode's level.

**Layers of shared state:**

1. **silvercode's own state — the source of truth.** A signal-backed store (alien-signals + projections) holding cross-agent claims, file locks, plan, pending handoffs, recent broadcasts. All agents' activity feeds it; all agents draw from it.
2. **Filesystem (real or virtual).** Coarse but cheap. All agents working on the same git worktree share via the FS. silvercode's virtual paths (`km://`, `coordinator://shared/active-claims`) extend this — each agent reads via `fs/read_text_file`; silvercode resolves to live state.
3. **Shared MCP servers.** Pass `coordinator-mcp` and `tribe-mcp` to all sessions in `session/new`. Tools: `coordinator_claim_file`, `coordinator_release_file`, `coordinator_handoff`, `coordinator_status`, `tribe_broadcast`, `tribe_history`. Each agent calls when it needs to coordinate. Silvercode mediates conflicts. **This is the canonical multi-agent coordination path in ACP.**
4. **Curated prompt assembly per agent.** Each agent's next prompt includes a slice of cross-agent state relevant to its task. The Claude session sees "codex is refactoring src/auth.ts; don't touch it"; the codex session sees "claude is analyzing src/utils.ts." silvercode decides what each sees by projecting from its store.
5. **Tribe (UDS underneath).** silvercode is itself a tribe peer. Cross-instance coordination — multiple silvercode processes on different machines, or tabs, or worktrees — happens at the silvercode-to-silvercode layer. From the agent's view it's silvercode-internal; from silvercode's view, it's tribe.
6. **Cross-session reads via `session/list` + `session/load`.** silvercode can read another session's transcript and present it as a `ResourceLink` (`silvercode://session/<id>/recent`) in the current agent's prompt. ACP supports this directly.

**Concrete architecture**:

```
                  silvercode
              ┌───────────────────┐
              │ crossAgentState$  │  ← signal store: claims, locks, plan, broadcasts
              │ (alien-signals)   │
              └───────────────────┘
                       ▲
        ┌──────────────┼──────────────┐
        │              │              │
   ACP session     ACP session    ACP session
   (Claude Code)   (codex)        (pi)
        │              │              │
   shared MCP:    shared MCP:    shared MCP:
   coordinator,   coordinator,   coordinator,
   tribe, lore,   tribe, lore,   tribe, lore,
   km             km             km
        │              │              │
   shared FS:     shared FS:     shared FS:
   km:// paths,   km:// paths,   km:// paths,
   coordinator:// coordinator:// coordinator://
   real disk      real disk      real disk
```

**Silvercode's responsibilities**:

- Maintain cross-agent state as a signal-backed store
- Mediate `coordinator_*` MCP calls (validate claims, prevent conflicts, broadcast acknowledgements)
- Project relevant state slices into each agent's prompt assembly
- Surface coordination events in the UI (so the user sees what's happening across agents)
- Optionally run a meta-orchestrator agent (small fast model) that decides who works on what

**What this rules out**:

- Direct ACP message passing between agents — not supported, don't try
- Agents discovering each other via ACP — `session/list` returns one agent's sessions, not other agents'
- Cross-session subscriptions — ACP is request/response per session

**Bead**: `km-silvercode.acp-multi-agent` — design + implement the cross-agent orchestration layer (coordinator MCP server, cross-agent state signal store, prompt-assembly projection, conflict mediation, UI surfacing).

#### How OpenClaw does it (confirmed pattern, mapped to silvercode + tribe)

OpenClaw built exactly this architecture — tool-driven, gateway-mediated, with agent-callable cross-session messaging — and it's running in production. Worth borrowing from since silvercode and OpenClaw are at the same layer (Type A, gateway).

**OpenClaw's mechanism** (sources: `src/agents/system-prompt.ts:346`, `src/config/schema.help.ts:706`, `src/gateway/server-session-events.ts`, `src/agents/subagent-registry-lifecycle.ts`):

- **`sessions_send(sessionKey, message)` as a first-class agent tool**. Agents call it; the gateway routes to the target session's input queue. Quoted from the agent system prompt: *"Cross-session messaging → use sessions_send(sessionKey, message)"*.
- **Sibling tools**: `sessions_list` (discover peers), `sessions_history` (read peer transcripts), `sessions_send` (send messages).
- **Per-tool scoping**: `"tree"` (default — current session + spawned subagent sessions), `"self"` (only current), `"agent"` (any session in the current agent id), `"all"` (any session). Cross-agent ids gated by separate `tools.agentToAgent` policy.
- **Sub-agent registry**: spawn creates a parent/child tree; `subagent-registry-lifecycle.ts` tracks all live sessions; lifecycle events fire on appear/disappear.
- **Gateway-level SSE broadcast**: `server-session-events.ts` emits `sessions.changed` to SSE subscribers (UIs, channels). When a sub-agent spawns, every connected channel knows.
- **Security gate**: `sessions_send` is in `src/security/dangerous-tools.ts` — mutating tool requiring permission, not free-for-all.

**Mapping to silvercode + tribe**:

km already uses tribe broadcasts heavily for synchronization (chief election, claim coordination, CI alerts, sub-agent updates). The architecture is in place; what's missing is the agent-facing MCP wrapper. OpenClaw's pattern is the template:

| OpenClaw                          | silvercode (proposed)                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Gateway runtime                   | silvercode itself                                                         |
| Gateway session registry          | tribe peers + silvercode's crossAgentState$ signal store                  |
| sessions_send tool                | tribe-mcp exposing tribe_send                                             |
| sessions_list tool                | tribe-mcp exposing tribe_members                                          |
| sessions_history tool             | tribe-mcp exposing tribe_history                                          |
| sessions.changed SSE              | tribe member_joined / member_left broadcasts → silvercode UI subscription |
| Spawn tree (parent/child)         | tribe roles (chief / member) + ACP session/list for in-process            |
| tools.agentToAgent policy         | per-MCP-server permission scopes; ACP RequestPermission flow              |
| Permission gate (dangerous-tools) | ACP RequestPermission on tribe-mcp mutating tools                         |

**The architectural insight**: tribe is silvercode's *transport* for cross-instance synchronization (broadcasts arrive over UDS); `tribe-mcp` is the *agent-facing wrapper* that exposes those broadcasts as typed MCP tools. The agents themselves participate in the synchronization rather than only silvercode-the-orchestrator. OpenClaw demonstrates this works at production scale.

**Concrete plan**:

1. Wrap tribe's UDS API as an MCP server (`tribe-mcp`) — `tribe_send`, `tribe_broadcast`, `tribe_members`, `tribe_history`, `tribe_claim_chief`, `tribe_release_chief`, `tribe_join`. Same shape as the current MCP tool surface (which is already exposed to Claude Code today via the `mcp__plugin_tribe_tribe__*` namespace).
2. Pass `tribe-mcp` in every silvercode `session/new { mcpServers: [...] }`. All wrapped agents get tribe access as MCP tools.
3. silvercode subscribes to tribe directly (separate from the agent's MCP path) — uses tribe events to populate `crossAgentState$` and project relevant slices into each agent's prompt assembly.
4. Tribe broadcasts surface in silvercode's UI as notification badges (the UI-first user-mediated injection pattern from § Channel events).
5. Permission gating: `tribe-mcp` mutating tools (`tribe_send`, `tribe_broadcast`, `tribe_claim_chief`) trigger ACP `RequestPermission`. Read-only tools (`tribe_members`, `tribe_history`) auto-approve.

**Bead**: `km-silvercode.acp-tribe-mcp` — wrap tribe's UDS API as an MCP server, pass to all silvercode-spawned ACP sessions, integrate with permission flow.

### Making ACP more ergonomic — silvery house-style wrapper

ACP-as-defined is already typed and clean, but it's still imperative JSON-RPC. silvery's principles (factory functions, scopes, signals via `alien-*`, no globals, declarative composition) want a different shape on top. Layer it without giving up access to the raw protocol:

**1. Scope-bound everything.** Per [hub/silvery/design/lifecycle-scope.md](../../design/lifecycle-scope.md), `Scope` (= `AsyncDisposableStack` + `AbortSignal` + child cascade) is silvery's lifecycle primitive. ACP connections are exactly the kind of resource that needs it — child process, JSON-RPC stream, abort signals, optional MCP children. Wrap once:

```ts
import { withScope, type Scope } from "@silvery/scope";

export async function connectAcp(scope: Scope, opts: AcpConnectOpts) {
  const child = scope.use(spawn(opts.command, opts.args, { stdio: ["pipe","pipe","inherit"] }));
  const stream = ndJsonStream(toWritable(child.stdin), toReadable(child.stdout));
  const connection = new ClientSideConnection(toClient => makeClient(scope, toClient), stream);
  scope.signal.addEventListener("abort", () => connection.cancel?.({ sessionId: "*" }));
  return connection; // disposing scope kills child, closes stream, aborts in-flight prompts
}
```

Now `withScope(async scope => { const conn = await connectAcp(scope, …); … })` cleans up correctly on Ctrl-C, app shutdown, error, or composition into a parent scope.

**2. Signals as the live state surface.** Instead of consumers handling `sessionUpdate` callbacks, wrap each session in a factory returning `alien-*` reactive primitives. UI components subscribe declaratively; no manual dispatcher:

```ts
import { signal, computed } from "@silvery/signals";
import { createProjection } from "alien-projections";
import { createTree } from "alien-trees";

export function createAcpSession(scope: Scope, conn: ClientSideConnection, opts: NewSessionOpts) {
  const id$ = signal<string|null>(null);
  const messages$ = signal<Message[]>([]);
  const toolCalls$ = createProjection<ToolCall, ToolCallId>([], { key: t => t.toolCallId });
  const plan$ = signal<Plan|null>(null);
  const planTree$ = createTree(plan$, { childrenOf: p => p?.entries ?? [] });
  const currentMode$ = signal<SessionModeId|null>(null);
  const usage$ = signal<UsageUpdate|null>(null);

  // The Client implementation feeds signals; consumers never see SessionUpdate directly.
  const apply = (u: SessionUpdate) => {
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
        messages$.update(m => appendChunk(m, "assistant", u.content));
        break;
      case "tool_call":
        toolCalls$.upsert(u);  // alien-projections: O(1) keyed update
        break;
      case "tool_call_update":
        toolCalls$.patch(u.toolCallId, u);
        break;
      case "plan":
        plan$.set(u);
        break;
      case "current_mode_update":
        currentMode$.set(u.currentModeId);
        break;
      // … 11 cases total, all mechanical
    }
  };

  return {
    id: id$, messages: messages$, toolCalls: toolCalls$, plan: plan$, planTree: planTree$,
    mode: currentMode$, usage: usage$,
    async prompt(content: ContentBlock[]) { /* sets up alien-resource for cancellation */ },
    cancel() { conn.cancel?.({ sessionId: id$.peek()! }); },
    apply, // exposed for the Client wiring above
  };
}
```

UI then reads signals directly: `<MessageList items={session.messages} />`, `<PlanView tree={session.planTree} />`, `<ToolCallList calls={session.toolCalls} />`. No subscription boilerplate; no stale-closure bugs; no manual `useEffect`.

**3. `alien-resource` for prompt turns.** Each `agent.prompt(...)` is an async operation that should be cancellable, retriable, and have first-class loading/error surfaces:

```ts
import { createResource } from "alien-resources";

export function promptTurn(session: AcpSession, content: ContentBlock[]) {
  return createResource(async ({ signal }) => {
    const promise = session.connection.prompt({ sessionId: session.id.peek(), prompt: content });
    signal.addEventListener("abort", () => session.cancel());
    return promise; // returns { stopReason }
  });
}
// Components: turn.loading() / turn.error() / turn.value() with automatic stale-cancellation
```

**4. `alien-tree` for plans.** `Plan.entries[]` is naturally hierarchical. `createTree` lets components ask "any descendant pending?" or "inherit `priority` from parent" in O(1), the existing pattern in km for tree views.

**5. Capability gates as signals, not branches.** `AgentCapabilities` resolves once at `initialize`; turn it into per-feature signals so UI components query declaratively:

```ts
const caps = await conn.initialize(...);
const can = {
  thinking: signal(caps.agentCapabilities.thinking ?? false),
  plans: signal(caps.agentCapabilities.plans ?? false),
  modes: signal(caps.agentCapabilities.modes ?? false),
  // … one signal per capability bit
};
// <ThinkingBlock> only mounts when can.thinking is true; no feature-detection in render
```

**6. `Permission` as a typed effect command.** silvery's TEA-style architecture (see [docs/design/tea.md](../../../../docs/design/tea.md)) treats interaction as `(action, state) → [state, effects]`. Map `RequestPermissionRequest` to a typed action, `RequestPermissionResponse` to a typed effect. This makes permission flows replayable in tape, testable in isolation, and policy-overridable (auto-approve in tests, prompt user in app).

**7. Adapter symmetry.** Stream-json adapters and ACP-native adapters return the same `AcpSession` shape. Consumers can't tell — and shouldn't be able to. The decision tree:

```ts
async function openAgent(scope: Scope, spec: AgentSpec): Promise<AcpSession> {
  if (spec.transport === "acp") return openAcpNative(scope, spec);
  if (spec.transport === "stream-json") return openStreamJsonAsAcp(scope, spec); // adapter emits SessionUpdates
  if (spec.transport === "pty") return openPtyAsAcp(scope, spec); // last resort, partial coverage
  throw new Error(`unknown transport ${spec.transport}`);
}
```

**8. Tape-recordable by default.** Every `SessionNotification` flows through a sink that writes to silvery's `mdtest` tape format. Replay drives the UI without re-running the agent — same primitive that powers visual regression tests today.

**9. Type-registry for tool kinds and content blocks.** Don't switch-case on `ToolKind` in render — register renderers by kind. Unknown kinds fall back to `<GenericToolCall>`. Same shape we'd use for `ContentBlock` variants:

```ts
registerToolRenderer("read", FilePreview);
registerToolRenderer("edit", DiffView);
registerToolRenderer("execute", TerminalPane);
// … users can register custom kinds for vendor-specific tools (Ext*)
```

**10. One factory, no globals.** Per silvery house style — `createAcpClient({ scope, transport, workspace, permissionPolicy, … })` returns the whole graph. Tests build their own; main wires the real one. No singletons.

**Net result**: from the UI's perspective, ACP looks like silvery already looks — factory returns signals + async methods. The protocol is real, typed, and underneath; the consumer never writes JSON-RPC by hand or handles raw `SessionUpdate` switches outside the adapter.

### The auth dimension — why subscription-plan apps must be Type A

There is a hard constraint that the M-vs-A choice often actually reduces to: **whose money pays for the model call?**

- **Type M = HTTP/SDK direct** = requires per-token API billing on a separate paid plan. The user (or app vendor) has an Anthropic / OpenAI / Google API key with a credit card behind it. Subscription consumer plans (Claude Pro $20/mo, Claude Max $100/mo, ChatGPT Plus/Pro, Gemini Advanced) **do not** authorize direct API use — they authorize use through the vendor's own surfaces only.
- **Type A = subprocess wrap** = inherits the wrapped CLI's auth. The OAuth token the user established by signing into Claude Code (`CLAUDE_CODE_OAUTH_TOKEN`), codex-cli (ChatGPT account), or gemini-cli (Google account → Cloud Code Assist) flows through the child process unchanged. Subscription quota applies because the call goes through the vendor's blessed CLI.

OpenClaw demonstrates this empirically — its env-passthrough list (`src/agents/cli-runner/execute.ts`) includes `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` for exactly this reason. It rides the user's Claude Pro/Max subscription by spawning `claude` rather than calling the Anthropic API.

**ACP does not change the auth picture.** ACP is the wire format between client and agent; the agent process still authenticates to the subscription-bearer's account the same way. Type-A-via-ACP gives you both subscription auth *and* a clean protocol. Type-A-via-stream-json gives you subscription auth with a vendor-specific wire. Either way, Type A is the pattern when subscription-plan economics matter.

**Decision tree for picking M vs A:**

```
Does the app need to ride consumer subscription plans (Pro/Max/Plus/etc.)?
├── YES → Type A (no other option)
│         ├── ACP-supporting agents only?     → Type-A-via-ACP (clean)
│         └── Need codex/aider/legacy CLIs?   → Type-A-via-stream-json (today's reality)
└── NO  → Either type is open
          ├── Need own-loop control (CAP, tape, multi-agent peers)?  → Type M
          └── Just want a different surface on someone else's loop?  → Type A
```

### Implications for silvery / silvercode

The silvery framework and silvercode (the silvery-showcase coding agent) sit at different layers and pick different options:

- **silvery the framework**: the rendering / state / layout / signal substrate. Loop-agnostic. Should expose an **ACP server interface** for any silvery-native agent — a few hundred lines mapping internal events to ACP `session/update` notifications. Benefit: silvery agents become consumable by Zed, Neovim, anything-that-speaks-ACP — for free.
- **silvercode the app**: a coding agent for end-users on consumer subscription plans (Claude Pro/Max, ChatGPT Plus/Pro, Gemini Advanced). The auth-dimension constraint above means **Type M is a no-go**. silvercode is **Type A** — it spawns Claude Code / codex-cli / gemini-cli as subprocess backends, inheriting their OAuth subscription auth, and renders the result with silvery components.
  - **Today**: silvercode talks stream-json to whichever CLIs the user has installed (OpenClaw's declarative `cli-backend.ts` shape is the reference for how to express the per-vendor configs). Backends earn their first-class slot by shipping `-p --output-format stream-json` or equivalent.
  - **As ACP matures**: silvercode prefers ACP for any agent that supports it. Single client, typed protocol, client-mediated IO (silvercode controls workspace virtualization, edit-review-before-apply, accessibility annotations on file paths) — all the architectural benefits of ACP, without giving up subscription auth.
  - **Watch pi's stance**: pi-mono explicitly declined to add ACP in-tree (PRs #241, #836 closed by badlogic — "Zed don't support their own protocol in full months after release") and recommended building ACP externally on top of pi's own typed RPC mode (`--mode rpc`, `packages/coding-agent/src/modes/rpc/`). This is a useful signal — a Type-M author with a working JSON protocol decided ACP wasn't ready. silvercode should avoid betting too hard on ACP shipping cleanly; design backend adapters so a stream-json path and an ACP path coexist.

**Watch ACP's evolution.** It is the only credible candidate for "industry standard agent contract." If it falters, silvercode is fine — stream-json Type A still works. If it wins, silvercode is positioned to switch wire format without changing surface.

A useful mental model: **Type A : Type M :: HTTP : application server.** Stream-json Type A is HTTP/1.0 with vendor-specific extensions. ACP is HTTP/1.1 — same shape, finally standardized. silvercode is betting on Type A (the consumer side of subscription auth), with ACP as the preferred wire as it matures. silvery the framework is loop-agnostic and should be ACP-compatible at the boundary because the boundary is where standards win.

---

## ACP for km integration — channels, memory, selection, custom tools

The capabilities ACP gives silvercode for integrating with km's existing primitives (tribe, lore, board, recall) and the related question "can ACP replace Claude Code's `<channel>` injection mechanism." The honest answer is: **mostly yes, and the architecturally correct shift is from push-style channel injection to pull-style MCP plus a typed prompt-assembly pipeline.**

### The role-confusion problem (and why it forces the architecture)

km's current channel-injection setup has a real failure mode: **memory recalls and tribe broadcasts arrive as user-role content, and Claude treats them as instructions rather than context.** "Memory: user prefers terse responses" arrives → Claude reacts to it as if the user just said it → Claude apologizes and gets terse mid-flow. "Tribe broadcast: session X started bead Y" arrives → Claude tries to coordinate with session X. The model has one input stream; whatever's in it influences behavior. There is no architectural channel separation at the model level — only convention via system prompts and content framing.

ACP doesn't solve the fundamental problem (LLMs have one input stream), but it gives silvercode better tools to manage it:

- **Typed `ContentBlock` variants**. `EmbeddedResource { uri, mimeType, text }` is *structurally* a different shape from a plain `TextContent`. The agent's training and prompting can leverage this — most modern coding agents are prompted to treat `resource` blocks as data, not directives. Stronger than `<channel>` tags because it's at the protocol layer, not the prompt layer.
- **`_meta` on every type**. silvercode can tag content with `_meta: { ambient: true, source: "tribe", actionable: false }`. Agents that respect `_meta` (or are prompted to) can render and reason about it differently.
- **Tool results have a different role than user input**. When the agent calls `lore_brief` via MCP and gets a result back, the result is structurally a tool result — not a user message. Agents are trained to treat tool results as data, not instructions. **This is the strongest structural separation available**, and it argues hard for pull-style memory/channel access.

### Pull beats push for memory (lore, recall)

The single biggest fix for the role-confusion problem: **stop auto-injecting memories. Expose them as MCP tools the agent calls when relevant.**

```ts
await agent.newSession({
  cwd, mcpServers: [
    { type: "stdio", command: "lore-mcp",   args: [], env: [] },  // lore_ask, lore_brief
    { type: "stdio", command: "recall-mcp", args: [], env: [] },  // session-history FTS
    { type: "stdio", command: "gbrain-mcp", args: [], env: [] },  // personal vault
  ],
});
```

Why this fixes the confusion:

- Agent decides *when* to query memory — only fetches when contextually relevant
- Result arrives as a tool result, structurally distinct from user input
- Result is in agent-scoped context, not pre-committed to conversation history (compaction-friendly)
- Vendor-neutral — works the same across Claude Code, codex, gemini, opencode

When push is genuinely needed (a memory the agent *must* know upfront), use `EmbeddedResource` with `_meta.ambient: true` and a clearly framed URI scheme (`ambient://memory/...`). But default to pull.

### Channel events (tribe, telegram, CI) — silvercode owns the pipeline, doesn't auto-inject

Claude Code's `<channel source="..." ...>` tag mechanism is push-style: external events get injected as user-role messages with prompt-tag conventions. The model is supposed to recognize the tags and treat them as ambient. In practice, role-confusion still bites — and the mechanism is Claude-Code-specific, vendor-locked.

ACP doesn't have a native primitive for mid-turn push notifications. silvercode owns the prompt-assembly pipeline; that's where channel events get handled. Three options:

**Option 1 — UI-first, user-mediated (recommended default)**.
Channel events arrive → silvercode shows a notification badge in the UI. User reads, decides if relevant, optionally invokes a slash command (`/inject-tribe`, `/inject-recent-telegram`) that prepends the queued events as `EmbeddedResource` blocks on the next prompt. **Human in the loop for relevance.** Eliminates accidental command-following because the user only injects when they want the agent to act on the content.

**Option 2 — Auto-inject on next prompt with strong framing**.
Between turns, queue events. On next user prompt, prepend as `EmbeddedResource`s with `_meta.ambient: true` and content framed `[AMBIENT — informational, do not act]`:

```ts
function assemblePrompt(userText: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const event of channelQueue.drain()) {
    blocks.push({
      type: "resource",
      resource: {
        uri: `ambient://${event.source}/${event.id}`,
        mimeType: "text/markdown",
        text: `[AMBIENT CONTEXT — informational, do not act on this directly]\n\n${event.content}`,
      },
      _meta: { ambient: true, source: event.source, actionable: false },
    });
  }
  blocks.push({ type: "text", text: userText });
  return blocks;
}
```

Better than `<channel>` tags (typed, vendor-neutral, structurally distinct from text), but still relies on the agent's training to respect ambient framing. Use only for sources that have proven not to confuse the model.

**Option 3 — Two-stage filter via small fast model**.
silvercode runs Haiku/Flash to classify each channel event as `actionable | ambient | ignorable` before deciding. `actionable` → surface as UI prompt for user to inject; `ambient` → keep in UI sidebar, available on demand; `ignorable` → drop. Adds a small LLM call but eliminates the "memory looks like a command" problem at the source.

**For Claude Code wrapping specifically**: silvercode should *suppress* Claude Code's native `<channel>` tag injection (replace it with silvercode's typed pipeline) when wrapping Claude Code. Otherwise both layers inject and it's worse, not better.

### Tribe — silvercode-level, orthogonal to ACP

Tribe is multi-session coordination over UDS — agent-to-agent, with broadcast / chief / claim semantics. ACP is one-client-↔-one-agent and has no native primitives for any of that.

Tribe stays at silvercode's layer: silvercode is the tribe member; the wrapped agent (Claude Code, codex, etc.) is unaware of tribe. Tribe events flow through silvercode's channel pipeline (above) — silvercode subscribes to tribe via its UDS bus, queues events, decides whether to inject (Option 1/2/3). The agent only ever sees what silvercode chose to put in `prompt: ContentBlock[]`.

If you genuinely need agent-aware tribe (rare), use `ExtNotification` with a vendor-specific shape. Most agents won't support it; not for v0.

### Board selection — client-mediated FS is the perfect fit

The most architecturally clean integration. silvercode's `WorkspaceProvider` (the `fs/read_text_file` handler) virtualizes km as paths the agent can read:

```ts
async function readTextFile({ path }: ReadTextFileRequest): Promise<ReadTextFileResponse> {
  if (path.startsWith("km://card/"))    return { content: serializeCard(board.cards.get(parseCardId(path))) };
  if (path === "km://selection")        return { content: serializeSelection(board.selection.get()) };
  if (path.startsWith("km://column/"))  return { content: serializeColumn(board.columns.get(parseColumnId(path))) };
  return { content: await fs.readFile(path, "utf8") }; // fall through to real disk
}
```

Auto-attach the selection on every prompt as a `ResourceLink` (lightweight pointer; agent fetches lazily) or `EmbeddedResource` (small enough to inline):

```ts
function buildPrompt(userText: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const sel = board.selection.peek();
  if (sel.nodes.length > 0) {
    blocks.push({
      type: "resource_link",
      uri: "km://selection",
      name: `Selection: ${sel.nodes.length} cards`,
      mimeType: "text/markdown",
    });
  }
  blocks.push({ type: "text", text: userText });
  return blocks;
}
```

Why this is right:

- Agent reads via the same primitive as real files; tool renderers (`<FilePreview>`, `<DiffView>`) work uniformly
- Selection is a live signal in km; every read returns current state
- Sandboxed: agent can only access what silvercode resolves
- Edit review for free: agent writing to `km://card/x` triggers the same diff/permission flow as real files
- **Separated from the user prompt by structure** — `resource_link` is unambiguously not an instruction. Solves the role-confusion problem for selection-as-context, no framing tricks needed.

### ACP commands vs MCP — different layers, not alternatives

**ACP `AvailableCommand` / `AvailableCommandsUpdate`**: agent advertises slash commands to the client. `/compact`, `/clear`, `/skill:foo`. Direction: agent → client (notification). User invokes; client tells agent the user invoked it. **Use case**: shortcuts the user can hit to trigger predefined agent behaviors.

**MCP tools**: client/host gives the agent capabilities it can use during reasoning. `lore_ask`, `tribe_send`, `bd_create`. Direction: agent → MCP server (request); result back. **Use case**: tools the agent autonomously calls when it decides they're useful.

These are orthogonal:

|                 | ACP commands               | MCP tools                      |
| --------------- | -------------------------- | ------------------------------ |
| Direction       | agent → client (advertise) | agent → external server (call) |
| Who invokes     | the user                   | the agent                      |
| Discoverability | client renders palette     | agent reasons over schema      |
| Defined by      | the agent                  | the MCP server                 |
| Typed input     | AvailableCommandInput      | MCP tool schema                |
| Use case        | user shortcuts             | agent capabilities             |

**Custom tools in ACP** are not defined *by ACP* — ACP just transports `ToolCall` notifications and tool results. The tools themselves come from:

1. **Agent's built-in tools** — Claude Code's `Read`/`Write`/`Edit`/`Bash`/`Grep`, codex's equivalents
2. **MCP servers** — passed via `session/new { mcpServers: [...] }`. This is the only way to add custom tools without modifying the agent.
3. **Slash commands** (ACP `AvailableCommand`) — for user-invoked, agent-implemented shortcuts. Not the same as tools.

So if silvercode wants to give the agent custom km capabilities (mutate the board, query the tree, navigate cards): ship them as an MCP server (`km-mcp`) and pass it in `session/new`. Same shape as lore/recall/tribe. silvercode's slash commands (`/zoom`, `/fold`, `/search`) ride the ACP `AvailableCommand` channel and trigger silvercode-side behavior, *not* agent-side tool calls.

## Sources

- OpenClaw — `~/Code/openclaw/extensions/anthropic/cli-backend.ts`, `~/Code/openclaw/src/agents/cli-runner/{prepare,execute,helpers}.ts`
- claude-squad — github.com/smtg-ai/claude-squad — `session/tmux/tmux.go`, `session/instance.go`, `config/config.go`
- container-use — github.com/dagger/container-use — `cmd/container-use/{stdio,agent/configure_*}.go`, `mcpserver/tools.go`
- conductor — conductor.build, github.com/meltylabs/conductor-releases (closed)
- opcode — github.com/winfunc/opcode — `src-tauri/src/commands/claude.rs`, `src-tauri/src/process/{mod,registry}.rs`
- vibe-kanban — github.com/BloopAI/vibe-kanban — `crates/executors/src/executors/{claude,cursor,codex,…}.rs` (sunsetting)
- happy — github.com/slopus/happy + happy-cli — `packages/happy-cli/src/claude/{claudeLocal,runClaude,loop}.ts`
- hermes-agent — github.com/NousResearch/hermes-agent + hermes-agent.nousresearch.com — issues #413, #5257
- pi-mono — `~/Code/pi-mono/packages/ai/src/providers/`
- maige — github.com/RubricLab/maige (Type M, server-side bot)
- sketch — github.com/boldsoftware/sketch (Type M, web IDE in container)
- ACP (Agent Client Protocol) — agentclientprotocol.com, zed.dev, github.com/zed-industries/zed — schema-versioned JSON-RPC contract for editor↔agent

