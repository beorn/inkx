# Strategy — portfolio paths through a layered architecture

**Status**: living. Canonical strategy doc for the silvery / silvercode / km / tribe / agentroom / PlainBrain portfolio. Last major revision 2026-04-28 (workshop synthesis with /pro 4-leg + /deep prior-art research).

**Companions**: [`licensing-strategy.md`](licensing-strategy.md) (per-package license matrix; this doc owns the layer-level partitioning), [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md) (14-venture rubric scoring).

---

<a id="tldr"></a>

## TL;DR

**Recommended lead path** ([Family C](#family-map) services-led + [Family D](#family-map) protocol play + an E demonstrator):

- **[S25](#s25) ★ — Bottom-stack first, apps as demonstrators**. Agent + protocol + services lead; silvery + silvercode + km repositioned as open reference implementations. Cross-elasticity becomes positive throughout.
- **[S23](#s23) ★ — The playground for the UI of agentic work**. Integrated app (chat + docs + code + agents + boards + diagrams), one app with multiple panes. TUI today → web/native via silvery's multi-target.
- **[S26](#s26) ★ — Docker for agents**. `.brain` as portable agent format; spec-authorship moat at the protocol layer; composes with S25.

**Why**: simultaneously cross-elasticity-positive, solo-bandwidth-fitting, /pro-validated (25/25 cluster math), multi-acquirer-optional, capital-efficient (architecture compounds across paths).

**What NOT to do**: lock to S1 (high cross-elasticity exposure); pursue Family H (abandons architectural coherence); ship production hosted services solo; promote PlainBrain as a standalone "third standard" before silvery validates; pre-form a separate entity for agentroom.

**Sequencing**:

| Phase | Team | Capital | Focus |
|---|---|---|---|
| Months 0-3 | solo | bootstrap, ~$0 burn | silvery maintenance + ACP-proxy ship-now cluster (S18) closed/open-core (BSL on gateway from day one) + tribe wire as INTERNAL API + conformance harness in private + `.brain` as `run-brain` utility (NOT a spec) + silvercode-as-open-reference (zero-config to agentroom.cloud) + dogfooding km |
| Months 3-6 | first hire | angel ($0.5-1M); ~$25-40k/mo | agentroom *preview* gateway (no SLA), tribe wire published as documentation (not formal MSC), `.brain` registry preview with provenance/signing, S23 demo, design-partner outreach |
| Months 6-12 | small team (~5) | seed ($3-5M); ~$120-180k/mo | production services, enterprise readiness, AI-lab outreach, submit formal MSC for `org.agentroom.*` with dominant impl behind it |
| Months 12+ | seed → Series A | revenue + Series A optional ($8-15M) | signal-driven path deepening (AI-lab inbound → S24; services scaling → S2/S16; `.brain` adoption → S26 standalone; PKM market shifts → Family B). Standardize-to-weaponize — formalize `.brain` once 10K+ brains in registry. |

*Burn estimates assume Bay-Area engineering rates; remote-only or international hiring shifts ranges 30-50% lower. Solo timelines slip 1.5-2× under realistic distraction load.*

---

<a id="phase-0"></a>

## Phase 0 — Meta-frame: architecture as graph, strategies as paths

The portfolio is a layered architecture. Strategies are *paths* through it, not exclusive choices.

- **The architecture is the asset.** Layers (UI → features → substrate → agents → protocols → services) accrete from [silvery](#g-silvery) + [flexily](#g-flexily) + [tribe](#g-tribe) + km + [agentroom](#g-agentroom). They exist regardless of which strategy executes.
- **Strategies select** which customer segments to serve, which components to open-source, which monetization model to apply.
- **Paths coexist.** [Cursor](#g-cursor) can be the [silvercode](#g-silvercode) customer; [Anthropic](#g-anthropic) can be the silvery acquirer; PKM users can be the km customer; AI-tool builders can be the services customer. Same substrate, different traversals.
- **Pivots are cheap** because architecture compounds across paths. Investing in silvery, tribe, agentroom, services is reusable; investing in a single product instance is not.
- **Acquirers buy paths-with-architecture.** silvery → AI lab; agentroom → infra company; km → PKM acquirer. Different acquirers, different price points, same graph.

**Strategic implication**: decide *which paths to traverse first*, not *which assets to build*. Start with paths that share the most architecture, generate signal early, avoid paths needing unique infrastructure no other path uses.

---

<a id="phase-1"></a>

## Phase 1 — Inventory

### A. Major shipped assets

**silvery** — React TUI framework. 98.6% [Ink](#g-ink)-compat, 3K [DL/wk](#g-dl-wk), polished, multi-target rendering (TUI today → canvas/DOM/web/native), mouse-first, incremental rendering, 45+ components. silvery.dev live.
- Sub-projects: `silvery/ink` (the migration shim, ~3K LOC, sed-substitutable Ink replacement); flexily (Yoga-compatible flex layout, 1.5-5.5× faster, no WASM, 1561 tests).
- **Potential**: arguably the best React TUI framework in existence; years of compressed work; composable architecture extends to canvas/DOM/native and to other reconcilers (Svelte/Vue/Solid).
- **Acquisition target by Big AI labs (Anthropic, Google, Microsoft, Cursor) wanting off Ink**. Only architecturally-suited drop-in (see A4). One Big-AI-lab migration → permanent brand halo.

**silvercode** — multi-pane agentic IDE on silvery; near-term wedge: squad mode (parallel agents + CrossAgentState). Pre-launch.
- **Potential**: in combination with silvery + km + flexily, a *new agentic-coding desktop* — chat + kanban + agent orchestration + shared node-tree storage + on-demand interactive architecture diagrams + ambient cross-agent state viz. New category, not "Cursor with a different framework."

**km / Knowledge Machine** — agentic knowledge workspace; board + calendar + journal + agents + recall, bidirectional md↔SQL sync. knowledgemachine.co. Pre-launch.
- **Potential**: km's core asset is the *substrate* (markdown filesystem + bidirectional sync + KNode model + recall + commands). The substrate can serve multiple framings:
  - PKM-for-AI workspace ([Obsidian](#g-obsidian)-for-AI-agents) — every AI tool now ships markdown vaults; Obsidian is the only serious vault editor and is not AI-native.
  - Decomposed into silvercode features (board, journal, outline, recall) — silvercode-with-built-in-backlog gets stronger.
  - Multi-tenant vault for any silvery app — third parties embed km components.
  - Canonical PlainBrain reference workspace.
  - **General pivot target** — anything needing a markdown substrate + bidirectional UI.

**tribe** — cross-session/cross-machine coordination protocol; [MIT](#g-mit) in vendor/[bearly](#g-bearly). Wire + event vocabulary + room/chat patterns + lease semantics + ambient channels.
- **Potential**: precondition for agentroom and the entire ACP-proxy stack. If shipped as [MSC](#g-msc) into Matrix before Anthropic/Google/OpenAI publish theirs, becomes the canonical agent-coordination protocol. Spec-authorship is generational-scale moat.

**PlainBrain** — markdown-filesystem shape km uses; not yet formal spec. Domains plainbrain.org + plainbrains.com owned.
- **Modest framing**: markdown profile for agentic-work repos; interop with Obsidian/[Notion](#g-notion)/Cursor Rules/Claude Projects.
- **Ambitious framing — `.brain` as portable agent format** (the agent equivalent of `Dockerfile`). A `.brain` contains agent knowledge, rules/skills, persona/config, optional prior conversation history.
  - Operations: `run-brain my.brain` (instantiate); `run-brain a.brain b.brain c.brain` (multi-agent runtime); `merge-brain a.brain b.brain` (combine ensembles); `fork-brain my.brain` (git-style branching); `pack-brain ./vault → my.brain` (bundle).
  - Solves: agent portability (not locked to one vendor), interoperability (any compatible runtime loads any brain), composability (ensembles), versioning (git-track), distribution (share `recall-thought.brain` like an npm package).
  - **Strategic ceiling**: Docker-shape. Generational-scale if standard adoption happens.
  - **Reframes the portfolio**: silvery = UI for brains; tribe = coordination wire; agentroom = cloud runtime; PlainBrain = the format; km = brain editor; silvercode = canonical reference brain.

**agentroom gateway** — planned ACP↔Matrix bridge, paid managed cloud. Not built. Top venture-rubric score (24/25 alone, 25/25 with cluster). Described in ventures doc as *"candidate generational company."* Adjacency check (2026-04-28): [Open-ACP](#g-open-acp) (280 stars) ships a self-hosted bridge for [Claude Code](#g-claude-code)/Codex → Telegram/Discord/Slack. Validates the demand pattern; partially commoditizes the *adapter* surface. agentroom's value prop sharpens toward managed-cloud differentiators (multi-machine routing, SLA, `org.agentroom.*` MSC authorship, multi-tenant) rather than just having connectors.

**bearly tooling family** — recall, tribe-cli, llm CLI, worktrees, hooks. The entire Claude-Code-orchestration toolkit. Itself productizable; pieces can spin out as standalone tools.

### A2. Minor assets (one bucket)

**termless** · **terminfo.dev** · **vt100/vt220/vterm.js** · **loggily** · **mdspec** · **alien-projections / alien-resources / alien-trees** · **vimonkey** · **vitepress-enrich** · **@silvery/{ansi, color, commander}** · **claude-tty-mcp** · **@beorn/{accountly, tap, watcher-chaos}**.

Individually uplift-able if a market opportunity surfaces (termless → "Vitest for TUIs"; loggily → universal logging primitive). Today: support cast, not lead.

**Domains**: silvery.dev, plainbrain.org, plainbrains.com, knowledgemachine.co, ardentum.co, termless.dev, loggily.dev, mdspec.org, beorn.codes/flexily/.
**Brand presence**: silvery 3K DL/wk; 62 npm packages under maintainer `beorno`.

### A3. The portfolio decomposes into layers, not products

```
─────────────────────────────────────────────────────────────────
UI                  silvery (multi-target), flexily
─────────────────────────────────────────────────────────────────
APP FEATURES        Hierarchy X-ray view (Boardliner / Super Finder)
                    code/chat panes, md editor (Notion-like),
                    diagram editor (silvery+flexily+canvas),
                    agent orchestration UI (squad mode, claims)
─────────────────────────────────────────────────────────────────
SUBSTRATE           PlainBrain spec, repo-as-DB, md↔SQLite + watcher
─────────────────────────────────────────────────────────────────
AGENT               (1) Universal ACP-wrapper for any third-party
                        coding agent (Claude Code, Codex, Aider, Cline,
                        Continue, pi). silvercode hosts ALL of them.
                    (2) Sub-agents on the wire (recall-thought, critic,
                        style-watcher, test-runner, docs-keeper) — the
                        agent-in-the-middle platform.
                    (3) First-party coding agent (the "pi shape" — own
                        the agent that ships as silvercode's default).
                        Owning the UI layer enables vertical-integration
                        moves nobody else can match: silvercode UI ⇄
                        first-party agent ⇄ ACP-services. Default agent
                        with ++ features tied to silvery primitives
                        (squad mode, hierarchy X-ray, ambient channels).
                        NOT a Cursor clone; coexists with (1) — silvercode
                        is the best place to run our agent AND any
                        third-party agent.
                    Multi-agent coordination, ambient-context-safety,
                    recall, handoff
─────────────────────────────────────────────────────────────────
PROTOCOL            AUTHORED: tribe wire, org.agentroom.* events,
                    PlainBrain / .brain spec
                    INTEROP: ACP, MCP, Matrix, OAuth (baseline)
─────────────────────────────────────────────────────────────────
SERVICES            KM-side: hosted recall, sync, vault-cloud, teams
                    Coding-side: subscription-auth, ambient-safety,
                    agentroom gateway, CrossAgentState orchestration
─────────────────────────────────────────────────────────────────
SUPPORTING          Standards (CC BY 4.0), feeder sites, bearly
                    tooling (recall/tribe/llm/hooks/beads/worktrees),
                    Palo Alto / capital / advisory partnerships
─────────────────────────────────────────────────────────────────
```

**Hierarchy X-ray view = candidate killer demo**. No competitor ships a UI primitive that exposes 1000-2000 items across 3-5 hierarchy levels at a glance, optimized for big monitors. Obsidian outliner doesn't go wide; Notion is one page at a time; VS Code file explorer is a narrow column; Finder column-view is small per-column; mind maps top out around ~50-100 nodes. Wide horizontal hierarchy view that uses the *full big-monitor surface* to make a 5-level repo legible at a glance — silvery + flexily + canvas can render it. *"See your entire codebase at a glance, 1000-2000 items, 5 levels deep."*

**Layer-aware insight**: the question isn't *"which product wins?"* but *"which layers do we own?"*

- **Always own**: [silvery](#g-silvery) (UI), [tribe](#g-tribe) + [PlainBrain](#g-plainbrain) (authored protocols), [agentroom](#g-agentroom) (services anchor). Competitors structurally can't replicate cheaply.
- **Compose freely**: [silvercode](#g-silvercode), km, future apps. Vehicles for the layers, not the layers themselves.
- **Open-source generously at the layer level; monetize at the services level + selectively at app-shape.**

**License partitioning by layer** (per /pro 4-leg consensus + /deep prior art — Confluent, Mongo, Elastic, HashiCorp, Redis):

| Layer | License | Why |
|---|---|---|
| [silvery](#g-silvery) framework + tribe client SDKs + adapters | [Apache 2.0](#g-apache) | Adoption funnel; permissive maximizes reach |
| [tribe](#g-tribe) spec text + `org.agentroom.*` + [`.brain`](#g-plainbrain) spec | CC BY 4.0 | Remixability — required for becoming a standard |
| Reference parsers + reference clients | Apache 2.0 | Working code under spec to prove correctness |
| **Reference gateway** (single-user, no SLA, runnable demo) | **AGPL** | Viral copyleft scares cloud clones away from repackaging |
| **Production gateway, CrossAgentState orchestrator, ambient-safety pipeline, multi-machine router, sub-agent compute** | **[BSL 1.1](#g-bsl) OR [Elastic License v2](#g-elastic-l) OR [Confluent Community License](#g-ccl) — from day one** | Source-available, cloud-protective. Pick day one to avoid post-launch fork-risk (OpenSearch, OpenTofu, Valkey) |
| All server-side repos | [CLA](#g-cla) required | Preserves relicense optionality |

**Key prior-art lesson**: switching licenses *post-adoption* triggers fork risk (Elastic→OpenSearch 2021, HashiCorp→OpenTofu 2023, Redis→Valkey 2024). License the production server correctly day one. Confluent's CCL (selective, since 2018) avoided this; Kafka stayed Apache while ksqlDB/Schema Registry got CCL.

**Vertical-integration insight (added 2026-04-28)**: owning the UI layer creates leverage that pure-services competitors can't match. The full vertical stack — UI ⇄ first-party agent ⇄ ACP-services — lets us ship UI features that *only* compose properly with our agent + our services. Cursor's moat is exactly this shape: Cursor supports any model API but the Composer + Agent UX is first-party and the integrated experience is what people pay for. The strategic move:

- **Universal client (option 1) stays first-class** — silvercode hosts Claude Code, Codex, Aider, Cline, Continue, pi. Gives us the multi-agent coordination story (squad mode, parallel agents, cross-agent state).
- **First-party coding agent (option 3) ships as the default** — the agent silvercode reaches for unless you BYO. Realistic execution: fork pi (badlogic) or opencode and add silvercode-specific integrations (multi-pane orchestration, hierarchy-X-ray-aware planning, ambient-channel awareness, native squad-mode coordination). Don't build a Cursor-class agent from scratch.
- **Services tier (Layer 2/3) anchors monetization** — auth, recall, ambient-safety, hosted gateway. Same ACP wire used by both first-party and third-party agents.

Result: a differentiated default experience competitors can't fully copy without owning all three layers, while staying open at the wire so the multi-agent story holds.

### A4. OpenTUI architectural reality check

The Ink-migration market is **structurally inaccessible to [OpenTUI](#g-opentui)**.

| Ink | OpenTUI |
|---|---|
| `<Box>`, `<Text>`, `<Spacer>` (PascalCase JSX) | `<box>`, `<text>`, `<span>` (lowercase JSX) |
| `useInput((input, key) => {})` | `useKeyboard((event) => {})` |
| `useApp()` | `useRenderer()` |
| `render(<App />)` | `createRoot(renderer).render(<App />)` |
| `useFocus()`, `<Static>`, `measureElement()` | different focus / static / measurement |

Every JSX tag and hook is differently shaped. Ink → OpenTUI rewrites every UI binding. By contrast, `silvery/ink` is `import from "ink"` → `import from "silvery/ink"`, sed-substitutable. silvery's migration market is uncontested; OpenTUI cannot enter it without authoring a separate Ink-compat layer.

### B. Founder + company strengths

**Technical depth** — incredible depth across the TUI/terminal stack (silvery + flexily + termless + terminfo + vt100/vt220/vterm + loggily + mdspec + the migration shim). From terminal emulator backends up to React reconciliation, with rigorous test infra. Architectural coherence: components recompose cheaply (silvery → canvas is a binding swap, not a rewrite). Cross-cutting patterns (alien-* reactives, scope-based lifecycle, TEA, bidirectional md↔tree sync, ACP/[MCP](#g-mcp)/Matrix interop) travel well.

**Strategic** — daily dogfooding of PKM + AI-coding workflows (km, silvercode, silvery, tribe, recall, beads); Claude-Code-ecosystem fluency (bearly tooling); cross-border tax/legal sophistication (Stripe Atlas, multi-residency, prior C-Corp + holding-company structuring, AppAnnie/data.ai exit); **solo founder + AI-augmented velocity** (one person + agents builds the entire portfolio); existing investor/operator network + **Palo Alto residency** (warm intros to founders, operators, devtools VCs are coffee-meeting-distance).

**Operational** — beads + tribe + recall workflow itself proves the agentic-workdesk thesis; vault-as-substrate-for-life integrates personal/business/family-office; acquirer-readable architecture (clean, well-documented, easy to value).

**Unfair advantage**: deep TUI/terminal stack + daily dogfooding + AI-augmented solo velocity + cross-border legal sophistication, all sitting on architectural coherence that lets these pivot cheaply. Strategies that *use* this combination compound; strategies that don't (e.g., a security-first SaaS pitch — [S14](#s14)) waste it.

### C. Constraints

- Solo founder bandwidth — Delei is on Mama Muse; realistically <40 hrs/week across silvery + km + silvercode + tribe + agentroom + PlainBrain.
- No formal entity yet (Wyoming [HoldCo](#g-holdco) planned Q1 2026 — see [Phase 4](#phase-4)).
- No external capital; bootstrap mode unless raise.
- Pre-revenue across the silvery/silvercode/km/tribe portfolio.
- 3K DL/wk silvery base rate stable for months — possible "demand thermocline."
- Cannot win head-on against OpenTUI ($8M [Cota](#g-cota) seed, [Anomaly](#g-anomaly) distribution, Kilo OEM proof) on greenfield React TUI.
- Cannot win head-on against Cursor ($9.9B / $500M [ARR](#g-arr)) on integrated agentic IDE.
- Ink-community sensitivity — Vadim is well-liked; aggressive migration framing risks backlash.
- Operational infrastructure debt — services need production-grade, not prototype.

---

<a id="phase-2"></a>

## Phase 2 — Market

### Customer segments

| Segment | Size | Notes |
|---|---|---|
| Ink users (existing AI CLIs) | 1M+ DL/wk Ink ecosystem | Claude Code, Copilot CLI, Wrangler. Capability-capped; React-locked. |
| OpenTUI users (greenfield) | smaller, well-funded | Anomaly's opencode, [Kilo Code](#g-kilo-code). |
| Bubble Tea users (Go-native) | mature niche | Glow, Crush, Soft Serve. Not silvery's segment. |
| Generic React TUI builders | high-volume, low-margin | Internal CLIs, dashboards. |
| Agentic IDE consumers | $500M+ ARR (Cursor) | Cursor users, Claude Code users. |
| PKM-for-AI users | growing fast | Obsidian + AI plugins, Notion AI, Logseq. No AI-native incumbent. |
| AI infra consumers | $billions across vendors | Anyone building AI tools needing auth/recall/safety/sync. |
| Enterprise AI ops | nascent, high-value | Cross-tool coordination, ACP routing, compliance. |
| AI lab insiders | tiny, extremely high-leverage | Anthropic, Google, Microsoft, OpenAI. Acquihire targets. |

### Competitors / adjacents

- **Ink-migration**: silvery alone (OpenTUI architecturally incompatible). Only competitor: maintainers staying on Ink.
- **Greenfield React TUI**: OpenTUI, Ink itself, Bubble Tea (cross-pollinates).
- **Agentic IDE**: Cursor, Claude Code, Aider, Cline, Continue, Goose, Crush, opencode, Kilo Code, Codex CLI, gemini-cli, OpenHands.
- **PKM-for-AI**: Notion ($30B+), Obsidian, Logseq, Reflect, Mem, Tana; Cursor Rules / Claude Projects / ChatGPT Memory (the AI-native players).
- **AI infra services**: [Vercel](#g-vercel) AI SDK + AI Gateway (~$200M ARR), [Auth0](#g-auth0) ($6.5B), [Algolia](#g-algolia) ($100M+), Supabase ($50M+), LangChain/LangSmith, Helicone, Portkey, Pinecone, Weaviate, Modal, E2B.
- **Cross-tool coordination / ACP**: [Zed Industries](#g-zed-industries) (ACP creator), Anthropic + OpenAI implicit (Claude Code, Codex), Matrix Foundation.
- **Agent-coordination layer competitors (April 2026, per /deep prior-art research)**:
  - **[Zed ACP Registry](#g-acp-registry)** — shipped January 2026 by Zed Industries. Public registry for ACP-compatible agents. *Naming/distribution surface now contested.*
  - **[agentclientprotocol.com/registry](https://agentclientprotocol.com/get-started/registry)** — community ACP-agent registry. Lists Claude Agent, Gemini CLI, Copilot, Cline, Cursor, goose. Format: `agent.json` + `icon.svg`; distribution: JSON file at `cdn.agentclientprotocol.com/registry/v1/latest/registry.json`. *Distribution metadata for existing agents — not a portable agent format.*
  - **[github.com/Open-ACP](https://github.com/Open-ACP)** (280 stars) — self-hosted ACP bridge: Claude Code/Codex/etc → Telegram/Discord/Slack. Has plugin registry, adapters, workspace plugins, git monitoring, TTS. *Validates the bridge category; partially commoditizes the Discord/Slack-adapter portion of the agentroom value prop.*
  - **[Vercel AI Gateway](#g-vercel-ai-gw)** — already in production, multi-provider integration, observability, caching. Strongest direct competitor for the gateway slot.
  - **[Helicone](#g-helicone)** (OSS observability), **[Portkey](#g-portkey)** (gateway with retries/fallbacks/caching), **[OpenRouter](#g-openrouter)** (model aggregator/routing) — each occupies a slice of the services tier (observability, gateway, routing).
  - **[LangChain Agent Middleware](#g-langchain) + [LangGraph](#g-langgraph)** — orchestration as production-first concept; threat to agentroom's coordination-state layer (#13).
  - **[LlamaIndex agents](#g-llamaindex)** — multi-agent topology support.
  - **Slack + Anthropic** — deepening "agents in Slack" with [MCP](#g-mcp)-connected assistants; Claude Code routes work from Slack. *Threat: Slack might become the canonical chat-surface bridge, eating part of agentroom's adapter value.*
  - **Gap (the agentroom window)**: no public production [SLA](#g-sla)'d ACP↔Matrix gateway by Zed/JetBrains. Multiple community MCP servers for Matrix exist but no SLA-bearing managed offering. agentroom's window is real but contested by the registry players above.

### Trends + windows

- AI agents getting more autonomous (long-running, multi-step).
- Agent coordination across machines becoming a real need (squad mode demand).
- Markdown-as-substrate gaining (Obsidian + AI, Notion AI exports, Cursor Rules).
- Multi-pane / multi-agent UX expected (Cursor multi-tab, Claude Code parallel).
- Open-source standards as defaults (MCP, ACP, OAuth-for-AI).
- Cloud services as the boring AI infra layer (Auth0 / Algolia pattern translating to AI).
- Devtools fundraising remains hot (Cursor, Vercel, Replit priced up).
- **Obsidian likely acquisition target in 12-24 months** by Microsoft/Notion/Anthropic. Either outcome creates km opportunity: (a) acquihire makes Obsidian's roadmap captive → km serves the power-user segment that wants AI-native + independent; (b) accelerated Obsidian-AI features confirm the category and raise market awareness km can ride.

**Closing windows**:
- Ink-migration: 12-18 months (longer Ink projects entrench or rewrite to OpenTUI).
- ACP standard: 6-12 months (whoever ships canonical hosted gateway first).
- Notion-AI consolidation: 12-24 months (Notion AI is bolt-on; PKM-native AI tools have a wedge).
- Anthropic/OpenAI internal-tooling: ~12 months (likely Anthropic builds Claude Code v2).

### Demand signals (real evidence)

- 1M+ DL/wk for Ink-using AI CLIs (real demand, capability-capped).
- [gbrain](#g-gbrain) (third-party PKM-for-AI tool, 4,600+ pages, dogfooded by founder) — existence proof of the PKM-as-md-files-for-AI movement; not a personal asset.
- $8M raised by Kilo on OpenTUI — greenfield TUI is fundable.
- Anthropic Claude Code adoption — agentic CLI as a category is validated.
- ACP shipped in Zed — coordination-protocol demand is real.
- Cursor $500M ARR — agentic IDE is a real commercial market.
- Vercel + Auth0 + Algolia outcomes — infrastructure-as-a-service is monetizable.

---

<a id="phase-2-5"></a>

## Phase 2.5 — The layered AI stack: which layers can we play in?

```
L7  APPLICATIONS               Cursor, Claude Code, Notion AI, ChatGPT
L6  WORKSPACES / ENVIRONMENTS  Cursor, Notion, Obsidian, VS Code,
                               silvercode, km
L5  AGENT FRAMEWORKS           LangChain, LlamaIndex, Vercel AI SDK
L4  UI FRAMEWORKS              silvery, Ink, OpenTUI, React
L3  COORDINATION / PROTOCOLS   MCP, ACP, tribe, Matrix; agentroom
L2  SERVICES                   Auth0, Vercel AI Gateway, Algolia,
                               Pinecone, Helicone, LangSmith
L1  MODEL APIs                 Anthropic, OpenAI, Google
L0  COMPUTE                    Modal, E2B, AWS, GCP
```

### Team-size requirements per layer

| Layer | Solo (today) | 2-3 (co-founder + 1) | 5-10 (seed) | 20+ (Series A) |
|---|---|---|---|---|
| L7 Applications | not viable | not viable | not viable | viable |
| L6 Workspaces (km, silvercode) | viable for v1 + dogfooding | viable to [PMF](#g-pmf) | viable to launch | needed for scale |
| L5 Agent frameworks | not viable | viable with niche | viable | viable |
| L4 UI frameworks (silvery) | viable today | better community mgmt | strong support coverage | foundation-team scale |
| L3 Coordination (tribe, agentroom) | spec-only viable | viable with infra-ops co-founder | production gateway + first customers | enterprise SLA |
| L2 Services | demo-only viable | each service ~2-3 people | per-service team + [SRE](#g-sre)/security/sales | enterprise |
| L1 Model APIs | not viable | not viable | not viable | not viable (capital) |
| L0 Compute | not viable | not viable | not viable | not viable (capital) |

### Cross-elasticity insight

silvery (L4) → silvercode (L6) is **where cross-elasticity bites hardest** because L4-framework-users *are* L6-workspace-builders. The same audience that adopts silvery is structurally equipped to build silvercode-equivalents themselves.

silvery (L4) → services (L2) and agentroom (L3) → enterprise sales sit in layers where **cross-elasticity is positive** — services and protocol coordination are things users want to *avoid* doing.

The same portfolio, played at different layers, has fundamentally different revenue dynamics:

- **L4 silvery** — open framework, brand halo. No direct revenue path. Accept that.
- **L3 agentroom** — open spec + paid hosted gateway ([Confluent](#g-confluent) shape). Revenue.
- **L2 services** — silvery-cloud / hosted services tier (auth, recall, ambient-safety, sync). Vercel pattern. Revenue.
- **L6 km** — PKM-for-AI workspace. Less cross-elasticity exposure. Revenue.
- **L6 silvercode** — open reference implementation that demonstrates L2/L3 services. Marketing/halo, not revenue.

Three commercial revenue streams, two open marketing assets, one protocol asset. Acquirer-friendly at multiple price points (L2 or L3 acquired independently of L6 km).

---

<a id="phase-2-6"></a>

## Phase 2.6 — Five strategic directions

- **[D1](#phase-2-6) — silvery + silvercode** (locked Option 5). Open framework + proprietary IDE + services backing. Cross-elasticity exposure: high.
- **[D2](#phase-2-6) — km / PlainBrain as PKM-for-AI** (Notion-meets-Obsidian shape). Subscription workspace play, *or* decompose km into silvercode features. Cross-elasticity exposure: low.
- **[D3](#phase-2-6) — Services-led, silvercode is open reference** (Vercel/Auth0/Algolia pattern). Cross-elasticity: positive.
- **[D4](#phase-2-6) — ACP-proxy / tribe stack inside the portfolio**. Multi-venture: gateway + storage + coordination + compute platform.
- **[D5](#phase-2-6) — ACP-proxy / tribe stack spun out** (Confluent shape). Separate entity, separate raise, separate co-founder(s). Decoupled from silvery/silvercode/km success.

[D4](#phase-2-6) and [D5](#phase-2-6) differ on whether the protocol-and-coordination cluster lives *inside* the portfolio or is *separated*. [D4](#phase-2-6) keeps capital, brand, and acquisition events together; [D5](#phase-2-6) lets each part rise/fall on its own terms.

---

<a id="phase-2-7"></a>

## Phase 2.7 — ACP-proxy is itself a multi-venture cluster

The ACP-proxy concept is 14 distinct ventures per [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md). The top cluster reaches the **25/25 rubric ceiling** — described as a *"candidate generational company."*

### Architectural progression (each layer is a venture; layered = bigger moat)

| Layer | Venture | Score |
|---|---|---|
| L4 — Agent-in-the-middle platform | #14 (Cloudflare Workers analog: persistent sub-agents — recall-thought, critic, style-watcher) | 21/25 |
| L3 — Coordination state | #13 (derived todos / locks / decisions / handoffs / asks — *"agent collaboration database"*) | 23/25 |
| L2 — Vault session storage | #12 (`org.agentroom.*` events as JSONL + markdown round-trip; km vault as canonical session store) | 22/25 |
| L1 — ACP↔Matrix bridge + spec authorship | #11 (gateway + `org.agentroom.*` MSC; the substrate) | 24/25 |

**Cluster math**: #11 alone = 24/25; #11+#12 = 24-25/25; **#11+#12+#13 = 25/25 ceiling**; #11+#12+#13+#14 = 25/25 qualitatively bigger.

### Plus 10 ship-now plug-in ventures

| # | Venture | Score |
|---|---|---|
| 1 | Per-session observability dashboard | 19/25 |
| 2 | Cross-agent recall (Memory-as-a-Service) | 19/25 |
| 3 | Cost dashboard + budget caps | 18/25 |
| 4 | Tool governance + universal MCP registry | 17/25 (window: 18mo) |
| 5 | Auto-routing / model arbitrage | 15/25 (OpenRouter has 2yr lead) |
| 6 | A/B + replay + shadow | 15/25 |
| 7 | Cross-machine federation | 15/25 |
| 8 | Provenance / signing | 15/25 |
| 9 | Prompt redaction + egress firewall | 15/25 (wrong customer) |
| 10 | Multi-surface output (Slack/voice/REST) | 14/25 (subsumed by #11) |

**The ventures-doc insight**: *"Three of the top four are the same product: a 'tribe control-plane plugin pack' (observability + recall + cost + governance). The strategy isn't to pick one; it's to ship all four as one v1 of tribe-as-control-plane. Could clear $50M ARR within 3 years; $500M+ exit candidate."*

The ACP-proxy cluster has the highest commercial ceiling in the entire portfolio. It's also the only cluster *fully validated by rubric scoring* — silvercode and km don't have equivalent venture-scored backing.

---

<a id="phase-3"></a>

## Phase 3 — Strategy menu

<a id="family-map"></a>

### Family map

26 strategies across 8 families. Choosing within a family is tactical; choosing *across* families is the strategic decision.

| Family | Theme | Strategies |
|---|---|---|
| **A** | Locked-direction variants | [S1](#s1), [S3](#s3) |
| **B** | PKM-led | [S4](#s4), [S7](#s7), [S17](#s17) |
| **C** ★ | Services-led (Vercel/Auth0/Algolia) | [S2](#s2), [S16](#s16), **[S25](#s25) ★** |
| **D** ★ | Agent + protocol play (ACP-proxy stack) | [S5](#s5), [S15](#s15), [S18](#s18)–[S22](#s22), **[S26](#s26) ★** |
| **E** | Bundled / integrated demonstrators | [S9](#s9), **[S23](#s23) ★** |
| **F** | Acquihire-positioned | [S11](#s11), [S24](#s24) |
| **G** | Capital strategy | [S10](#s10), [S13](#s13) |
| **H** | Outside-portfolio shapes | [S6](#s6), [S8](#s8), [S12](#s12), [S14](#s14) |

**Recommendation**: [Family C](#family-map) + [Family D](#family-map) + [S23](#s23) from [Family E](#family-map). **[S25](#s25) = lead**; **[S23](#s23) = primary demonstrator**; **[S26](#s26) = ambitious protocol-authoring play that composes with [S25](#s25)**.

### Scoring dimensions

- **B**andwidth load (1=light, 5=heavy)
- **T**ime to first revenue (months)
- **C**eiling (commercial revenue ceiling: low / mid / high / very-high)
- **R**isk (1=low, 5=high)
- **D**ependencies

### Strategies

<a id="s1"></a>

#### S1 [A] — "Cursor with our framework" (locked Option 5)

[D1](#phase-2-6). silvery open Apache + [CLA](#g-cla), silvercode proprietary IDE, tribe wire open, services proprietary, PlainBrain elevated. The integrated portfolio bet.
**Score**: B=5 / T=12-18 / C=mid-high / R=4 (cross-elasticity exposure) / D=silvery validates *and* silvercode finds PMF *and* services scale.

<a id="s2"></a>

#### S2 [C] — "Vercel for terminal" (services-led, silvercode open reference)

[D3](#phase-2-6). silvery Apache. silvercode open-sourced as the *reference* IDE. Revenue from services tier (auth, recall, ambient-safety, agentroom, sync). Kubernetes → GKE pattern.
**Score**: B=5 / T=18-24 / C=very-high / R=4 / D=silvery validates *and* services productize *and* [SOC2](#g-soc2)/compliance.

<a id="s3"></a>

#### S3 [A] — "JetBrains pattern" (close silvery, sell silvercode standalone)

silvery MIT but unpromoted. silvercode commercial-only, no open showcase. JetBrains shape: own framework privately, sell IDE.
**Score**: B=4 / T=6-9 / C=mid / R=3 / D=silvercode finds standalone PMF without silvery brand halo.

<a id="s4"></a>

#### S4 [B] — "Notion-for-AI" (km/PlainBrain PKM venture, silvery deferred)

[D2](#phase-2-6). silvery quietly maintained, no big launch. Focus: km + PlainBrain spec + the broader PKM-as-md-files movement (validated by gbrain + Obsidian + AI-vault movement). Subscription billing for km-cloud.
**Score**: B=3 / T=12-18 / C=mid / R=3 / D=PKM-for-AI category sustains; km finds wedge.

<a id="s5"></a>

#### S5 [D] — "Confluent for AI agents" (agentroom spun out)

[D5](#phase-2-6). agentroom Inc as separate entity. Open ACP wire spec + open reference gateway + paid hosted control plane. Standalone fundraise ($3-5M seed). Infra-ops co-founder.
**Score**: B=3 / T=12-18 / C=high / R=4 / D=ACP standard wins; co-founder; no competing protocol from labs.

<a id="s6"></a>

#### S6 [H] — "Charm.sh for React" (multi-product OSS suite)

silvery + termless + loggily + flexily + mdspec as a coherent "developer infrastructure suite for terminal apps." Premium support / hosted versions monetize across the suite.
**Score**: B=3 / T=18-24 / C=mid / R=3 / D=cross-product brand thesis works.

<a id="s7"></a>

#### S7 [B] — "Mem.ai but local-first" (PKM-for-AI productized)

PlainBrain + km + adjacent tools (gbrain-style) as a *local-first* personal-AI substrate. Subscription for cloud sync only; substrate stays local-first. Counter-position to cloud-native PKM-AI.
**Score**: B=3 / T=12-18 / C=mid / R=3 / D=local-first AI category gains momentum.

<a id="s8"></a>

#### S8 [H] — "Linux Foundation pattern" (donate silvery to a foundation)

silvery → CNCF / Apache / OpenJS. Strip personal stewardship burden. Focus 100% on silvercode + km + services. Community-led silvery still drives funnel.
**Score**: B=2 / T=12 / C=mid-high / R=3 / D=foundation accepts; community sustains.

<a id="s9"></a>

#### S9 [E] — "Cursor + Notion bundled" (agentic workdesk subscription)

silvercode + km bundled as one subscription. One pricing page, one auth, one cloud. Position as *"the integrated thing both companies are trying to be."*
**Score**: B=5 / T=12-18 / C=high / R=4 / D=both products find PMF; bundle differentiated.

<a id="s10"></a>

#### S10 [G] — "Atomic Inc studio" (multi-venture, separate raises)

silvery (community OSS), agentroom Inc (Confluent shape, separate raise), silvercode Inc (Cursor shape, separate raise), km Inc (PKM venture, separate raise). Each has its own cap table.
**Score**: B=5 / T=18-36 / C=very-high / R=5 / D=founder splits across multiple entities; capital available; co-founders for each.

<a id="s11"></a>

#### S11 [F] — "Acquihire optimized"

Build silvery + km + tribe to *just enough* for acquihire by Anthropic / Vercel / Cursor / Notion. Optimize for visibility + technical credibility + complementary integration with one acquirer's platform.
**Score**: B=3 / T=24-36 / C=high (single liquidity event) / R=4 / D=at least one acquirer wants what's built.

<a id="s12"></a>

#### S12 [H] — "Bootstrapped consulting first"

silvery as portfolio piece; primary revenue from custom Ink→silvery migrations + agentic-IDE consulting. Build as you bill. Patio11 / 37signals shape.
**Score**: B=4 / T=1-3 / C=low-mid / R=2 / D=consulting demand exists.

<a id="s13"></a>

#### S13 [G] — "Devtools VC seed" (pre-launch raise on integrated narrative)

Take the "three open standards + two products + services + agentroom" narrative to devtools VC ($3-5M seed). Capital hires 2-4 engineers; founder stays strategic. Vercel-day-one shape.
**Score**: B=2 (with team) / T=24+ / C=very-high / R=4 / D=narrative is fundable without traction.

<a id="s14"></a>

#### S14 [H] — "Snyk for AI" (security-first wedge)

Pivot: silvercode is a *security-first* agentic IDE. Ambient-context-safety pipeline becomes the wedge. Sell to enterprises whose developers use AI tools but need leak prevention / audit / compliance.
**Score**: B=4 / T=12-18 / C=mid-high / R=4 / D=enterprise security-for-AI is real budget; SOC2-ready security tooling.

<a id="s15"></a>

#### S15 [D] — "Anthropic-direct" (silvery + agentroom for AI-lab teams)

Position silvery + agentroom for Anthropic / OpenAI / Google internal-tooling teams. Direct enterprise sale or strategic partnership. Don't chase the long tail; chase the 5-10 customers that matter.
**Score**: B=3 / T=6-12 / C=high (per customer) / R=4 / D=AI labs return calls; ACP becomes the wire they want.

<a id="s16"></a>

#### S16 [C] — "Auth0 for AI agents" (services-only, silvery is portfolio)

[D3](#phase-2-6) sharper. silvery stays open framework but is *not* the focus. Flagship is the services tier alone — auth, secrets, BYO-key, multi-vendor LLM gateway, ambient safety. Sell to anyone building AI tools.
**Score**: B=4 / T=18-30 / C=very-high / R=4 / D=services market matures; cross-framework portability.

<a id="s17"></a>

#### S17 [B] — "Ghost for PKM" (hosted + self-hosted)

[D2](#phase-2-6) + [D3](#phase-2-6) hybrid. km/PlainBrain as substrate, with both hosted km cloud (subscription) and self-hosted km (open-source). Mirror Ghost: hosted is paid, open-source is a real alternative.
**Score**: B=4 / T=12-18 / C=mid-high / R=3 / D=PKM-for-AI category sustains; tier serves both segments.

<a id="s18"></a>

#### S18 [D] — "tribe-as-control-plane" (ACP-proxy ship-now top-3 cluster)

[D4](#phase-2-6) inside portfolio. Ship #1 observability + #2 cross-agent recall + #3 cost dashboard as a unified "tribe control-plane plugin pack." All three ride existing silvercode JSON-RPC tap; one sprint to MVP. Distribution: free silvercode upgrade.
**Score**: B=2 / T=2-3 (one sprint) / C=mid (cluster bonus) / R=2 / D=silvercode launches; tribe plugin model is real.

<a id="s19"></a>

#### S19 [D] — "Confluent stack" (top cluster as own venture, D5)

The top cluster (#11 gateway + #12 vault storage + #13 coordination layer) hits 25/25 — packaged as its own venture. Open ACP↔Matrix gateway with `org.agentroom.*` spec authorship + canonical km-vault session storage + agent-coordination primitives. Confluent → Apache Kafka shape. $3-5M seed. Independent acquihire-ready (GitHub, Microsoft, Vercel, Replit).
**Score**: B=3 / T=12-18 / C=very-high (*"candidate generational company"*) / R=4 / D=ACP wins; co-founder; ship MSC before labs.

<a id="s20"></a>

#### S20 [D] — "Cloudflare Workers for ACP" (compute-platform layer, #14)

Add the **agent-in-the-middle platform** on top of [S19](#s19). Proxy hosts persistent LLM sub-agents (recall-thought, critic, style-watcher, test-runner, docs-keeper) that watch ACP traffic and inject ambient observations. Cloudflare CDN → Workers analog: substrate is the start, compute is the moat.
**Score**: B=4 / T=18-24 / C=very-high / R=4 / D=[S19](#s19) ships first; sub-agent productizes; multi-tenant LLM cost economics work.

<a id="s21"></a>

#### S21 [D] — "Memory-as-a-Service" (cross-agent recall standalone, #2)

Pull #2 out as its own product. [Mem0](#g-mem0) ($24M, 52K stars) and [Letta](#g-letta) ($10M, 22K stars) prove the market; both are *single-agent*; **nobody has cross-agent memory** because no incumbent has reason to bridge Claude + Codex + Gemini + Copilot. silvery+tribe-bearly already has the recall infrastructure.
**Score**: B=3 / T=6-9 / C=high / R=3 / D=cross-agent-memory category survives single-agent versions; tribe plugin model spreads beyond silvercode.

<a id="s22"></a>

#### S22 [D] — "ACP-proxy + ship-now combined" (D4 maximum)

Integrated portfolio version. [S18](#s18) (top-3 ship-now) + [S19](#s19)'s top cluster (#11+#12+#13) + km's PlainBrain spec all together. One entity, one go-to-market, one acquisition outcome.
**Score**: B=5 / T=12-24 / C=very-high (combined cluster sums to 25/25) / R=4 / D=founder bandwidth holds; team can be hired; integrated narrative compels.

<a id="s23"></a>

#### S23 [E] ★ — "The playground for the UI of agentic work"

silvery + km + silvercode are the **playground where the UX paradigm of agentic work is being invented**. The integrated app is the laboratory. Substrate (PlainBrain markdown repo) + framework (silvery, multi-target) let the paradigm travel.

One app, multiple panes:
- **Chat panes** (Slack-like) — agent + human conversations, persisted as `org.agentroom.*` events in `~/vault/chats/*.jsonl`
- **Doc panes** — Notion-like md editing, bidirectional with underlying .md
- **Code panes** — silvercode, multi-pane parallel agents
- **Agent orchestration panes** — squad mode, file claims, cross-agent state, recall
- **Board / kanban panes** — task management, decisions, findings, handoffs
- **Diagram panes** — on-demand interactive architecture diagrams (silvery + flexily + canvas; novel)

silvercode can be a pane *in* km. km-board can be panes *in* silvercode. Same underlying app, selectable layouts. Neither product needs separate identity — they're modes.

**Multi-target as the long-term lever**: today TUI; silvery's multi-target architecture means the same app can ship as web/native when those become the better surface. The bet isn't *"TUI wins"*; it's *"we're inventing the UX for agentic work and the framework follows the customer wherever they go."*

**Why this collapses cross-elasticity**: silvery's audience can't easily build *this* themselves because the value isn't in any one component — it's in the integrated whole + substrate + bidirectional everything + multi-target framework. Inventing a UX paradigm and shipping it across surfaces is structurally a different bet from "build a Cursor clone."

**Acquisition story**: when Anthropic/Vercel/Notion realizes the paradigm is real, they acquire the whole laboratory, not one component. Bigger outcome, less fungible.

**Score**: B=5 / T=12-24 / C=very-high (genuinely new category) / R=4 / D=integrated UX achievable solo + AI-augmented for v1; novel-UI bets land; multi-target stays cheap (already designed in).

<a id="s24"></a>

#### S24 [F] — "Acquihire-positioned for Big AI labs"

Build silvery + silvery/ink shim + agentroom + tribe to *just* the right size for strategic acquisition by an AI lab needing to migrate internal CLI off Ink. Anthropic Claude Code, Google Gemini CLI, GitHub Copilot CLI all have Ink architectural constraints; silvery is the only architecturally-suited replacement. Optimize for the conversation: clean architecture, well-documented, complementary integration. Structure for $50-200M acquihire+IP outcome.
**Score**: B=3 / T=18-30 / C=high (single liquidity event) / R=4 / D=at least one Big AI lab decides Ink is a real problem.

<a id="s25"></a>

#### S25 [C] ★ — "Bottom-stack first, apps as demonstrators"

[D3](#phase-2-6) + [D4](#phase-2-6)/[D5](#phase-2-6) layered. **Recommended lead.**

**Lead (revenue)**:
- **Agent layer** has three first-class options that compose:
  - **Universal ACP-wrapper** for any third-party coding agent ([Claude Code](#g-claude-code), Codex, Aider, Cline, Continue, pi). Gives us the multi-agent coordination story (squad mode, parallel agents, cross-agent state).
  - **Sub-agents on the wire** (recall-thought, critic, style-watcher, test-runner, docs-keeper) — the "agent-in-the-middle platform."
  - **First-party coding agent** as silvercode's *default*. Realistically: fork pi (badlogic) or opencode and add silvercode-specific integrations (multi-pane orchestration, hierarchy-X-ray-aware planning, ambient-channel awareness, native squad-mode coordination) — don't build a Cursor-class agent from scratch. The vertical-integration leverage (UI ⇄ first-party agent ⇄ ACP-services) is what competitors can't match without owning all three layers.
- **Protocol layer** — tribe wire + `org.agentroom.*` event vocab + PlainBrain substrate spec authored as MSCs. Spec-authorship moat is generational-scale.
- **Services layer** — ACP-proxy ship-now cluster (observability + recall + cost) for v1 → full agentroom hosted gateway + CrossAgentState orchestration + ambient-safety + hosted recall over time.

**Demonstrators (NOT lead products)**:
- silvercode = canonical reference IDE proving the agent+protocol+services stack. Open source. Halo, not revenue.
- km = canonical reference workspace proving PlainBrain. Decomposable into silvercode features OR separate workspace.
- silvery = foundation framework. Open Apache. Brand halo, no direct revenue path.
- The [S23](#s23) integrated app = maximum demonstrator.

**Why this collapses the menu**:
- Cross-elasticity becomes positive throughout (services tier = what users want to avoid doing).
- Apps don't have to win standalone — they're showcases.
- Acquirer-readable: layers are what gets acquired, not specific app instances. Multi-acquirer optionality.
- Multiple commercial revenue streams from one layered foundation.
- Solo-doable for spec authorship + agent-layer + ship-now cluster *now*; team scales as services productize.
- The only rubric-validated 25/25 cluster in the portfolio.

**Score**: B=4 / T=12-24 / C=very-high / R=3 / D=ACP standard wins; tribe MSCs ship before competitors; services tier reaches production-grade with first hires.

**Threading the constraints**: cross-elasticity (positive), solo bandwidth (work fits), layers-as-moat (yes), acquirer-readability (yes), open-source posture (silvery + tribe + PlainBrain stay open), commercial ceiling (services tier scales). Every independent analytical signal points here: /pro v3's rubric-validated cluster, the cross-elasticity argument, Vercel/Auth0/Algolia precedents, Confluent/Kafka analog for tribe.

<a id="s26"></a>

#### S26 [D] ★ — "Docker for agents" (`.brain` portable format)

PlainBrain elevated from "markdown profile" to **the portable agent format**. `.brain` files contain agent knowledge + skills + persona + history. Operations: `run-brain`, `merge-brain`, `fork-brain`, `pack-brain`. Hooks into any environment with MCP-style tools; ACP as one transport.

Docker analog (intentional):
1. Portable format — `.brain` files travel across runtimes.
2. Reference runtime — `run-brain` CLI (open) + agentroom cloud (hosted).
3. Registry — `brainhub.dev` for sharing pre-built brains (`recall-thought.brain`, `style-watcher.brain`).
4. Industry standardization — submit as MSC alongside `org.agentroom.*`; goal: become the OCI of agents.

**Revenue layers**: open spec + runtime CLI + basic operations (free); hosted registry, cloud runtime, enterprise (audit, compliance, SSO) (paid).

**Customers**: agent builders shipping `.brain` artifacts; enterprises running internal agents; Big AI labs (Anthropic, Google, Microsoft) that could adopt `.brain` as their portable agent format if it's the obvious choice — the acquihire scenario.

**Score**: B=4 / T=12-24 / C=very-high (Docker-shape ceiling, generational-scale if standard adoption happens) / R=4 / D=ACP wins; format proposal lands as MSC; agent-portability becomes buyer-felt; execution speed beats labs to publish.

**Window concern**: every Big AI lab will eventually need to standardize agent persistence + travel. `.brain` could be that standard *if it has operational utility before anyone tries to standardize*. Window is open *now*; closes when one lab ships theirs.

**Sequencing — utility-first, NOT spec-first** (per /pro 4-leg consensus + /deep prior art):

- **Months 0-3**: Ship `run-brain` CLI + `pack-brain`/`merge-brain`/`fork-brain` operations as a **developer utility** with vendor profile. Frame as "developer preview," NOT "the new standard." Ship actual brains in your demos. **Do NOT publish a formal `.brain` spec for public debate** — that triggers third-standard backlash and gifts your R&D to AI labs.
- **Months 3-6**: Document the format publicly as a markdown spec (not foundation submission). Brainhub.dev preview registry; sign-and-provenance for trusted publishers. Make the registry an actual network, not a list.
- **Months 6-12+ — standardize-to-weaponize**: Only push for industry standardization when ≥10K brains in registry, ≥2 runtimes load it, ≥1 lab/prominent OSS agent ships brains. By then competitors must adopt *your* standard because the ecosystem has already standardized on it. Docker → OCI worked this way; AWS S3 became de-facto standard the same way.

**Why this beats the original plan**: a brilliant spec published in Month 2 *before* a working network gets read by Anthropic, tweaked 10%, and shipped natively in Claude Code to millions. They do your R&D for free. You don't publish the standard to beat them; you ship the *utility* to beat them. The standard comes after lock-in, as the moat that drowns fast-followers.

**Refined wedge given ACP registries exist**: [Zed's ACP Registry](#g-acp-registry) shipped Jan 2026 and the community [`agentclientprotocol.com/registry`](https://agentclientprotocol.com/get-started/registry) catalogs existing agents — both are *agent distribution metadata for existing agents*, not portable agent formats. `agent.json` describes how to install Claude Code or Cline; `.brain` describes what an agent *is* (knowledge + skills + persona + history) so it can travel, merge, and run anywhere. The registries are places `.brain` artifacts could be distributed *from* — complement, not competitor. But the registry *naming/distribution surface* is now contested, so brainhub.dev's differentiator is the **managed runtime** (provenance, signing, verified publishers, hosted execution), not just the catalog.

**Synergy with [S25](#s25)**: not a replacement — [S26](#s26) is the protocol layer's *maximum* framing. [S25](#s25) builds the substrate; [S26](#s26) names the format the substrate embodies. The two compose.

---

<a id="phase-4"></a>

## Phase 4 — Sequencing

<a id="path-eta"></a>

### Recommended path η (S25 + S23 + S26)

**Months 0-3 (solo)** — build private, ship working code, claim namespace minimally:

- silvery maintenance + light promo (let cluster-1 sites work organically).
- Ship **ACP-proxy top-3 cluster** ([S18](#s18): #1 observability + #2 cross-agent recall + #3 cost dashboard) as tribe-side plugins in silvercode — initially **closed or open-core** (BSL/CCL on the gateway code from day one). *"One sprint to MVP."*
- **Treat tribe wire as INTERNAL API.** Hardcode it between silvercode and your gateway. Iterate fast, break it freely. **Do NOT submit a formal MSC yet** — premature standardization is *architecture astronauting* (per /pro consensus). Specs are extracted from dominant implementations (Docker→OCI, S3→de-facto), not authored ahead.
- **Minimal namespace land-grab only**: a one-page reservation of `org.agentroom.*` on Matrix is fine if it's an afternoon's work; resist building a v0 spec, event vocabulary, and community-engagement plan in Q1.
- Ship **`.brain` v0 as a developer-utility** — `run-brain` CLI + `pack-brain`/`merge-brain` operations. Frame as "vendor profile + developer preview," NOT as "the new standard." Ship actual brains in your demos.
- Build the **conformance test harness** (golden traces + replay + reference validator CLI) in private alongside the wire — this is the *real* spec moat per /pro, not the spec text.
- Continue dogfooding km / silvercode. silvercode launches as **open reference IDE** (free, demonstrator) with **agentroom.cloud as the zero-config default**. Build the agent layer wrapping (universal ACP-wrapper for [Claude Code](#g-claude-code), Codex, Aider, Cline, pi).
- Network priming for first co-founder / hire / fundraise (Palo Alto warm intros).
- **No production hosted services yet** — too operationally heavy for solo.

**Months 3-6 (first hire)** — productize what dogfooding validates; document but don't standardize:

- First hire: infrastructure-ops co-founder OR services-product engineer.
- **agentroom preview gateway** — multi-machine routing, single-region, best-effort uptime, no SLA, design-partner-only. *Explicitly NOT production-grade.* Production-grade (multi-region, 99.9% SLA, [SOC2](#g-soc2), on-call rotation, security review) requires the months 6-12 team — structurally impossible with one hire.
- **Now publish tribe wire as documentation** (a public markdown spec, *not* a formal MSC yet). Let design partners pull it into their tooling if they ask. If no one asks, that's signal — your protocol isn't sticky enough yet.
- Ship **[S23](#s23) integrated playground** demo (chat + docs + code + agents + boards + diagrams). The killer demo.
- Promote `.brain` registry preview (`brainhub.dev`) — still as utility, not "the standard."
- Hardening + outreach on top-3 cluster ([S18](#s18) → 3-5 design-partner customers, not paid SaaS at scale).
- **Decision-point**: services-led-only ([S25](#s25)) vs services-led + standalone-agentroom-spinout ([S25](#s25) + [S5](#s5)).

**Months 6-12 (small team, ~5)** — scale services, deepen path:

- Production services tier: subscription-auth, ambient-context-safety, hosted recall, multi-device sync. Each service ~2-3 people.
- Enterprise readiness: SOC2 progression, audit logs, SSO, regional hosting.
- silvercode + km integration deepens ([S22](#s22)); km decomposed into silvercode features OR remains as separate workspace.
- Big AI lab outreach ([S15](#s15) / [S24](#s24)).
- **Now submit formal MSC** for `org.agentroom.*` — gated on: ≥2 independent implementations (yours + 1 external), ≥3 design partners in active use, <2 breaking changes in 60 days, passing conformance suite. Submitting MSC *with* dominant implementation behind you forces reviewers to debate working code rather than aspirations.
- Decide on Obsidian-acquisition-timing-aware moves for [Family B](#family-map).

**Months 12+ (seed → Series A)** — signal-driven path deepening + standardize-to-weaponize:

| Signal | Tilt toward |
|---|---|
| Big AI lab inbound | [S24](#s24) (acquihire) + [S15](#s15) (Anthropic-direct enterprise) |
| Services revenue scaling fast | [S2](#s2)/[S16](#s16) (Vercel/Auth0 services-led pure plays) |
| `.brain` adoption proves out | [S26](#s26) (Docker-for-agents standalone venture) |
| Obsidian acquired / AI-vault accelerates | [Family B](#family-map) ([S4](#s4)/[S7](#s7)/[S17](#s17) PKM-led) |
| Multi-direction simultaneous traction | [S10](#s10) (multi-venture studio) or [S13](#s13) (raise-then-execute) |

**Principle**: invest in *architecture* now (silvery + tribe + agentroom + services + .brain) — every layer compounds across multiple future paths. Don't pre-commit; generate signal and let signal pick the path.

<a id="alternative-paths"></a>

### Alternative sequencing paths (preserved)

- **[Path α](#alternative-paths) ([S1](#s1) locked)** — silvery + silvercode + km + tribe in parallel. High bandwidth, integrated narrative, Day 90 kill criterion.
- **[Path β](#alternative-paths) ([S1](#s1) subset, sequenced)** — silvery alone for 3mo → silvercode at month 3 → services at month 6.
- **[Path γ](#alternative-paths) ([S2](#s2) services-first)** — services tier as flagship; silvercode open reference. Bigger ceiling, slower lift.
- **[Path δ](#alternative-paths) ([S4](#s4) PKM-first)** — defer silvery promotion; focus on km/PlainBrain. Faster to revenue if PKM market warmer than expected.
- **[Path ε](#alternative-paths) ([S10](#s10) multi-venture)** — agentroom spun out; silvery donated to foundation; silvercode + km bootstrapped product.
- **[Path ζ](#alternative-paths) ([S13](#s13) capital-first)** — raise first, run multiple paths with hired engineers.
- **[Path η](#path-eta) ([S25](#s25) recommended)** — bottom-stack-first, apps as demonstrators, signal-driven path deepening.

<a id="corporate-structure"></a>

### Corporate structure

Founder is **US/California-resident as of 2025-01-25** (NOT Norway despite Norwegian citizenship + Sparebank1). Cross-border tax/legal sophistication is a strength.

Use the existing planned **Wyoming HoldCo LLC** (Q1 2026, multi-member 50/50 Bjorn + Delei for [QSBS](#g-qsbs) pass-through) — see `~vault/areas/@office/CHARTER.md`. NOT a new vehicle. silvercode + km/Kimmi spin out as Delaware C-Corps at PMF ([PLEP](#g-plep) [Phase 2](#phase-2), 2027-2028). Don't pre-form a separate entity for agentroom — keep optional spinout ([S5](#s5)/[S19](#s19)) on the table; defer formation until services prove out.

---

<a id="phase-5"></a>

## Phase 5 — Recommendation

<a id="lead-path"></a>

### Lead path η: S25 + S23 demonstrator + S26 protocol authoring

The workshop converged on a layered strategy that threads through every constraint:

- **Lead commercial focus**: [Family C](#family-map) (services-led) + [Family D](#family-map) (agent + protocol play). Cross-elasticity positive, /pro-validated 25/25 cluster math, multi-stream revenue from one layered foundation.
- **Demonstrator**: [S23](#s23) integrated playground — one app, multiple panes, TUI today → web/native tomorrow. Shows what the layers enable when fully composed; doesn't have to win standalone.
- **Ambitious protocol authoring**: [S26](#s26) (`.brain` portable agent format). Docker-for-agents framing. Composes with [S25](#s25). Window open *now*; closes when one Big AI lab ships theirs.
- **Apps repositioned**: silvercode + km + integrated playground are *open reference implementations* that demonstrate the services tier. Not lead products. Collapses the cross-elasticity trap entirely.

<a id="why"></a>

### Why this is the recommendation

The only strategy that simultaneously:

1. Avoids cross-elasticity (services + protocols have positive cross-elasticity).
2. Fits solo-bandwidth (spec authorship + ship-now cluster + dogfooding all solo-doable today).
3. Has rubric-validated commercial ceiling (ACP-proxy stack 25/25 per /pro v3).
4. Preserves multi-path acquirer optionality (Big AI lab buys silvery slice; infra company buys agentroom; PKM acquirer buys km — all three remain on the table).
5. Compounds capital efficiency (every layer worked on benefits all future paths).
6. Aligns with the founder's read that "the agent+protocol+services bottom stack has the most opportunity."

<a id="what-not-to-do"></a>

### What NOT to do

- **Don't lock to [S1](#s1)** — cross-elasticity exposure is high; /pro v3 rubric showed [Family D](#family-map) has stronger validation than the locked single-product silvercode bet.
- **Don't pursue [Family H](#family-map)** ([S6](#s6) / [S8](#s8) / [S12](#s12) / [S14](#s14)) — abandons or decomposes the integrated portfolio, wasting architectural coherence.
- **Don't ship production hosted services solo** — degrade quality and burn out. Demo-grade is fine; production-grade waits for hires.
- **Don't promote PlainBrain as a standalone "third standard" before silvery validates** — premature standards proliferation per /pro v3. Frame as `.brain` ([S26](#s26)) which has its own thesis.
- **Don't pre-form a separate entity for agentroom** — keep [S5](#s5) spinout optional; defer formation until [Family D](#family-map) services prove out and signal which structure is right.
- **Don't submit a formal MSC in months 0-3** ([architecture astronauting](#g-arch-astro), per /pro 4-leg consensus). Ship dominant implementation first; standardize-to-weaponize at month 6+ when you have 5K+ daily active agents using your shape in production. Docker→OCI worked this way; AWS S3→de-facto worked this way.
- **Don't open-source the production gateway, ambient-safety classifier, sub-agent compute, or multi-tenant orchestrator at production-grade quality**. Ship a *demonstrator* AGPL reference gateway (single-user, no SLA) so the spec has runnable code; keep the production server under [BSL](#g-bsl) / [Elastic License v2](#g-elastic-l) / [CCL](#g-ccl) **from day one** to avoid the post-launch fork-risk that hit Mongo (SSPL → AWS DocumentDB), Elastic ([Elastic License](#g-elastic-l) → OpenSearch), HashiCorp ([BSL](#g-bsl) → OpenTofu), and Redis ([RSAL](#g-rsal)/SSPL → Valkey).
- **Don't claim spec authorship is a moat without conformance suite + dominant implementation** — [OpenAPI](#g-openapi)/Swagger cautionary tale: Stoplight, Postman, Apigee built more value on top than the spec authors captured. The real moat = (a) default impl everyone uses + (b) conformance tests others respect + (c) production-grade managed service + (d) brand + certification. Without (a) and (b), spec text alone is a paper shield.
- **Don't switch licenses post-adoption** — every notable case (Mongo 2018, Confluent's selective CCL 2018, Elastic 2021, HashiCorp 2023, Redis 2024) triggered fork-risk; only Confluent's *selective* day-one CCL avoided it (Kafka stayed Apache, only ksqlDB/Schema Registry got CCL). License the production server correctly day one.

<a id="open-source-defense"></a>

### Open-source defense playbook (the structural answer to "what stops a competitor from pointing our open clients at their backend?")

Per /pro 4-leg consensus + /deep prior art (Confluent, Vercel, Auth0, Stripe, Temporal, Supabase, Kong, Apollo, GitLab, Algolia all run variants of this), the defense is **layered** — no single tactic suffices, but six in combination make a fork unprofitable:

| # | Layer | Mechanism | Precedent |
|---|---|---|---|
| 1 | **Operational moat** *(strongest)* | Multi-region failover, 99.9-99.99% [SLA](#g-sla), [SOC2](#g-soc2)/ISO27001, on-call, SCIM/SSO, PrivateLink/VPC peering, data residency, FedRAMP. *"You aren't defending an API; you are defending an SLA."* | Confluent Cloud beat self-hosted Kafka; Vercel beat AWS+CloudFront |
| 2 | **Spec authorship via conformance** | Publish conformance test suite + golden traces + replay harness + reference validator CLI. The repo where implementers prove correctness is the *de facto* spec editor, even when the spec sits under foundation governance. | Norm-setting moves markets |
| 3 | **Vertical integration via dark extensions** | Open [tribe](#g-tribe) wire for chat-relay-grade message passing; agentroom natively handles [CrossAgentState](#g-crossagentstate) conflict resolution + ambient-safety egress blocking + multi-device vault sync as proprietary extensions. silvercode UI features (squad mode, hierarchy X-ray, ambient channels) tested against agentroom Cloud only. | Self-hosters get a chat relay; we sell the coordination engine |
| 4 | **Distribution defaults + trademark** | silvercode ships `agentroom.cloud` zero-config + one-click auth + instant org provisioning. Trademark "agentroom", "silvery", "tribe", "[`.brain`](#g-plainbrain)". "Certified Compatible" program: anyone implements the spec, only conformance-passers get the mark. | AWS RDS vs MariaDB self-host pattern |
| 5 | **Network effect via brain registry** | `brainhub.dev` with provenance, signing, verified publishers, "Trusted Brain Publisher" curation. Once 10K+ brains in registry, switching backends loses distribution. | *GitHub is defensible despite git being open-source — because GitHub is where the repos live.* agentroom must be where the agents live. |
| 6 | **License partitioning + CLA optionality** *(backstop)* | Apache for clients, [BSL](#g-bsl)/[CCL](#g-ccl) for production server day one, AGPL for reference gateway, [CC BY 4.0](#g-cc-by) for spec text. CLA on server-side repos preserves relicense optionality. | See Phase 1.A3 license table; use sparingly |

**Pricing as deterrent**: free single-user gateway tier with generous limits; paid tiers = org/SSO/policy/[SLA](#g-sla)/analytics — things OSS clones structurally struggle to offer credibly.

**The bet**: standards expand TAM; our cloud captures value because it's the easiest, safest, and best-integrated place to run the standard. *"You can't stop a fork. You can make the fork an inferior, higher-friction choice for most customers."* (GPT-5.4 Pro)

<a id="protocol-failure-modes"></a>

### Protocol failure modes (contingency planning)

The 25/25 cluster math (#11+#12+#13) assumes tribe wire + `org.agentroom.*` event vocab become the canonical agent-coordination protocol. Realistic failure modes and the moves that survive them:

| Failure mode | Survival move |
|---|---|
| **MCP extends to cover coordination** (Anthropic ships agent↔agent + ambient-channel semantics natively in MCP) | agentroom becomes an MCP-extension service rather than a tribe-wire gateway. Authored event vocab still has authorship moat as an MCP profile. Value prop shifts from "the wire" to "the hosted broker for the wire." |
| **ACP extends symmetrically** (Zed + ecosystem add coordination/storage primitives directly to ACP) | agentroom positions as an ACP-aware bridge to Matrix federation; `org.agentroom.*` becomes an ACP-extension namespace. Same business, different framing. |
| **Anthropic / Google / OpenAI publish a competing `.brain` first** | Drop standalone-format ambition (kill [S26](#s26) standalone scenario); keep PlainBrain as km's internal data model + an *interoperability profile* across whichever format wins. km/silvercode portfolio doesn't depend on `.brain` standardization — only the [S26](#s26) acquihire ceiling does. |
| **Matrix Foundation rejects the MSC** (or sits on it >12 months) | Ship `org.agentroom.*` as Apache + CC BY 4.0 spec independent of Matrix governance. Community-driven specs (HTTP, JWT, OAuth2) preceded formal standardization. Lose the federation story, keep the wire authorship. |
| **Open-ACP or another community bridge eats the gateway commodity layer** | agentroom retreats from "the gateway" toward "the *managed* gateway" — multi-tenant, SLA-bearing, compliance-ready. Confluent vs Apache Kafka: open implementation doesn't preclude a paid hosted service. |

**Common pattern**: every failure mode preserves *some* layer of the architecture as still-monetizable — the multi-acquirer-optionality argument from [Phase 0](#phase-0) holds even when the single-canonical-protocol bet doesn't. The cluster ceiling drops from 25/25 to ~18-20/25 in most scenarios; the floor doesn't go to zero.

<a id="open-questions"></a>

### Open questions (signal-driven, defer)

1. **Acquihire ([Family F](#family-map): [S11](#s11)/[S24](#s24)) vs standalone IPO scale** — drives whether silvery + agentroom should be sized for a Big AI lab acquisition or a $50-200M ARR services business.
2. **Does PKM-for-AI consolidate around Obsidian or fragment?** Obsidian acquisition timing is the canary. If Microsoft/Notion buys Obsidian in next 12 months, [Family B](#family-map) becomes more attractive.
3. **agentroom spin out ([S5](#s5)/[S19](#s19)) or stay inside ([S22](#s22))?** [S25](#s25) keeps this optional; the choice is signal-driven (capital + co-founder + acquirer interest).
4. **Is `.brain` ready to ship as MSC alongside `org.agentroom.*` events?** Clock is ticking; window closes when one lab ships theirs.
5. **Right venue for fundraise narrative if/when capital is needed?** Devtools VC for [S13](#s13) path, or strategic conversation with one Big AI lab for [S24](#s24) path.

---

<a id="glossary"></a>

## Glossary

### Protocols & standards

<a id="g-acp"></a>

- **ACP — Agent Client Protocol** ([Zed Industries](#g-zed-industries)). How an editor (host) talks to an agent. Distinct from MCP. Spec at [agentclientprotocol.com](https://agentclientprotocol.com).

<a id="g-mcp"></a>

- **MCP — Model Context Protocol** ([Anthropic](#g-anthropic)). How an agent talks to its tools. Distinct layer from [ACP](#g-acp).

<a id="g-msc"></a>

- **MSC — Matrix Spec Change**. The RFC-like proposal mechanism by which the Matrix Foundation governs additions to the Matrix protocol. Authoring `org.agentroom.*` events as MSC is part of [tribe](#g-tribe)'s spec-authorship moat.

<a id="g-cla"></a>

- **CLA — Contributor License Agreement**. Required for accepting external contributions while retaining licensing optionality.

<a id="g-cc-by"></a>

- **CC BY 4.0**. Creative Commons Attribution 4.0; the license used for [tribe](#g-tribe)'s open spec text (in addition to Apache 2.0 for code).

<a id="g-mit"></a>

- **MIT**. Permissive open-source license. [tribe](#g-tribe) currently MIT in `vendor/bearly`.

<a id="g-apache"></a>

- **Apache 2.0**. Permissive open-source license with patent-grant clause. Default for client surface (silvery, tribe SDKs).

<a id="g-bsl"></a>

- **BSL — Business Source License (1.1)**. Source-available, cloud-protective license used by Cockroach, Timescale, HashiCorp. Allows broad internal use; prohibits offering "as a service" without commercial license. Auto-converts to permissive (e.g., Apache 2.0) after 3-4 year "Change Date." Recommended for production gateway code from day one.

<a id="g-elastic-l"></a>

- **Elastic License v2 (ELv2)**. Source-available license that explicitly prohibits providing the software as a managed service. Used by Elasticsearch (since 2021). Triggered AWS OpenSearch fork.

<a id="g-ccl"></a>

- **CCL — Confluent Community License**. Source-available license used by Confluent for ksqlDB and Schema Registry (since Dec 2018). Selective application — Kafka itself stayed Apache. Avoided post-launch fork-risk by being day-one selective.

<a id="g-rsal"></a>

- **RSAL — Redis Source Available License (v2)**. Source-available license adopted by Redis 7.4+ (March 2024). Triggered Linux Foundation Valkey fork.

<a id="g-agpl"></a>

- **AGPLv3 — Affero GPL**. Viral copyleft license that requires source disclosure for *network-served* derivatives. Useful for "demonstrator" reference code so the spec has runnable code, but scares enterprises off embedding. Better for toy reference than for strategic server code.

<a id="g-sspl"></a>

- **SSPL — Server Side Public License**. Used by MongoDB (since 2018), Elastic (2021), Redis (2024). Stronger than AGPL; requires open-sourcing the entire management/orchestration layer of any service offering. Considered by OSI as not open-source. Triggers fork-risk if applied post-adoption.

<a id="g-conformance"></a>

- **Conformance test suite / "Certified Compatible"**. The *real* spec moat per /pro 4-leg consensus: golden traces + replay harness + reference validator CLI. Anyone can implement the spec; only those who pass conformance tests get the certification mark. Buyers ask for the badge; the standard editor administers the tests.

<a id="g-arch-astro"></a>

- **architecture astronauting**. (Kimi K2.6 pushback term.) Premature standardization — designing event schemas, formal MSCs, and community-engagement plans for protocols nobody routes yet. The right path is to ship the dominant implementation first; standards are *extracted* from working systems (Docker→OCI, S3→de-facto), not authored ahead.

<a id="g-openapi"></a>

- **OpenAPI / Swagger**. Cautionary spec-authorship example: spec authorship didn't capture the biggest commercial outcomes — Stoplight, Postman, Apigee built more value on top than the spec authors did. Lesson: spec authorship = moat only when paired with reference runtime developers touch daily AND/OR canonical registry/distribution surface.

### This portfolio's products

<a id="g-silvery"></a>

- **silvery** — React [TUI](#g-tui) framework. Lead asset; 98.6% [Ink](#g-ink)-compat shipped, 3K [DL/wk](#g-dl-wk), multi-target rendering (TUI today → canvas/DOM/web/native). silvery.dev live.

<a id="g-silvercode"></a>

- **silvercode** — multi-pane agentic IDE built on [silvery](#g-silvery). Pre-launch.

<a id="g-tribe"></a>

- **tribe** — cross-session/cross-machine coordination protocol. Lives in `vendor/bearly`, currently [MIT](#g-mit). Wire + event vocabulary + room/chat patterns + lease semantics + ambient channels.

<a id="g-agentroom"></a>

- **agentroom** — planned [ACP](#g-acp)↔Matrix bridge + managed-cloud gateway. Top venture-rubric score (24/25 alone, 25/25 with cluster).

<a id="g-plainbrain"></a>

- **PlainBrain / `.brain`** — markdown-filesystem shape [km](#g-km) uses; ambitiously framed as a portable agent format (Docker analog with `run-brain`/`merge-brain`/`fork-brain`/`pack-brain` operations).

<a id="g-km"></a>

- **km — Knowledge Machine** — agentic knowledge workspace (board + calendar + journal + agents + recall, bidirectional md↔SQL sync). knowledgemachine.co. Pre-launch. Canonical [PlainBrain](#g-plainbrain) reference workspace.

<a id="g-flexily"></a>

- **flexily** — Yoga-compatible flex layout engine; powers [silvery](#g-silvery)'s layout. 1.5-5.5× faster, no WASM.

<a id="g-bearly"></a>

- **bearly** — internal tooling family (recall, [tribe](#g-tribe), llm CLI, hooks, beads, worktrees).

<a id="g-tui"></a>

- **TUI — Terminal User Interface**. The category [silvery](#g-silvery) ships against today; multi-target architecture extends to canvas/DOM/native.

<a id="g-dl-wk"></a>

- **DL/wk** — downloads per week (npm package metric).

### Competitor / adjacent products

<a id="g-ink"></a>

- **Ink** — React [TUI](#g-tui) framework. Capability-capped incumbent; the migration source. ~1M+ DL/wk ecosystem.

<a id="g-opentui"></a>

- **OpenTUI** — rival React [TUI](#g-tui) framework. $8M [Cota](#g-cota) seed; backed by [Anomaly](#g-anomaly); powers [Kilo Code](#g-kilo-code). Architecturally incompatible with [Ink](#g-ink) (lowercase JSX, different hooks).

<a id="g-cursor"></a>

- **Cursor** — agentic IDE. $9.9B valuation, $500M [ARR](#g-arr).

<a id="g-claude-code"></a>

- **Claude Code** — [Anthropic](#g-anthropic)'s agentic CLI; built on [Ink](#g-ink).

<a id="g-notion"></a>

- **Notion** — collaborative knowledge platform. $30B+ valuation; AI features bolt-on.

<a id="g-obsidian"></a>

- **Obsidian** — markdown-vault editor. De facto AI-KM vault editor today. Hypothesized acquisition target in 12-24 months.

<a id="g-vercel"></a>

- **Vercel** — frontend cloud platform. Vercel AI SDK + AI Gateway ~$200M [ARR](#g-arr). Open-spec-but-proprietary-services pattern is the canonical reference for [S25](#s25)/[S2](#s2).

<a id="g-vercel-ai-gw"></a>

- **Vercel AI Gateway** — production multi-provider LLM gateway with observability + caching, used in conjunction with Vercel AI SDK. Strongest direct competitor for the [agentroom](#g-agentroom) gateway slot.

<a id="g-helicone"></a>

- **Helicone** — open-source LLM observability platform. Threat to agentroom's observability differentiator (#1 ship-now venture).

<a id="g-portkey"></a>

- **Portkey** — production LLM gateway with retries, fallbacks, caching, governance. Threat to agentroom's gateway value prop.

<a id="g-openrouter"></a>

- **OpenRouter** — model aggregator and routing service ($1.3B valuation per /pro v3 prior art). Threat to multi-vendor LLM gateway slice of the services tier.

<a id="g-langchain"></a>

- **LangChain Agent Middleware** — orchestration framework positioning multi-agent systems as production-first concepts. Threat to coordination-state layer (#13).

<a id="g-langgraph"></a>

- **LangGraph** — LangChain's stateful, multi-agent graph orchestration. Direct competitor to agentroom's coordination state layer.

<a id="g-llamaindex"></a>

- **LlamaIndex agents** — multi-agent topology framework. Adjacent to agentroom's coordination-layer scope.

<a id="g-acp-registry"></a>

- **Zed ACP Registry** — public registry for ACP-compatible agents shipped by Zed Industries January 2026. Naming/distribution surface for the registry layer is now contested. agentroom's brain-registry differentiator must be the *managed runtime* (provenance, signing, verified publishers, hosted execution), not just a catalog.

<a id="g-crossagentstate"></a>

- **CrossAgentState** — proprietary [agentroom](#g-agentroom) orchestration primitive: shared plan graph with file-claims, real-time conflict resolution, structured handoff between sub-agents. Surfaced via public API but designed primarily for [silvercode](#g-silvercode)'s panes. Clones can talk the API but won't nail the feel without owning the UI layer.

<a id="g-auth0"></a>

- **Auth0** — identity-as-a-service. Acquired by Okta for $6.5B.

<a id="g-algolia"></a>

- **Algolia** — search-as-a-service. $100M+ [ARR](#g-arr).

<a id="g-confluent"></a>

- **Confluent** — managed Apache Kafka. The open-spec + paid hosted-service pattern for [agentroom](#g-agentroom).

<a id="g-open-acp"></a>

- **Open-ACP** — community-driven self-hosted [ACP](#g-acp) bridge to Telegram/Discord/Slack. 280 GitHub stars. Validates the bridge pattern; partially commoditizes the adapter layer.

<a id="g-gbrain"></a>

- **gbrain** — third-party PKM-for-AI tool (4,600+ pages). Founder dogfoods it as evidence of the PKM-as-md-files-for-AI movement; NOT part of this portfolio.

<a id="g-mem0"></a>

- **Mem0** — single-agent memory product. $24M raised, 52K GitHub stars. Cited as Memory-as-a-Service comparable for [S21](#s21).

<a id="g-letta"></a>

- **Letta** — single-agent memory product. $10M raised, 22K GitHub stars. Cited alongside [Mem0](#g-mem0) for [S21](#s21).

### Companies / investors

<a id="g-anthropic"></a>

- **Anthropic** — maker of Claude; ships [Claude Code](#g-claude-code) (Ink-based). Plausible silvery acquirer.

<a id="g-zed-industries"></a>

- **Zed Industries** — creator of [ACP](#g-acp) and the Zed editor.

<a id="g-anomaly"></a>

- **Anomaly** — investor in [OpenTUI](#g-opentui); distribution channel.

<a id="g-cota"></a>

- **Cota** — VC backing [Kilo Code](#g-kilo-code)'s [OpenTUI](#g-opentui) work ($8M seed).

<a id="g-kilo-code"></a>

- **Kilo Code** — agentic IDE; April 2026 fork; [OpenTUI](#g-opentui)-based.

### Strategic concepts

<a id="g-cross-elasticity"></a>

- **cross-elasticity** — A measure of how much your free/open-source layer's audience is structurally equipped to build a competing version of your paid/commercial layer themselves. Surfaced as the central analytical frame for this portfolio (per Kimi K2.6 review).
  - **Negative cross-elasticity (the "trap")**: free-tier adopters cannibalize the paid tier because they can build it. The classic case: [silvery](#g-silvery) framework users are themselves React-TUI-IDE builders — so [silvercode](#g-silvercode) (a paid React TUI IDE) faces an audience that's structurally able to build silvercode-equivalents on top of [silvery](#g-silvery). High exposure → [Family H](#family-map) and [S1](#s1) carry this risk.
  - **Positive cross-elasticity**: free-tier adopters become *buyers* of the paid tier because the paid layer is something they want to *avoid* doing themselves. Auth, secrets, multi-tenant infra, [SOC2](#g-soc2), recall, ambient-safety — services with operational weight that an individual developer would rather pay than maintain. The [Vercel](#g-vercel)/[Auth0](#g-auth0)/[Algolia](#g-algolia)/[Confluent](#g-confluent) pattern.
  - **Why this drives the recommendation**: collapsing the [silvery](#g-silvery) → [silvercode](#g-silvercode) bet onto the L4 → L2/L3 layers (services + protocols) flips cross-elasticity from negative to positive without abandoning the architecture. That's the structural argument behind [S25](#s25).

### Business / legal / financial

<a id="g-arr"></a>

- **ARR — Annual Recurring Revenue**.

<a id="g-pmf"></a>

- **PMF — Product-Market Fit**.

<a id="g-soc2"></a>

- **SOC2** — security/compliance audit standard. Required for enterprise services.

<a id="g-sla"></a>

- **SLA — Service Level Agreement**. Uptime / response-time guarantees.

<a id="g-sre"></a>

- **SRE — Site Reliability Engineering**.

<a id="g-loi"></a>

- **LOI — Letter of Intent**. Pre-contract demand validation signal.

<a id="g-qsbs"></a>

- **QSBS — Qualified Small Business Stock**. US tax incentive for early-stage equity; drives multi-member 50/50 [HoldCo](#g-holdco) structure.

<a id="g-plep"></a>

- **PLEP — Personal Legal/Estate Plan**. The family-office charter at `~vault/areas/@office/CHARTER.md`. Phases 1-2 cover [HoldCo](#g-holdco) formation and Delaware C-Corp spinouts at [PMF](#g-pmf).

<a id="g-holdco"></a>

- **HoldCo — Holding company**. Wyoming LLC at the top of this portfolio's planned structure (multi-member 50/50 Bjorn + Delei for [QSBS](#g-qsbs) pass-through). See `~vault/areas/@office/CHARTER.md`.

---

## Cross-references

- [`licensing-strategy.md`](licensing-strategy.md) — current Option 5 commitment
- [`integrated-workdesk.md`](integrated-workdesk.md) — agentic-workdesk vision
- [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md) — 14-venture rubric, 25/25 cluster math
- `~vault/areas/@office/CHARTER.md` — family-office structure, Wyoming HoldCo plan
