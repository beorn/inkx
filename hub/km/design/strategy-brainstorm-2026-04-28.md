# Strategy brainstorm — facilitated workshop

**Status**: in-progress, started 2026-04-28. Phases 1-2 (Inventory, Market) pre-filled; Phases 3-5 (Strategies, Sequencing, Recommendation) to be developed collaboratively.

**Purpose**: separate the factual layers (what we have, what the market is) from the creative layer (which strategies fit) and the decision layer (which to pursue when), so we can mix/match without conflating axes.

**Contrast with [`licensing-strategy.md`](licensing-strategy.md)**: that doc commits to Option 5 (silvery + silvercode + services + tribe + PlainBrain). This doc steps back and asks: given the same inventory + market, what *other* strategies could we run, and how do they sequence?

---

## Methodology

Four phases, separable to avoid premature commitment:

1. **Inventory** — what we have (assets, capabilities, constraints). Factual.
2. **Market** — what's out there (segments, competitors, trends, demand signals). Factual.
3. **Strategy candidates** — mix-and-match Inventory × Market → enumerate 12-15 distinct strategies, score each on dimensions (bandwidth, time-to-revenue, capital, cross-elasticity risk, ceiling).
4. **Sequencing** — given the strategy menu, what runs in what order. Capital, dependencies, signal-gates.

**Iteration discipline**: don't argue for a strategy in Phase 3 before exhausting the inventory in Phase 1. Don't sequence in Phase 4 before scoring in Phase 3.

---

## Phase 1: Inventory

### A. Shipped assets — major (load-bearing, strategically central)

These are the assets that would appear in a pitch deck, an acquisition conversation, or a "what do we own" inventory at a fundraise. Each is described with both its *current state* and its *strategic potential*.

**silvery** — React TUI framework. 98.6% Ink-compat shipped, 3K DL/wk, polished, multi-target rendering (terminal + canvas/DOM future), mouse-first, incremental rendering, 45+ components. silvery.dev live.
- **Potential**: arguably the best React TUI framework in existence. Technically difficult to build (years of work compressed). Composable architecture means it could extend to canvas / DOM / React Native, *and* to other framework reconcilers (Svelte / Vue / SolidJS via swappable bindings). Currently missing: polished visuals, killer demos, broad real-world reality-check. **Acquisition target by big AI players (Anthropic, Google, Microsoft, Cursor) wanting to get off Ink** — they all need a better React TUI substrate and silvery is the only one architecturally suited as drop-in.

**silvery/ink** — the migration shim, ~3K LOC, bundled into silvery package.
- **Potential**: the *only* drop-in Ink replacement. OpenTUI architecturally cannot serve this market. If even one Big AI lab notices and migrates, the brand-halo is permanent.

**flexily** — Yoga-compatible flex layout, 1.5-5.5× faster, no WASM, 1561 tests. beorn.codes/flexily/ live.
- **Potential**: standalone competitor to Yoga across the React Native + game-engine + browser-layout space. Underrated outside silvery; could be the layout engine for any framework that wants flex without the WASM tax. Independent acquisition surface. Combined with silvery + canvas, foundation for a future visual/architecture-diagram product.

**silvercode** — multi-pane agentic IDE built on silvery; validated near-term wedge: squad mode (parallel agents + CrossAgentState). Pre-launch.
- **Potential**: in combination with silvery + km + flexily, could be **a new "agentic coding desktop"** — chat sessions + kanban backlog management + agent orchestration + shared node-tree storage + potentially novel UI patterns nobody else has (on-demand interactive architecture diagrams via silvery+flexily+canvas, ambient cross-agent state visualization, declarative-prompt UI). This is a *new category*, not just "Cursor with a different framework." The cross-elasticity trap exists for "Cursor with a different framework"; it's diluted for "an entirely new UX paradigm for AI-coding work."

**km / Knowledge Machine** — agentic knowledge workspace; board + calendar + journal + agents + recall, bidirectional md↔SQL sync. Has knowledgemachine.co. Pre-launch.
- **Potential**: km's identity is not fixed — its core asset is the *substrate* (markdown filesystem + bidirectional sync + KNode model + recall + commands). That substrate can serve multiple framings:
  - *PKM-for-AI workspace* ("Obsidian for AI agents") — every AI tool now ships markdown vaults (Cursor Rules, Claude Projects, ChatGPT Memory, Aider .aider, Continue context). Obsidian is currently the only serious vault-browser/editor — and it's not AI-native. Real category gap. Validated externally by gbrain (third-party PKM-for-AI tool) and the broader PKM-as-md-files-for-AI movement.
  - *Decomposed into silvercode features* — km's board, journal, outline editor, and recall could ship as components inside silvercode rather than as a standalone product. silvercode-with-built-in-backlog-and-context becomes a stronger integrated IDE; km's substrate stops being a separate sale.
  - *Multi-tenant vault* for any silvery app — third-party AI tools could embed km components and use the substrate without being knowledge-worker-shaped.
  - *Canonical PlainBrain implementation* — proves the spec by being the reference workspace.
  - *Pivot target* — if knowledge-worker market doesn't bite, km can become *anything that needs a markdown substrate + bidirectional UI*. The architecture is general; the application is choosable.

**tribe** — cross-session/cross-machine coordination protocol; currently MIT in vendor/bearly. Wire + event vocabulary + room/chat patterns + lease semantics + ambient channels.
- **Potential**: precondition for the agentroom gateway and the entire ACP-proxy stack. Could become the canonical agent-coordination protocol if shipped as MSC into Matrix before Anthropic/Google/OpenAI publish theirs. Spec authorship is generational-scale moat (per ventures doc).

**PlainBrain** — markdown-filesystem shape km uses; not yet formalized as spec, currently just km's internal data model. Domains plainbrain.org + plainbrains.com owned.
- **Potential**: could become a "markdown profile for agentic-work repos" — interoperability standard with Obsidian / Notion / Cursor Rules / Claude Projects. Per /pro v3: *"emphasize compatibility profiles rather than invention."* The PKM-as-md-files-for-AI movement (see Phase 2.D) is real and growing; PlainBrain would be the named substrate.

**agentroom gateway** — planned ACP↔Matrix bridge, paid managed cloud, top-scoring venture (24/25). Not built.
- **Potential**: see Phase 2.7. Top of a multi-venture stack reaching 25/25 ceiling. *"Candidate generational company."*

**bearly tooling family** — recall, tribe-cli, llm CLI, worktrees, hooks, the entire Claude-Code-orchestration toolkit at vendor/bearly/.
- **Potential**: itself a productizable Claude-Code-ecosystem play. `bun llm` is a real product (multi-model dispatch, judge, leaderboard). `recall` is real cross-session memory. `tribe` is real coordination infra. Pieces could spin out as standalone tools or become the foundation for `claude-tools-as-a-service`.

### A2. Shipped assets — minor bucket (supporting, low-maintenance, niche)

Listed as one bucket because individually they're not strategically load-bearing; collectively they support the major assets:

**termless** (headless terminal testing) · **terminfo.dev** (capability database) · **vt100/vt220/vterm.js** (emulator backends) · **loggily** (unified TS log/span API) · **mdspec** (executable markdown testing) · **alien-projections/resources/trees** (reactive primitives) · **vimonkey** (Vitest fuzz) · **vitepress-enrich** (VitePress docs) · **@silvery/{ansi, color, commander}** (silvery satellites) · **claude-tty-mcp** + **@beorn/{accountly, tap, watcher-chaos}** (internal infra).

These are individually uplift-able if a market opportunity surfaces (e.g., termless could become "Vitest for TUIs"; loggily could become a universal logging primitive) — but as the portfolio stands today they're support cast, not lead.

**Domains owned**: silvery.dev, plainbrain.org, plainbrains.com, knowledgemachine.co, ardentum.co + cluster-1 site domains (termless.dev, loggily.dev, mdspec.org, beorn.codes/flexily/).

**Brand presence**: silvery 3K DL/wk; 62 npm packages under maintainer `beorno`.

### A3. OpenTUI architectural reality check (Ink-migration claim verified)

The "silvery is the only React-TUI framework architecturally suited as drop-in for Ink" claim is verified. OpenTUI's React API is fundamentally incompatible with Ink at the API level:

| Ink | OpenTUI |
|---|---|
| `<Box>`, `<Text>`, `<Spacer>` (PascalCase JSX) | `<box>`, `<text>`, `<span>` (lowercase JSX) |
| `useInput((input, key) => {})` | `useKeyboard((event) => {})` |
| `useApp()` | `useRenderer()` |
| `useStdin()`, `useStdout()`, `useStderr()` | different model |
| `render(<App />)` | `createRoot(renderer).render(<App />)` |
| `useFocus()`, `useFocusManager()`, `<Static>` | different focus + static models |
| `measureElement()` | different measurement primitives |

Every JSX tag, every hook, every render entry point has different shape. An Ink app migrating to OpenTUI rewrites every UI binding — only business logic survives. By contrast, `silvery/ink` is literally `import from "ink"` → `import from "silvery/ink"` — sed-substitutable.

Strategic implication: **the migration market silvery serves is structurally inaccessible to OpenTUI**. This isn't a competitive advantage that can erode without OpenTUI authoring an entirely separate Ink-compat layer — and even then, silvery has the first-mover compatibility number and the architectural lead.

### B. Founder + company strengths (the meta-level advantages)

These are advantages that aren't tied to specific assets — they're properties of *who the founder is* and *how the portfolio is architected* that compound across whichever direction wins.

**Technical depth**:
- **Incredible depth in the TUI + terminal-tech area** — silvery + flexily + termless + terminfo + vt100/vt220/vterm + loggily + mdspec + the migration shim is years of accumulated, hard-won work. The "stack" goes from terminal emulator backends all the way up to React reconciliation, with rigorous testing infrastructure throughout. Almost no one in the world has this depth across these layers.
- **Architectural coherence — components are recomposable in different configurations**. The same primitives (signals, focus scopes, scopes, layout engine, hooks, components) appear consistently across packages. This means strategic pivots are *cheap*: re-using silvery for a canvas target is a binding-layer swap, not a rewrite. Re-using flexily for a non-React frontend is a binding swap. Architecture-as-leverage.
- **Cross-cutting patterns** — alien-* reactive family, scope-based lifecycle, TEA state machines, bidirectional markdown↔tree sync, ACP/MCP/Matrix interop. These patterns travel well across product surfaces.

**Strategic advantages**:
- **Dogfooding PKM and AI coding daily** — the founder uses km, silvercode, silvery, tribe, recall, beads in their actual daily workflow. The product is validated by real use, not user research. Bugs get caught fast (founder hits them immediately). Feature priorities reflect real workflow needs. Marketing angle: *"I built this for myself and use it every day."* This is the strongest validation any pre-launch product can have.
- **Claude-Code-ecosystem fluency** — bearly tooling shows deep, applied understanding of how Claude Code actually works in practice. Rare and shows in the tribe + recall + hooks design quality.
- **Cross-border tax/legal sophistication** — Stripe Atlas history, Norway/CA/Canada residency map, prior C-Corp formation (EOI), prior holding-company structuring (Beowa BVI → Cdn ULC), Mama Muse LLC, AppAnnie/data.ai exit experience. Most founders learn this on their first deal; this founder has multiple under their belt.
- **Solo-founder + AI-augmented velocity** — the entire portfolio is built by ~1 person + AI agents. Implication: if silvery/silvercode/etc. prove out, *the same founder can run multiple ventures simultaneously* in a way that a non-AI-augmented founder couldn't. (Caveat: this is also a constraint per Phase 1.C — solo bandwidth is real.)
- **Existing investor / operator network + Palo Alto residency** — with a venture idea, can easily approach a lot of people via friend-of-friends across SF/Bay Area. AppAnnie/data.ai exit alumni network, Stripe SPV proximity, advisory positions. Palo Alto residency means in-person coffee meetings with founders, operators, partners at top-tier devtools VCs are a reasonable cadence away. Inbound and outbound for fundraising or strategic conversations is *warmer than cold-start by a large margin*.

**Operational / process advantages**:
- **Beads + tribe + recall workflow** — running a sophisticated multi-agent dev workflow with persistent state, cross-session memory, structured task tracking. This is itself proof that the agentic-workdesk thesis is real and operationalizable.
- **vault-as-substrate-for-life** — using PKM-as-md-files in a vault for personal + business + family-office + journal + meeting-notes integration. The PKM-for-AI thesis isn't separate from how the founder lives.
- **Acquirer-readable architecture** — when (not if) silvery + agentroom + km come up in acquisition conversations, the architecture is unusually clean and well-documented. Easy to explain, easy to value.

**What this all means strategically**:
The founder's *unfair advantage* is the combination of (a) deep TUI/terminal stack, (b) daily dogfooding of PKM and AI-coding workflows, (c) AI-augmented solo velocity, (d) cross-border legal/tax sophistication — *and* the architectural coherence that lets these pivot cheaply. Strategies that *use* this combination compound; strategies that *don't* (e.g., a security-first SaaS pitch — S14) waste the founder's actual edge.

### C. Constraints

- **Solo founder bandwidth** — Delei is on Mama Muse, not silvery/km. Realistically <40 hrs/week on silvery+km+silvercode+tribe+agentroom+PlainBrain combined.
- **No formal entity** for the silvery portfolio yet (Wyoming HoldCo planned Q1 2026)
- **No external capital** — bootstrap mode unless / until raise
- **Pre-revenue** on the entire silvery/silvercode/km/tribe portfolio
- **3K DL/wk silvery base rate** has been stable for months — possibly a "demand thermocline" (Kimi's framing)
- **Cannot win head-on against OpenTUI** ($8M Cota seed, Anomaly distribution, Kilo OEM proof) on greenfield React TUI
- **Cannot win head-on against Cursor** ($9.9B valuation, $500M ARR) on integrated agentic IDE
- **Ink-community sensitivity** — Vadim is well-liked, aggressive migration framing risks backlash
- **Operational infrastructure debt** — services (auth, recall, ambient-safety) require production-grade build, not just prototype

---

## Phase 2: Market

### A. Customer segments

| Segment | Size estimate | Characterization |
|---|---|---|
| **Ink users (existing AI CLIs)** | ~1M+ DL/wk Ink ecosystem; tens of thousands of distinct projects | Claude Code, Copilot CLI, Wrangler, npx AI tooling. Capability-capped (mouse, multi-pane, flicker). Architectural lock to React. |
| **OpenTUI users (greenfield AI tools)** | Smaller but well-funded | Anomaly's opencode, Kilo Code (April 2026 fork), early projects. Greenfield builders who want to skip Ink. |
| **Bubble Tea users (Go-native)** | Mature niche | Glow, Crush, Soft Serve. Not silvery's segment. |
| **Generic React TUI builders** | High-volume, low-margin | Internal dev CLIs, install scripts, simple dashboards. |
| **Agentic IDE consumers (Cursor analog)** | Massive — $500M+ ARR demonstrated by Cursor | Cursor users, Claude Code users, anyone wanting Cursor-shape product. |
| **PKM-for-AI users** | Growing fast | Obsidian + AI plugins, Notion AI, Logseq, gbrain. Real category, no AI-native incumbent yet. |
| **AI infrastructure consumers** | $billions in services revenue across vendors | Anyone building AI tools needing auth/recall/safety/sync as services. Vercel/Auth0/Algolia precedents. |
| **Enterprise AI ops (cross-tool coordination)** | Nascent but high-value | Companies needing agent-coordination wires, ACP routing, compliance. |
| **AI lab insiders** | Tiny but extremely high-leverage | Anthropic, Google, Microsoft, OpenAI internal teams building on AI tooling. Acquihire targets. |

### B. Competitors / adjacents per segment

**Ink-migration target**:
- silvery is essentially alone here (OpenTUI architecturally incompatible)
- Only competitor: maintainers staying on Ink

**Greenfield React TUI**:
- OpenTUI ($8M Cota seed, Anomaly distribution)
- Ink itself (massive incumbent, dominant DLs)
- Bubble Tea / Charm (Go, different ecosystem but cross-pollinates)

**Agentic IDE (silvercode space)**:
- Cursor ($9.9B, $500M ARR, dominant)
- Claude Code (Anthropic, free, deeply integrated with Claude)
- Aider, Cline, Continue, Goose, Crush, opencode, Kilo Code, Codex CLI, gemini-cli, Hermes Agent, OpenHands

**PKM-for-AI (km space)**:
- Notion ($30B+, AI features bolt-on)
- Obsidian (popular, free, open community)
- Logseq, Dendron, Anytype, Reflect, Mem, Capacities, Tana
- Cursor Rules / Claude Projects / ChatGPT Memory (the AI-native players)

**AI infrastructure services**:
- Vercel AI SDK + AI Gateway (~$200M ARR)
- Auth0 (acquired Okta, $6.5B)
- Algolia ($100M+ ARR)
- Supabase ($50M+ ARR)
- LangChain (free) + LangSmith (paid)
- Helicone, Portkey, Pinecone, Weaviate
- Lambda Labs, Modal, Daytona, E2B (sandbox/exec providers)

**Cross-tool coordination / ACP**:
- Zed Industries (created ACP, will run their own infra)
- Anthropic + OpenAI (developing or implicit in Claude Code / Codex CLI)
- MCP brokers (different layer — MCP is agent↔tools, ACP is editor↔agent)
- Matrix Foundation (general protocol stack, not agent-specific)

### C. Trends / inflection points

- AI agents getting more autonomous (long-running tasks, multi-step plans)
- Agent coordination across machines becoming a real need (squad mode demand)
- Markdown-as-substrate gaining (Obsidian + AI, Notion AI exports, Cursor Rules)
- Multi-pane / multi-agent UX expected (Cursor multi-tab, Claude Code parallel)
- AI-tool builder fragmentation (every team building their own internal CLI)
- Open-source standards as defaults (MCP, ACP, OAuth-for-AI emerging)
- Cloud services as the boring infrastructure layer for AI (Auth0/Algolia pattern translating to AI)
- Devtools fundraising remains hot despite broader market — Cursor + Vercel + Replit all priced up
- **Obsidian likely acquisition target** (founder hypothesis 2026-04-28) — given Obsidian's sudden importance as the de facto AI-KM vault editor, big-$$ acquisition by Microsoft/Notion/Anthropic plausible in next 12-24 months. Either outcome creates km opportunity: (a) acquihire makes Obsidian's roadmap captive to a parent company → km can serve power-user segment that wants AI-native + independent; (b) accelerated Obsidian-AI features confirm category and raise the bar but also create market awareness km can ride.

### D. Demand signals (real evidence, not just market intuition)

- 1M+ DL/wk for Ink-using AI CLIs (real demand for the architecture, capability-capped)
- gbrain (third-party PKM-for-AI tool with 4,600+ pages dogfooded by the founder) — existence proof of the PKM-as-md-files-for-AI movement; not a personal asset, just lived evidence of the category
- $8M raised by Kilo on OpenTUI — greenfield TUI is fundable
- Anthropic's Claude Code adoption — agentic CLI as a category is validated
- ACP being shipped in Zed — coordination-protocol demand is real
- Cursor's $500M ARR — agentic IDE is a real commercial market
- Vercel + Auth0 + Algolia IPOs — infrastructure-as-a-service is monetizable
- Mama Muse + EOSC operating history — bootstrap-to-revenue is a working pattern in this household

### E. Strategic windows / closing-time considerations

- **Ink-migration window** is 12-18 months: longer Ink projects get more entrenched or rewrite to OpenTUI
- **ACP standard window** is forming now: whoever builds the canonical hosted gateway has 6-12 months before someone else does
- **Notion-AI consolidation window** still open: Notion's AI features are bolt-on; PKM-native AI tools have a 12-24 month wedge
- **Anthropic / OpenAI internal-tooling window** open until they build their own (likely Anthropic builds their own Claude Code v2 in next 12 months)

---

## Phase 2.5: The layered AI stack — which layers can we play in?

A demand-side view of the strategy. Instead of asking "what can we sell?" ask "what layers does the future AI-development stack need, and where do our assets fit?"

The future AI-development stack (consumer + enterprise):

```
L7  APPLICATIONS                  Cursor, Claude Code, Notion AI, ChatGPT, Perplexity
                                  Winner-take-most; consumer-facing; crowded.

L6  WORKSPACES / ENVIRONMENTS     Cursor, Claude Code, Notion, Obsidian, VS Code,
                                  silvercode, km
                                  Where work happens.

L5  AGENT FRAMEWORKS              LangChain, LlamaIndex, Vercel AI SDK,
                                  Anthropic Agents SDK
                                  Build agents from primitives.

L4  UI FRAMEWORKS                 silvery, Ink, OpenTUI, React, Vue, Flutter
                                  Rendering + interaction primitives.

L3  COORDINATION / PROTOCOLS      MCP, ACP, tribe, Matrix; agentroom plays here
                                  How things talk to each other.

L2  SERVICES (infrastructure)     Auth0, Vercel AI Gateway, Algolia, Pinecone,
                                  Helicone, LangSmith
                                  Auth, secrets, vector DB, safety, telemetry, billing.

L1  MODEL APIs                    Anthropic, OpenAI, Google, Mistral, OSS
                                  Commoditizing; capital-intensive; race-to-bottom.

L0  COMPUTE / EXECUTION           Modal, Daytona, E2B, Codespaces, AWS, GCP
                                  Capital-intensive.
```

### Where can we realistically play, and at what team size?

Solo-founder is the *current* situation but the strategy menu should reflect what team size each layer minimally requires. Different layers have different operational physics — some can be carried by 1 founder + AI agents, others require co-founders + early hires.

| Layer | Solo (today) | 2-3 (co-founder + 1 hire) | 5-10 (seed-stage team) | 20+ (Series A+) |
|---|---|---|---|---|
| **L7** Applications | not viable | not viable | not viable | viable (Cursor, Notion shape) |
| **L6** Workspaces (km, silvercode) | viable for v1 + dogfooding | viable to PMF | viable to launch + early customers | needed for scale |
| **L5** Agent frameworks | not viable (incumbents have head start) | viable with niche | viable | viable |
| **L4** UI frameworks (silvery) | viable today (already shipped) | better community management | strong support burden coverage | foundation-team scale |
| **L3** Coordination protocols (tribe, agentroom) | spec-only viable; production gateway not | viable with infra-ops co-founder | viable for production gateway + first customers | viable for enterprise SLA |
| **L2** Services (auth, recall, ambient-safety) | demo-only viable | each service needs ~2-3 people | per-service team; multi-tenant infra; SRE + security + sales | viable for enterprise |
| **L1** Model APIs | not viable | not viable | not viable | not viable (capital-prohibitive) |
| **L0** Compute / execution | not viable | not viable | not viable | not viable (capital-prohibitive) |

### What this means for sequencing

- **Today (solo)**: silvery (L4) maintenance + km (L6) v1 + tribe wire spec (L3, spec-only) are realistic. Production hosted services (L2) and production agentroom gateway (L3) are demo-only at solo scale.
- **2-3 people (after first hire or co-founder, ~6-12 months out)**: production gateway + 1-2 services tier products become viable. silvercode and km can each have a dedicated owner.
- **5-10 people (after seed, ~12-24 months out)**: full ACP-proxy stack + multiple commercial-tier services + dedicated SRE/security become realistic. This is the team size for the "tribe-as-control-plane plugin pack" + agentroom commercial-grade gateway.
- **20+ people (Series A, ~24-36 months out)**: enterprise sales motion, dedicated security/compliance team, full support burden across silvery + services + workspace products.

### Solo-stage strategic implications

What can a solo founder do *today* that compounds into all later team sizes?

1. **Keep silvery + tribe + the standards moving forward** — these become the foundation that hires build on top of. Specs are lowest-bandwidth, highest-leverage solo work.
2. **Use km to dogfood the agentic-workdesk thesis** — daily use validates feature set at zero marketing cost.
3. **Pre-position network for the first co-founder / hire / fundraise** — Palo Alto + existing investor network means warm intros are achievable.
4. **Don't try to ship production hosted services solo** — they degrade quality and burn out the founder. Demo-grade is fine; production-grade waits for hires.

This means the *cross-elasticity-aware portfolio* (silvery open + km commercial + protocol specs + the ACP-proxy ship-now cluster as plugins on existing infra) is solo-doable. The *services-tier-led* portfolio (Direction 3 / S2 / S16) needs the team — fine to plan for, but not solo-executable.

### The layer-aware strategic insight

### The layer-aware strategic insight

silvery (L4) → silvercode (L6) is **where cross-elasticity bites hardest** because L4-framework-users *are* L6-workspace-builders. The same audience that adopts silvery is the audience equipped to build silvercode-equivalents themselves.

But silvery (L4) → services (L2) and agentroom (L3) → enterprise sales sit in layers where **cross-elasticity is positive** (services and protocol coordination are things users want to *avoid* doing).

**The same portfolio, played at different layers, has fundamentally different revenue dynamics.** This collapses the strategy menu:

- **L4 silvery** — open framework, brand halo. No direct revenue path. Accept that.
- **L3 agentroom** — open spec + paid hosted gateway (Confluent shape). Revenue play.
- **L2 services** — silvery-cloud / hosted services tier (auth, recall, ambient-safety, sync). Vercel pattern. Revenue play.
- **L6 km** — PKM-for-AI workspace, validated externally by gbrain + the PKM-as-md-files movement. Less cross-elasticity exposure. Revenue play.
- **L6 silvercode** — open reference implementation that demonstrates L2/L3 services. Marketing/halo, not revenue.

Three commercial revenue streams, two open marketing assets, one protocol asset. Acquirer-friendly at multiple price points (L2 or L3 can be acquired independently of L6 km).

---

## Phase 2.6: Five strategic directions

Before getting into the specific strategy candidates in Phase 3, here are the five top-level directional buckets — most strategies fall into one or more of these:

- **Direction 1 — silvery + silvercode** (locked Option 5 today). Open framework + proprietary IDE + services backing it. Cross-elasticity trap exposure: high.
- **Direction 2 — km / PlainBrain as PKM-for-AI** (Notion-meets-Obsidian shape). Validated externally by gbrain + the PKM-as-md-files movement. Subscription workspace play *or* decompose km into silvercode features (board, journal, outline) — the substrate is flexible. Cross-elasticity exposure: low for knowledge-worker framing, near-zero if decomposed into silvercode.
- **Direction 3 — Services-led, silvercode is open reference** (Vercel/Auth0/Algolia pattern). silvery open framework + open silvercode-as-reference + paid hosted services tier. Cross-elasticity: positive (services are what users want to *avoid* doing).
- **Direction 4 — ACP-proxy / tribe stack inside the portfolio** — the protocol-and-coordination cluster sits as cluster-2 alongside silvercode + km. Multi-venture: gateway + storage + coordination + compute platform.
- **Direction 5 — ACP-proxy / tribe stack spun out as its own venture(s)** (Confluent shape). Separate entity (or entities), separate raise, separate co-founder(s). Decoupled from silvery/silvercode/km success.

Directions 4 and 5 are both ACP-proxy plays — they differ on whether the stack lives *inside* the silvery/silvercode/km portfolio or is *separated*. D4 keeps capital, brand, and acquisition events together; D5 lets each part rise/fall on its own terms.

---

## Phase 2.7: ACP-proxy is itself a multi-venture cluster

The "ACP-proxy" concept (referenced in D4/D5 above) isn't one product — the canonical inventory at [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md) scores **14 distinct ventures** within the proxy concept. The top cluster reaches the 25/25 ceiling and is described in that doc as a *"candidate generational company"*.

**The architectural progression** (each layer is a venture, layered = bigger moat):

```
Layer 4: Agent-in-the-middle platform   — Cloudflare Workers analog
                                          recall-thought, critic, style-watcher,
                                          test-runner, docs-keeper as persistent
                                          sub-agents. (#14, score 21/25)

Layer 3: Coordination state              — derived todos / locks / decisions /
                                          findings / handoffs / asks. The
                                          "agent collaboration database."
                                          (#13, score 23/25)

Layer 2: Vault session storage           — `org.agentroom.*` events as JSONL +
                                          markdown round-trip. km vault as
                                          canonical session store. (#12, score 22/25)

Layer 1: ACP↔Matrix bridge + spec        — gateway routes ACP into Matrix +
   authorship                              direct Slack/Discord adapters; authors
                                          `org.agentroom.*` MSC. The substrate.
                                          (#11, score 24/25)
```

**Cluster math** (from the ventures doc):
- #11 alone (gateway + spec): **24/25**
- #11 + #12 (gateway + storage): **24-25/25**
- #11 + #12 + #13 (gateway + storage + coordination): **25/25 ceiling**
- #11 + #12 + #13 + #14 (+ compute platform): **25/25, qualitatively bigger**

**Plus 10 other plug-in ventures** that ride this stack as features:

| # | Venture | Score | Status |
|---|---|---|---|
| 1 | Per-session observability dashboard | 19/25 | top-3 ship-now cluster |
| 2 | Cross-agent recall (Memory-as-a-Service) | 19/25 | top-3 ship-now cluster |
| 3 | Cost dashboard + budget caps | 18/25 | top-3 ship-now cluster |
| 4 | Tool governance + universal MCP registry | 17/25 | window closes in 18 months when Anthropic ships native |
| 5 | Auto-routing / model arbitrage | 15/25 | OpenRouter has 2yr head start; killable |
| 6 | A/B + replay + shadow (regression-test agent quality) | 15/25 | LangSmith/Helicone adjacent |
| 7 | Cross-machine federation | 15/25 | high-ceiling, low-demand-signal |
| 8 | Provenance / signing for code attestation | 15/25 | speculative bet on EU/US AI-coding regulation |
| 9 | Prompt redaction + egress firewall | 15/25 | wrong customer for us; killable |
| 10 | Multi-surface output (Slack/voice/REST) | 14/25 | subsumed by #11 |

**What this means for strategy**: D4 and D5 are not "agentroom yes/no" — they're "which subset of these 14 do we ship, in what order, and inside or outside the portfolio?"

**The key insight from the ventures doc** (cross-cutting analysis):
> *"Three of the top four are the same product: a 'tribe control-plane plugin pack' (observability + recall + cost + governance). The strategy isn't to pick one; it's to ship all four as one v1 of 'tribe-as-control-plane'."*

> *"Build the cross-agent gateway, sell observability + memory + governance as plugins — could clear $50M ARR within 3 years if positioned correctly. That's a $500M+ exit candidate."*

The ACP-proxy cluster has the highest commercial ceiling in the entire portfolio. It's also the only cluster that's *fully validated by rubric scoring* — silvercode and km don't have equivalent venture-scored backing.

Cross-reference: full rubric, prior-art map (Kong $2B, OpenRouter $1.3B, LangChain $1.25B, Mem0 $24M/52K stars, Cursor $50B), and re-score triggers in [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md).

---

## Phase 3: Strategy candidates

Mix-and-match Inventory × Market × Layer → enumerate strategies. Each strategy has an example-driven title (the precedent or analog the strategy resembles) followed by the concrete plan.

Scoring dimensions:
- **B**andwidth load (1=light, 5=heavy)
- **T**ime to first revenue (months)
- **C**eiling (commercial revenue ceiling, qualitative: low / mid / high / very-high)
- **R**isk (1=low, 5=high)
- **D**ependencies (what needs to be true for this to work)

### S1 — "Cursor with our framework" (locked Option 5, silvery+silvercode integrated)

Direction 1. silvery open Apache + CLA, silvercode proprietary IDE, tribe wire open, services proprietary, PlainBrain elevated to portable standard. The integrated portfolio bet.

**Score**: B=5 / T=12-18 / C=mid-high / R=4 (cross-elasticity exposure) / D=silvery validates as Ink-migration target *and* silvercode finds product-market fit *and* services tier scales

### S2 — "Vercel for terminal" (services-led, silvercode is open reference)

Direction 3. silvery framework Apache. silvercode open-sourced as the *reference* agentic IDE (not paid product). Revenue from services tier (auth, recall, ambient-safety, agentroom, sync). Kubernetes → GKE pattern. The cross-elasticity-aware version.

**Score**: B=5 / T=18-24 / C=very-high / R=4 / D=silvery validates *and* services tier reaches production-grade *and* SOC2/compliance hygiene *and* customer trust

### S3 — "JetBrains pattern" (close silvery, sell silvercode standalone)

silvery stays MIT but unpromoted. silvercode commercial-only, no open showcase. Services are silvercode-internal, not standalone. JetBrains' approach: own the framework privately, sell the IDE.

**Score**: B=4 / T=6-9 / C=mid / R=3 / D=silvercode finds standalone PMF without the silvery brand halo

### S4 — "Notion-for-AI" (km/PlainBrain PKM venture, silvery deferred)

Direction 2. silvery quietly maintained, no big launch. Focus: km + PlainBrain spec + the broader PKM-as-md-files-for-AI category (validated externally by gbrain + Obsidian + the AI-vault movement). Notion/Obsidian-adjacent commercial play. Subscription billing for km-cloud.

**Score**: B=3 / T=12-18 / C=mid / R=3 / D=PKM-for-AI as a category sustains; km finds wedge against Notion/Obsidian

### S5 — "Confluent for AI agents" (agentroom spun out as own venture)

Direction 5. agentroom Inc as separate entity. Open ACP wire spec + open reference gateway + paid hosted control plane. Standalone fundraise ($3-5M seed). Infrastructure-ops co-founder.

**Score**: B=3 (own venture) / T=12-18 / C=high / R=4 / D=ACP standard wins, hosted gateway demand materializes, infrastructure-ops co-founder, Anthropic/Microsoft/etc don't ship competing protocol

### S6 — "Charm.sh for React" (multi-product OSS infrastructure suite)

silvery + termless + loggily + flexily + mdspec as a coherent "developer infrastructure suite for terminal apps" — Charm Industries' shape but for the React ecosystem. Premium support / hosted versions monetize across the suite.

**Score**: B=3 / T=18-24 / C=mid / R=3 / D=cross-product brand thesis works; the React-TUI-power-user audience is real

### S7 — "Mem.ai but local-first" (PKM-as-md-files-for-AI movement productized)

PlainBrain + km + adjacent tools (gbrain-style, Obsidian-AI plugins) as a *local-first* personal-AI substrate. Markdown + git + LLM. Subscription for cloud sync only; the substrate is local-first. Counter-position to cloud-native PKM-AI tools.

**Score**: B=3 / T=12-18 / C=mid / R=3 / D=local-first AI tool category gains momentum; offline-first wedge holds against cloud-native incumbents

### S8 — "Linux Foundation pattern" (donate silvery to a foundation, focus commercial)

silvery → CNCF / Apache Foundation / OpenJS Foundation. Strip personal stewardship burden. Focus 100% on silvercode + km + services. Community-led silvery still drives funnel, you don't run it.

**Score**: B=2 / T=12 / C=mid-high / R=3 / D=foundation accepts; silvery community sustains under foundation governance; brand halo persists

### S9 — "Cursor + Notion bundled" (agentic workdesk subscription)

silvercode + km bundled as one subscription (the integrated workdesk). One pricing page, one auth, one cloud. Position against Notion + Cursor as *"the integrated thing both companies are trying to be."*

**Score**: B=5 / T=12-18 / C=high / R=4 / D=both products find PMF; the bundle is more valuable than either alone; the integrated story is differentiated

### S10 — "Atomic Inc studio" (multi-venture portfolio, separate raises)

silvery (community OSS, no commercial), agentroom Inc (Confluent shape, separate raise), silvercode Inc (Cursor shape, separate raise), km Inc (PKM venture, separate raise). Each has its own cap table. Cross-pollination via shared tech, but commercial separation.

**Score**: B=5 / T=18-36 / C=very-high (multiple ARR streams) / R=5 / D=founder can split focus across multiple commercial entities; capital available; co-founders for each

### S11 — "Acquihire optimized" (build for strategic acquisition)

Build silvery + km + tribe to *just enough* for an acquihire by Anthropic / Vercel / Cursor / Notion. Don't try to scale to standalone businesses. Optimize for visibility + technical credibility + complementary integration with one of those companies' platforms.

**Score**: B=3 / T=24-36 (acquisition timeline) / C=high (single liquidity event) / R=4 / D=at least one target acquirer actually wants what you've built; acquisition happens before runway runs

### S12 — "Bootstrapped consulting first" (build as you bill)

silvery as portfolio piece; primary revenue from custom Ink→silvery migrations + agentic-IDE consulting. Build as you bill. Productize what consulting reveals demand for. Bootstrap-friendly. Patio11 / 37signals / DHH shape.

**Score**: B=4 (consulting eats time) / T=1-3 / C=low-mid / R=2 / D=consulting demand exists; willing to do bespoke work for cash

### S13 — "Devtools VC seed" (pre-launch raise on integrated narrative)

Take the "three open standards + two products + services + agentroom" narrative directly to a devtools-VC ($3-5M seed). Use capital to hire 2-4 engineers and run multiple directions in parallel. Founder stays strategic. Vercel-day-one shape.

**Score**: B=2 (with team) / T=24+ / C=very-high / R=4 / D=narrative is fundable without traction; right VC bites; can hire fast; team integration works

### S14 — "Snyk for AI" (security-first wedge)

Pivot: silvercode is a *security-first* agentic IDE. Ambient-context-safety pipeline becomes the wedge. Sell to enterprises whose developers use AI tools but need leak prevention / audit / compliance. Differentiate from Cursor on security posture. Snyk / Cyera shape but for AI agents.

**Score**: B=4 / T=12-18 / C=mid-high / R=4 / D=enterprise security-for-AI is a real budget; we can deliver SOC2-ready security tooling; security-buyer relationships exist

### S15 — "Anthropic-direct" (silvery + agentroom for AI lab teams)

Position silvery + agentroom for Anthropic / OpenAI / Google internal-tooling teams. These labs are building AI CLIs (Claude Code, Codex, Gemini-cli) and need exactly what silvery + agentroom offer. Direct enterprise sale or strategic partnership. Don't chase the long tail; chase the 5-10 customers that matter.

**Score**: B=3 / T=6-12 / C=high (per customer) / R=4 / D=AI labs return calls; we can deliver enterprise-grade infra; ACP becomes the wire they want

### S16 — "Auth0 for AI agents" (services-only, silvery is portfolio)

Direction 3, sharper. silvery stays open framework but is *not* the focus. The flagship product is the services tier alone — auth, secrets, BYO-key handling, multi-vendor LLM gateway, ambient safety. Sell to anyone building AI tools (silvery users, OpenTUI users, Ink users, web app builders). Auth0 → Okta acquisition shape.

**Score**: B=4 / T=18-30 / C=very-high / R=4 / D=services market matures; SOC2 hygiene; cross-framework portability of the services SDK

### S17 — "Ghost for PKM" (PKM-for-AI with hosted + self-hosted)

Direction 2 + Direction 3 hybrid. km/PlainBrain as substrate, with both **hosted km cloud** (subscription, low-friction) and **self-hosted km** (open-source, run-your-own). Mirror Ghost (the publishing platform): hosted is the paid tier, but the open-source is a real alternative. Pulls from the PKM-as-md-files-for-AI movement (gbrain + Obsidian-style power-user community).

**Score**: B=4 / T=12-18 / C=mid-high / R=3 / D=PKM-for-AI as a category sustains; hosted-vs-self-hosted tier serves both segments; power users adopt

### S18 — "tribe-as-control-plane" (ACP-proxy ship-now top-3 cluster)

D4 inside the portfolio. Ship the top-3 ACP-proxy ventures as one v1 product: **#1 observability + #2 cross-agent recall + #3 cost dashboard** as a unified "tribe control-plane plugin pack." All three ride existing silvercode JSON-RPC tap; all three are tribe-side plugins; one sprint ships the trio. Distribution: free silvercode upgrade, fans out to km + future products. The ventures doc identifies this as the "ship-now cluster."

**Score**: B=2 (small package, existing infra) / T=2-3 (one sprint to MVP) / C=mid (Worth=2-3 individually but cluster bonus pushes to mid) / R=2 / D=silvercode launches and creates the JSON-RPC tap; tribe plugin model is real

### S19 — "Confluent stack" (ACP-proxy top-cluster as own venture, D5)

D5 spun out. The top cluster (**#11 gateway + #12 vault storage + #13 coordination layer**) hits 25/25 — packaged as its own venture: open ACP↔Matrix gateway with `org.agentroom.*` spec authorship + canonical km-vault session storage + agent-coordination primitives. Confluent → Apache Kafka shape. $3-5M seed pitch. Infrastructure-ops co-founder. Independent acquihire-ready (GitHub, Microsoft, Vercel, Replit).

**Score**: B=3 (own venture, with co-founder) / T=12-18 / C=very-high (the doc explicitly calls this a "candidate generational company") / R=4 / D=ACP standard wins, infrastructure-ops co-founder, ship MSC for `org.agentroom.*` event vocab before Anthropic/OpenAI/Google ships theirs

### S20 — "Cloudflare Workers for ACP" (compute-platform layer, #14)

Add the **agent-in-the-middle platform** (#14) on top of S19. The proxy hosts persistent LLM sub-agents (recall-thought, critic, style-watcher, test-runner, docs-keeper) that watch ACP traffic and inject ambient observations. Cloudflare CDN → Workers analog: substrate is the start, compute is the moat (Cloudflare $30B+ valuation came from Workers, not CDN).

**Score**: B=4 (deeper integration than gateway) / T=18-24 / C=very-high / R=4 / D=S19 ships first; recall-thought sub-agent (88KB existing design) productizes; multi-tenant LLM cost economics work; privacy/compliance posture for hosting source

### S21 — "Memory-as-a-Service for AI agents" (cross-agent recall as standalone, #2)

Pull #2 (cross-agent recall) out as its own product. Mem0 ($24M raised, 52K GitHub stars) and Letta ($10M, 22K stars) prove the market; both are *single-agent*; **nobody has cross-agent memory** because no incumbent has reason to bridge Claude + Codex + Gemini + Copilot. silvery+tribe-bearly already has the recall infrastructure; promoting it from silvercode-internal to a tribe-side plugin gives every ACP client (km, pam, future products, third-party agents) Memory.

**Score**: B=3 / T=6-9 / C=high / R=3 / D=cross-agent-memory category survives Anthropic Memory + OpenAI Memory single-agent versions; tribe plugin model spreads beyond silvercode

### S22 — "ACP-proxy + ship-now cluster combined inside portfolio" (D4 maximum)

The integrated portfolio version. Ship S18 (top-3 ship-now) + S19's top cluster (#11+#12+#13) + km's PlainBrain spec all together as a unified "tribe control-plane + ACP-proxy + agent collaboration database" stack. All under one entity, one go-to-market, one acquisition outcome. Larger surface than S18 alone, smaller than spinning out (S19).

**Score**: B=5 / T=12-24 / C=very-high (combined cluster sums to 25/25) / R=4 / D=founder bandwidth holds across all components; team can be hired; integrated narrative compels investors/acquirers more than separate parts

### S23 — "The playground for the UI of agentic work" (one app, multiple panes; TUI today → web/native tomorrow)

The deepest framing yet. Stop thinking about specific product categories — silvery + km + silvercode are the **playground where the UX paradigm of agentic work is being invented**. The integrated app is the laboratory. The substrate (PlainBrain markdown repo) + the framework (silvery, multi-target) are what let the paradigm travel.

**The integrated app**: take a github repo of .md files and turn it into a Notion-like experience, plus everything else AI-tooling needs. One app with different views/panes:

- **Chat panes** (Slack-like) — agent + human conversations, persisted as `org.agentroom.*` events in `~/vault/chats/*.jsonl`
- **Doc panes** (markdown) — Notion-like editing, bidirectional with the underlying .md
- **Code panes** (silvercode) — IDE integration, multi-pane parallel agents
- **Agent orchestration panes** — squad mode, file claims, cross-agent state viz, recall
- **Board / kanban panes** — task management, decisions, findings, handoffs
- **Diagram panes** — on-demand interactive architecture diagrams (silvery + flexily + canvas; novel UI nobody else has)
- All on top of the same vault substrate (PlainBrain repo shape)

silvercode can be a pane *in* km. km-board can be panes *in* silvercode. It's the same underlying app with selectable layouts. Neither product needs a separate identity — they're modes.

**Multi-target as the long-term lever**: today this is a TUI (silvery + termless + flexily render to terminal). silvery's multi-target architecture means the same app can ship as web/native when those become the better surface for the paradigm. The bet isn't "TUI wins"; the bet is "we're inventing the UX for agentic work, and the framework lets us follow the customer wherever they go."

**Why this collapses cross-elasticity**: silvery's audience can't easily build *this* themselves because the value isn't in any one component — it's in the integrated whole + the substrate + the bidirectional everything + the framework that targets multiple platforms. *Inventing a UX paradigm and shipping it across multiple surfaces* is structurally a different bet from "build a Cursor clone."

**The acquisition story this enables**: when Anthropic/Vercel/Notion realizes the paradigm is real, they don't acquire one component — they acquire the whole laboratory. Bigger outcome, less fungible.

**Score**: B=5 / T=12-24 / C=very-high (genuinely new category — *"the playground for the UI of agentic work"* — TUI today, web/native tomorrow) / R=4 / D=integrated UX achievable solo + AI-augmented for v1; novel-UI bets land; multi-target architecture stays cheap because it's already designed in

### S24 — "Acquihire-positioned for Big AI labs" (silvery + agentroom as Anthropic/Google/Microsoft target)

Build silvery + the silvery/ink shim + agentroom + tribe to *just* the right size for a strategic acquisition by a Big AI lab that needs to migrate their internal CLI off Ink. Anthropic's Claude Code, Google's Gemini CLI, GitHub's Copilot CLI all have Ink architectural constraints. silvery is the only architecturally-suited replacement. Optimize the portfolio for the conversation: clean architecture, well-documented, strategic complementarity with each lab's tooling. Don't try to win as standalone product; structure for $50-200M acquihire+IP outcome.

**Score**: B=3 / T=18-30 / C=high (single liquidity event; $50-200M plausible) / R=4 / D=at least one Big AI lab decides Ink is a real architectural problem and looks for the migration path; conversation reaches the right people

### S24 — "Acquihire-positioned for Big AI labs" (silvery + agentroom as Anthropic/Google/Microsoft target)

Build silvery + the silvery/ink shim + agentroom + tribe to *just* the right size for a strategic acquisition by a Big AI lab that needs to migrate their internal CLI off Ink. Anthropic's Claude Code, Google's Gemini CLI, GitHub's Copilot CLI all have Ink architectural constraints. silvery is the only architecturally-suited replacement. Optimize the portfolio for the conversation: clean architecture, well-documented, strategic complementarity with each lab's tooling. Don't try to win as standalone product; structure for $50-200M acquihire+IP outcome.

**Score**: B=3 / T=18-30 / C=high (single liquidity event; $50-200M plausible) / R=4 / D=at least one Big AI lab decides Ink is a real architectural problem and looks for the migration path; conversation reaches the right people

---

## Phase 4: Sequencing options

[TBD — to be developed collaboratively after Phase 3 strategy candidates are scored / refined]

Sequencing dimensions to consider:
- **Capital required**: bootstrap → angel → seed → Series A
- **Bandwidth conflicts**: which strategies can run in parallel without splitting the founder
- **Signal-gates**: what signal triggers escalation vs pivot
- **Reversal cost**: which strategies can be reversed cheaply if they fail; which lock you in
- **Network effects**: which strategies *enable* others later; which foreclose options

Tentative sequencing options to develop:

- **Path α (current)**: S1 locked. Run silvery + silvercode + km + tribe + PlainBrain in parallel. High bandwidth load, integrated narrative, Day 90 kill.
- **Path β (focused)**: S1 sub-set — silvery alone for 3 months, then layer silvercode at month 3 if silvery validates, then services tier at month 6. Sequenced, lower bandwidth load.
- **Path γ (services-first)**: S2 — silvery + open silvercode + paid services. Bigger ceiling but slower lift, requires production infra investment.
- **Path δ (PKM-first)**: S4 — defer silvery promotion, focus on km/PlainBrain in the AI-vault category. Use the broader PKM-as-md-files-for-AI movement (gbrain, Obsidian-AI plugins, Cursor Rules adoption) as evidence + lean on founder dogfooding for credibility. Faster to revenue if PKM market warmer than expected.
- **Path ε (multi-venture)**: S10 — agentroom spun out as own thing; silvery donated to foundation; silvercode + km as single bootstrapped product. Clean separation but high coordination overhead.
- **Path ζ (capital-first)**: S13 — raise first, run multiple paths with hired engineers.

---

## Phase 5: Recommendation

[TBD — emerges from Phase 3 + Phase 4 collaborative iteration]

Key open questions for Phase 5:

1. **Do we believe the cross-elasticity argument?** (Kimi: silvery's audience IS silvercode-equivalent builders) — if yes, S1 has a structural problem and we should push toward S2/S3
2. **Is the PKM-as-md-files-for-AI movement (gbrain, Obsidian-AI, Cursor Rules, Claude Projects) enough validation for the km/PlainBrain play?** — gbrain is third-party (not ours) and dogfooded by the founder; the broader movement is real but fragmented. Does the category have a real wedge for a new entrant, or has it consolidated around Obsidian-as-default? Obsidian acquisition timing matters here.
3. **Does the user want to / can the user run multiple commercial entities?** — answers S5/S10 (multi-venture) vs S1/S2 (integrated portfolio)
4. **Is acquihire (S11) an acceptable outcome?** — drives whether to optimize for visibility-and-integration-with-one-platform vs standalone-revenue-maximizing
5. **Should agentroom be inside or outside the portfolio?** — separable from #3

---

## Notes on the workshop process

This doc is meant to be edited collaboratively. As we iterate:

- Add to Inventory if assets surface that weren't captured
- Add to Market if competitor / segment / signal emerges that wasn't named
- Add new strategies to Phase 3 (S16, S17, ...) as combinations are proposed
- Score sharper as we learn (some scores are LLM-guesses; founder will know better)
- Test strategy combinations against the kill criteria from licensing-strategy.md
- Cross-reference: when a strategy survives Phase 5, port the decision back into licensing-strategy.md (or supersede it with a new doc)

Cross-references:
- [`licensing-strategy.md`](licensing-strategy.md) — current Option 5 commitment
- [`integrated-workdesk.md`](integrated-workdesk.md) — the agentic-workdesk vision
- `~vault/areas/@office/CHARTER.md` — family-office structure
- `/tmp/strategy-pro-v3-final-2026-04-28.md` — most recent /pro critique
