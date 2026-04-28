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

### A. Shipped assets (already exist + work)

**UI / framework cluster**:
- **silvery** — React TUI framework, 98.6% Ink-compat shipped, 3K DL/wk, polished, multi-target rendering (terminal + canvas/DOM future), mouse-first, incremental rendering, 45+ components. silvery.dev live.
- **silvery/ink** — the migration shim, ~3K LOC, bundled into silvery package
- **flexily** — Yoga-compatible flex layout, 1.5-5.5× faster, no WASM, 1561 tests. beorn.codes/flexily/ live.
- **termless** — headless terminal testing, 10 backends, < 1ms tests, recording → GIF/SVG/APNG/asciicast. termless.dev live.
- **terminfo.dev** — terminal capability database. Live.
- **vt100.js / vt220.js / vterm.js** — emulator backends, support termless
- **loggily** — unified TS debug/log/span API, ~22× faster noop loggers, 3KB. loggily.dev live.
- **mdspec** — executable markdown testing, pre-release 0.x. mdspec.org live.
- **alien-projections / alien-resources / alien-trees** — reactive primitives at github.com/beorn/bearly/packages/
- **vimonkey, vitepress-enrich** — fuzz testing for Vitest, VitePress docs tooling

**Product / commercial cluster (proprietary, in development)**:
- **silvercode** — multi-pane agentic IDE built on silvery; validated near-term wedge: squad mode (parallel agents + CrossAgentState). Pre-launch.
- **km / Knowledge Machine** — agentic knowledge workspace; board + calendar + journal + agents + recall, bidirectional md↔SQL sync. Has knowledgemachine.co. Pre-launch.
- **gbrain** — *already running* in user's workflow; PKM-for-AI substrate at ~/Code/gbrain/, ~/.gbrain/, 4,600+ pages of journals/people/decisions/meeting-notes. Empirical existence proof of the PKM-as-md-files-for-AI thesis.

**Standards / specs cluster**:
- **tribe** — cross-session/cross-machine coordination protocol; currently MIT in vendor/bearly. Wire + event vocabulary + room/chat patterns + lease semantics + ambient channels.
- **PlainBrain** — markdown-filesystem shape km uses; not yet formalized as spec, currently just km's internal data model. Domains plainbrain.org + plainbrains.com owned.
- **agentroom gateway** — planned ACP↔Matrix bridge, paid managed cloud, top-scoring venture (24/25). Not built.

**Internal infrastructure (proprietary, not customer-facing)**:
- **claude-tty-mcp** — MCP server for terminal automation
- **@beorn/{accountly, tap, watcher-chaos}** — internal infra packages
- **bearly tooling** — tribe daemon, recall, hooks, llm CLI orchestration

**Domains owned**:
- silvery.dev, plainbrain.org, plainbrains.com, knowledgemachine.co, ardentum.co
- Plus the cluster-1 site domains (termless.dev, loggily.dev, mdspec.org, beorn.codes/flexily/)

**Brand presence (where adoption already exists)**:
- silvery: 3K DL/wk across the ecosystem
- 62 npm packages under maintainer `beorno`
- Personal domain authority (gbrain has years of vault history; existing investor / operator network from prior ventures)

### B. Capabilities / unique advantages

- **Architectural**: silvery uniquely positioned as Ink drop-in (OpenTUI architecturally incompatible)
- **Performance**: verified 3-27× faster than Ink (silvery), 1.5-5.5× faster than Yoga (flexily), 22× faster than noop loggers (loggily), < 1ms tests (termless)
- **Multi-target ambition**: silvery designed for terminal + canvas + DOM (only TUI framework with this scope)
- **Solo-founder velocity**: AI-augmented workflow, deep React/TUI expertise
- **Cross-border tax/legal sophistication**: Stripe Atlas history, Norway/CA/Canada residency map, prior C-Corp formation experience (EOI), prior holding-company structuring (Beowa BVI → Cdn ULC), Mama Muse LLC, AppAnnie/data.ai exit experience
- **PKM expertise**: gbrain self-validated; deep familiarity with Notion/Obsidian/Logseq landscape
- **Cap-table assets**: Stripe SPV $100K (Feb 2026 funded), AppAnnie historical equity, Mt. Gox bankruptcy claim, advisory positions

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
| **PKM-for-AI users** | Growing fast | Obsidian + AI plugins, Notion AI, Logseq. gbrain validates this is real. |
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

### D. Demand signals (real evidence, not just market intuition)

- 1M+ DL/wk for Ink-using AI CLIs (real demand for the architecture, capability-capped)
- 4,600+ pages in gbrain (founder-validated PKM-for-AI demand at personal scale)
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

### Where a solo founder can realistically play

- **L0, L1**: capital-prohibitive. Out.
- **L5**: too crowded, no specific wedge. Probably out.
- **L7**: consumer head-on (Cursor, Notion). Out.
- **L4** (silvery): open play; brand halo; **no direct revenue path** (cross-elasticity downside on L6 commercialization)
- **L6** workspaces: cross-elasticity trap when L4-below is open. **silvercode has the trap; km may not** (knowledge workers ≠ workspace builders)
- **L3** (agentroom): defined market; Confluent shape; **strong play if ACP wins**
- **L2** (services): high positive cross-elasticity; Vercel/Auth0/Algolia precedents; **strong play**

### The layer-aware strategic insight

silvery (L4) → silvercode (L6) is **where cross-elasticity bites hardest** because L4-framework-users *are* L6-workspace-builders. The same audience that adopts silvery is the audience equipped to build silvercode-equivalents themselves.

But silvery (L4) → services (L2) and agentroom (L3) → enterprise sales sit in layers where **cross-elasticity is positive** (services and protocol coordination are things users want to *avoid* doing).

**The same portfolio, played at different layers, has fundamentally different revenue dynamics.** This collapses the strategy menu:

- **L4 silvery** — open framework, brand halo. No direct revenue path. Accept that.
- **L3 agentroom** — open spec + paid hosted gateway (Confluent shape). Revenue play.
- **L2 services** — silvery-cloud / hosted services tier (auth, recall, ambient-safety, sync). Vercel pattern. Revenue play.
- **L6 km** — PKM-for-AI workspace, gbrain-validated. Less cross-elasticity exposure. Revenue play.
- **L6 silvercode** — open reference implementation that demonstrates L2/L3 services. Marketing/halo, not revenue.

Three commercial revenue streams, two open marketing assets, one protocol asset. Acquirer-friendly at multiple price points (L2 or L3 can be acquired independently of L6 km).

---

## Phase 2.6: Five strategic directions

Before getting into the 15+ specific strategy candidates in Phase 3, here are the five top-level directional buckets — most strategies fall into one or more of these:

- **Direction 1 — silvery + silvercode** (locked Option 5 today). Open framework + proprietary IDE + services backing it. Cross-elasticity trap exposure: high.
- **Direction 2 — km / PlainBrain as PKM-for-AI** (Notion-meets-Obsidian shape). gbrain-validated. Subscription workspace play. Cross-elasticity exposure: low (knowledge workers don't typically build their own PKM platforms).
- **Direction 3 — Services-led, silvercode is open reference** (Vercel/Auth0/Algolia pattern). silvery open framework + open silvercode-as-reference + paid hosted services tier. Cross-elasticity: positive (services are what users want to *avoid* doing).
- **Direction 4 — tribe/agentroom protocol play inside the portfolio**. tribe = open spec; agentroom hosted gateway = commercial cluster-2 service alongside silvercode + services.
- **Direction 5 — agentroom spun out as its own venture** (Confluent shape). Separate entity, separate raise, separate co-founder. Open spec + open ref impl + paid hosted control plane. Decoupled from silvery/silvercode/km success.

Directions 4 and 5 are both protocol plays — they differ on whether agentroom lives *inside* the silvery/silvercode/km portfolio or is *separated*. That's a real fork: D4 keeps capital, brand, and acquisition events together; D5 lets each part rise/fall on its own terms.

The strategies in Phase 3 below combine these directions with specific go-to-market approaches and sequencing.

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

Direction 2. silvery quietly maintained, no big launch. Focus: km + PlainBrain spec + gbrain-shaped tools. Notion/Obsidian-adjacent commercial play. Subscription billing for km-cloud.

**Score**: B=3 / T=12-18 / C=mid / R=3 / D=PKM-for-AI as a category sustains; km finds wedge against Notion/Obsidian

### S5 — "Confluent for AI agents" (agentroom spun out as own venture)

Direction 5. agentroom Inc as separate entity. Open ACP wire spec + open reference gateway + paid hosted control plane. Standalone fundraise ($3-5M seed). Infrastructure-ops co-founder.

**Score**: B=3 (own venture) / T=12-18 / C=high / R=4 / D=ACP standard wins, hosted gateway demand materializes, infrastructure-ops co-founder, Anthropic/Microsoft/etc don't ship competing protocol

### S6 — "Charm.sh for React" (multi-product OSS infrastructure suite)

silvery + termless + loggily + flexily + mdspec as a coherent "developer infrastructure suite for terminal apps" — Charm Industries' shape but for the React ecosystem. Premium support / hosted versions monetize across the suite.

**Score**: B=3 / T=18-24 / C=mid / R=3 / D=cross-product brand thesis works; the React-TUI-power-user audience is real

### S7 — "Mem.ai but local-first" (gbrain pattern productized)

PlainBrain + km + gbrain as a *local-first* personal-AI substrate. Markdown + git + LLM. Subscription for cloud sync only; the substrate is local-first. Counter-position to cloud-native PKM-AI tools.

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

Direction 2 + Direction 3 hybrid. km/PlainBrain as substrate, with both **hosted km cloud** (subscription, low-friction) and **self-hosted km** (open-source, run-your-own). Mirror Ghost (the publishing platform): hosted is the paid tier, but the open-source is a real alternative. Pulls from gbrain validation + Obsidian-style power-user community.

**Score**: B=4 / T=12-18 / C=mid-high / R=3 / D=PKM-for-AI as a category sustains; hosted-vs-self-hosted tier serves both segments; gbrain-style power users adopt

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
- **Path δ (PKM-first)**: S4 — defer silvery promotion, focus on km/PlainBrain/gbrain. Use gbrain as marketing testimonial. Faster to revenue if PKM market warmer than expected.
- **Path ε (multi-venture)**: S10 — agentroom spun out as own thing; silvery donated to foundation; silvercode + km as single bootstrapped product. Clean separation but high coordination overhead.
- **Path ζ (capital-first)**: S13 — raise first, run multiple paths with hired engineers.

---

## Phase 5: Recommendation

[TBD — emerges from Phase 3 + Phase 4 collaborative iteration]

Key open questions for Phase 5:

1. **Do we believe the cross-elasticity argument?** (Kimi: silvery's audience IS silvercode-equivalent builders) — if yes, S1 has a structural problem and we should push toward S2/S3
2. **Is gbrain enough validation for the PKM play, or is it just personal use?** — answers whether S4/S7 are real strategies or distractions
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
