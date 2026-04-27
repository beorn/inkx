# Coding agent business models — five shapes

_Internal research. Captured 2026-04-24. Companion to [`coding-agent-landscape.md`](./coding-agent-landscape.md) (which covers UI stack and architecture) and [`anomaly-company.md`](./anomaly-company.md) (which covers Anomaly/opencode in depth). Re-verify ARR, funding, and pricing before external use — this category re-prices itself every quarter._

## Why this doc exists

`coding-agent-landscape.md` answers "what does each agent look like?" — license, UI stack, models, extensibility. It is silent on the question that determines whether each project will be alive in 18 months: **how does it make money?** This doc fills that gap. It groups the field by business-model shape, attaches concrete numbers, and names the contested margins.

This matters for silvery + km positioning because the foundation labs are subsidizing the agent layer to drive API consumption. Anyone shipping an OSS or boutique agent has to plan around competitors whose marginal cost of customer acquisition is approximately zero.

## The five shapes

1. **Foundation-lab agents** — model maker ships the agent as a usage funnel for the API.
2. **Editor / IDE companies** — sell the IDE; route inference behind a margin.
3. **Autonomous-agent platforms** — sell agent compute (per-task / ACU billing), not seats.
4. **OSS-core + hosted-inference** — free, MIT, self-hostable; monetize the convenience layer ("SST playbook").
5. **OSS extension + enterprise** — OSS in the IDE, monetize team features and compliance; explicit "no markup on inference" pitch in the strongest version.

Each shape has different unit economics, different defensibility, and different exposure to a model-price war.

## Shape 1 — Foundation-lab agents (vertical, model-bundled)

The model maker ships the agent for free or near-free as a way to keep API consumption sticky.

### Players and numbers

| Agent | Vendor | Pricing surface | Revenue / signal |
|---|---|---|---|
| **Claude Code** | Anthropic | Bundled into Claude Pro $20 / Max $100–$200 / Team / Enterprise | ~$2.5B run-rate (early 2026); enterprise = >50% of CC revenue; ~$13/dev/active-day, $150–250/dev/month |
| **Codex CLI** | OpenAI | Bundled into ChatGPT Plus / Pro / Business | Not separately disclosed; lever to defend OpenAI API share against Anthropic |
| **Gemini CLI** | Google | Free, tied to AI Studio / Vertex consumption | Pure top-of-funnel; no agent revenue line |
| **Kimi CLI** | Moonshot | Free CLI + platform.kimi.ai inference | Same shape, China geography |

Anthropic context: $30B annualized revenue (March 2026), $30B raise at $380B valuation (Feb 2026). Claude Code grew from launch to $1B annualized in six months.

### Economics

- Model COGS internally is essentially "the model lab's marginal serving cost," which they'd pay anyway.
- The agent is a distribution channel for the API; retention is locked to the model.
- Switching cost is the agent's tool ecosystem (MCP, hooks, skills) plus accumulated session history.
- Defensibility: very high while the model lab leads on capability; brittle when a competitor model leapfrogs.

### Implication for everyone else

The bar for "free, good agent" is set by entities that don't need agent revenue. **An OSS or boutique agent cannot win a price war here.** Differentiation has to come from a dimension the foundation lab doesn't optimize for — multi-vendor, local-first, replay/audit, multi-agent supervision, knowledge-graph memory.

## Shape 2 — Editor / IDE companies

Sell the editor; route multi-vendor inference behind a per-seat or usage margin.

### Players and numbers

| Product | Company | Pricing | Revenue / valuation |
|---|---|---|---|
| **Cursor** | Anysphere | $20 Pro / $40 Business / custom Enterprise + usage overage | **$2B ARR by Feb 2026** (zero → $2B in ~3 years, fastest B2B SaaS ever). Forecast >$6B ARR EOY 2026. ~60% of revenue is enterprise. >half of Fortune 500 using it. |
| (Anysphere funding) | | | $2B raise in talks at $50B pre-money (April 2026). xAI reportedly holds a $60B acquisition right. |
| **Windsurf** | Codeium → Cognition | n/a (folded into Devin) | $82M ARR + 350 enterprise customers when acquired by Cognition for ~$250M (Dec 2025) after an OpenAI deal collapsed |
| **Zed** | Zed Industries | OSS editor + Zed Pro hosted-model subscription | Native Rust; collaborative multiplayer; smaller scale than Cursor |

### Economics

- Inference markup is the contested margin: Cursor pays Anthropic/OpenAI/Google wholesale, charges users a marked-up rate on top of the seat fee.
- Distribution moat = the IDE itself. Switching cost = muscle memory, settings, repo indexes, collab features.
- Foundation labs threaten this shape if they ever decide to ship a serious editor (they haven't — yet).

### Implication

Cursor's 25× ARR multiple ($50B / $2B) is the headline number that's pulling every adjacent valuation up. Cognition's 125× post-merger multiple is the more aggressive read. Either way, the editor-companies shape is currently seen as the highest-value packaging of an agent.

## Shape 3 — Autonomous-agent platforms (per-task / ACU billing)

Sell agent compute, not seats. The agent runs in a sandbox/VM, opens PRs, executes long-horizon tasks.

### Players and numbers

| Product | Company | Pricing | Notes |
|---|---|---|---|
| **Devin** | Cognition | $20 Core / $500 Team / custom Enterprise. Bills "Agent Compute Units" (VM time + inference + bandwidth) | Devin 2.0 (April 2025) cut entry from $500 → $20/mo. Cognition $10.2B valuation Sept 2025 post-Windsurf. Combined enterprise ARR up >30% post-merger |
| **OpenHands** | All Hands AI | OSS + hosted runtime | $5M seed (2024); Princeton/UIUC/CMU SWE-agent academic lineage |
| **Jules** | Google | Free, GitHub-integrated, async | Funnel play; Google's answer to Devin |

### Economics

- ACUs let the platform keep margin on both VM time and inference — the unit economics are denser than per-seat SaaS.
- Long-horizon autonomy (open a PR, wait, react to CI) is hard to replicate locally — defensibility is in the runtime infrastructure, not the model.
- Risk: if foundation labs add cloud-hosted "agent teams" with PR integration (Anthropic's experimental agent teams already point this way), the autonomous-platform moat compresses.

### Implication

The Devin pricing reset (500 → 20) is a tell: autonomous-agent platforms can't sustain premium pricing once foundation labs add comparable capability for free. Cognition's response was to acquire Windsurf and become an editor-and-platform play.

## Shape 4 — OSS-core + hosted-inference ("SST playbook")

Free, MIT-licensed, fully self-hostable agent. Monetize the convenience layer (managed inference, hosted state, team features) without paywalling the core.

### Players and numbers

| Agent | Company | OSS license | Revenue model | Signal |
|---|---|---|---|---|
| **opencode** | Anomaly (ex-SST) | MIT | opencode Zen hosted inference | "Several million USD ARR" reported 2025. 650k MAU within 5 months of June 2025 launch. Profitable on $1.12M YC seed (S21). Cloudflare among customers. |
| **aider** | Paul Gauthier (solo) | Apache 2.0 | None | Pure community + benchmarks. Release cadence slowed materially since Aug 2025 |
| **goose** | Block (Jack Dorsey's co.) | OSS | None (internal-tool-released) | Block's bet, not a revenue line |
| **pi-mono** | Earendil (Mario Zechner) | MIT | None | Publishes session datasets to HuggingFace as a side asset |

### Economics

- Hosted-inference margin is real but fragile: model prices drop, providers tighten TOS, the convenience-layer margin compresses.
- Defensibility = community + brand, not technology. Anomaly's SST community DNA + Dax Raad as figurehead is a meaningful moat in JS-devtools land.
- Cost discipline matters: this shape only works with a small team. Anomaly's ~10 people (per `anomaly-company.md`) is the model.

### Implication

This is the playbook a silvery-native agent host (or an Agent Workspace ship) would most naturally adopt: ship OSS core, charge for the hosted convenience layer (managed sessions, replay storage, team coordination), let enterprise pull on hosted organically. Anomaly proves the shape is viable in 2026.

## Shape 5 — OSS extension + enterprise / "no markup on inference"

OSS extension in the IDE, free for individuals; enterprise tier monetizes team features (SSO, SCIM, audit, VPC, SLA). The strongest version makes a virtue of taking **zero margin on inference** — users pay the model providers directly.

### Players and numbers

| Agent | Company | Free / Pro / Enterprise | Funding / revenue |
|---|---|---|---|
| **Cline** | Cline | Free for individuals; Teams $20/seat/mo (free through Q1 2026; first 10 seats permanently free); Enterprise custom (SSO, SCIM, VPC, audit, SLA) | $32M Series A + seed. 2.7M installs. SAP, Samsung cited. Explicit "no markup on inference" pitch |
| **Continue** | Continue, Inc. | Solo $10/seat/mo entry; Team / Enterprise (SSO + on-prem data plane) | $5.6M total raised (YC + Heavybit). $1.4M revenue with 9 people in 2024. ~19 people now |
| **Sourcegraph Amp** (formerly Cody) | Sourcegraph | **Free + Pro killed July 2025**; Enterprise-only at $59/user/mo (Sourcegraph), Amp-specific contact-sales | Riding existing Sourcegraph enterprise relationships; pivoted hard from self-serve to enterprise-only |
| **GitHub Copilot** | Microsoft | Individual $10 / Business $19 / Enterprise $39 per seat | 4.7M paid subs (Jan 2026), ~75% YoY growth. ARR estimates $450M–$1B+. ~42% market share among paid AI-coding tools. ~90% of Fortune 100 |

### Economics

- "No markup on inference" is the cleanest enterprise pitch — separates platform fees from inference costs, makes both lines auditable.
- Enterprise tier carries the entire revenue load. Free + individual-Pro are loss leaders or breakeven.
- Defensibility = compliance/integration depth, not model access. SSO + SCIM + audit + VPC is the real product for this shape.
- Risk: Copilot's distribution moat (ships with GitHub) is unbeatable at the long tail; this shape only works for vendors who can sell into security/procurement teams that explicitly don't want Microsoft.

### Implication

Sourcegraph's pivot is the cautionary tale: even a well-funded incumbent can't sustain a self-serve Pro tier in this category. Enterprise-only is where the money is, and getting there requires either (a) an existing enterprise account base (Sourcegraph) or (b) a credible compliance story funded by VC (Cline, Continue).

## Subscription-vs-API — the 2026 split

A structural change in 2026 that affects every shape above: **foundation labs have locked subscription quota to their own first-party clients.**

### Anthropic timeline

- **2025-08-28**: Weekly rate limits introduced for Claude Pro / Max to curb 24/7 background loops and account sharing.
- **2026-01-09**: Server-side enforcement blocks subscription OAuth tokens in third-party tools. opencode, Roo Code, Cline, aider, goose, OpenClaw all break overnight. Error message: _"This credential is only authorized for use with Claude Code and cannot be used for other API requests."_
- **2026-02-19**: ToS clarified. Official clause: "OAuth tokens from Free, Pro, and Max plans may not be used with third-party tools or the Agent SDK."
- **2026-04-04**: Full cutoff for **header-replay** style integrations. Subscriptions no longer cover OAuth tokens used outside the official Claude Code binary.
- **2026-04-10**: Anthropic temporarily suspended OpenClaw creator Peter Steinberger's account for "suspicious activity"; reinstated within hours after his X post went viral.
- **~2026-04-11+ (informal)**: Boris Cherny (Anthropic Claude Code lead) said publicly on X that **CLI-style usage is allowed** — spawning the official `claude` binary as a subprocess (including `claude -p` headless mode) is sanctioned. OpenClaw updated its docs to treat Claude CLI reuse as approved. **No formal blog post or ToS update.** OAuth header replay (using subscription tokens directly against the API from a custom client) remains blocked.

Tokens are **scoped with caller verification** — Anthropic checks the caller is the real Claude Code client, not a harness replaying its headers. Header replay was the 2024–2025 trick; it's dead. **Spawning the official binary as a subprocess is the green-lit alternative** but the policy boundary is informal — no written guarantee, could shift again.

### OpenAI timeline

- **2026-04-02**: Codex pricing moved from per-message to **API-token billing** on Plus / Pro / Business / new Enterprise plans.
- **2026-04-23**: Extended to all existing Enterprise tiers (Edu / Health / Gov / Teachers).

Codex CLI + app + IDE extension still work on ChatGPT login, but they're metered in API tokens against a subscription budget. Third-party tools that impersonated the ChatGPT web client are similarly affected.

### Who still takes subscription auth

**Nobody outside the first-party tools.** As of April 2026:

- **Anthropic-blessed subscription clients**: `claude` CLI (including `--bare -p --output-format stream-json` headless mode), Claude Code VS Code extension (which is the same product, different surface), Claude Code JetBrains extension. Skills, Hooks, MCP servers — all load inside the official client and ride the subscription.
- **OpenAI-blessed subscription clients**: `codex` CLI, Codex app, Codex IDE extensions.
- **Every third-party tool** — Cline, Continue, aider, Roo Code (shutting down May 15, 2026), Kilo Code (Roo fork, GA April 2 on opencode server), goose, opencode, pi, pi-mono, OpenClaw, NanoClaw — is now **BYO-API-key**. Typical cost for heavy users on Sonnet 4.6: $50–$200/month in API tokens.

### Impact on the five business-model shapes

- **Shape 1 (foundation-lab agents)** — reinforced. Subscription lock-in is now a technical moat, not just a UX one.
- **Shape 2 (editor companies)** — unaffected. Cursor, Windsurf/Devin, Zed all route their own backend inference; they don't care about Anthropic's OAuth rules.
- **Shape 3 (autonomous-agent platforms)** — unaffected for same reason.
- **Shape 4 (OSS-core + hosted-inference)** — dented. opencode Zen still works (it routes inference through Anomaly's backend), but the "use your own Anthropic subscription with opencode" onboarding path is dead. This removes the cheapest trial path and forces new users into either Zen or BYO-key.
- **Shape 5 (OSS extension + enterprise)** — significantly affected. Cline's "no markup on inference, you pay providers directly" pitch now means users must buy an Anthropic API key. The subscription-piggyback that powered early adoption (2024–2025) is gone.

### Implication for silvery / Agent Workspace

The subscription-vs-API fork is the most important new constraint in the space and directly reshapes Track 1 vs Track 2 thinking for Agent Workspace. See `hub/silvercode/future/ai-terminal/00-agent-workspace.md` for the current architectural response.

## Patterns worth naming

### 1. The foundation labs are subsidizing

Claude Code at ~$2.5B and Codex bundled-into-ChatGPT mean the bar for "free, good agent" is set by entities that don't need agent revenue — they need API consumption. **OSS agents can't lose a price war here.** Pick a dimension the foundation lab doesn't optimize for, or ride a different shape (editor, platform, enterprise compliance).

### 2. Inference markup is the contested margin

Three distinct postures:

- **Cursor takes it** — wholesale → markup → seat-fee + usage overage.
- **opencode Zen takes it optionally** — free if you BYO key, marked up if you use Zen.
- **Cline explicitly refuses to take it** — users pay providers directly, Cline only charges platform fees.

Anomaly's "several million ARR on a YC seed" suggests the convenience-layer-on-top-of-OSS works. Cline's $32M raise on the opposite thesis says investors think both shapes have room. Worth picking a side consciously rather than drifting.

### 3. Per-seat pricing is collapsing toward $20

Cline Teams, Devin Core, Cursor Pro, Continue Solo all hover around $10–$20/seat. Enterprise tier is where the real numbers live:

- Sourcegraph Amp $59/seat
- Cursor Enterprise custom (likely $40+ + usage)
- Anthropic Claude Code effective $150–$250/dev/month

The implication: don't anchor on the headline self-serve price. The business model lives in the enterprise tier.

### 4. Acquisition math is off the chart

- Cursor: $50B pre-money on $2B ARR = **25× ARR**.
- Cognition: $10.2B on Windsurf's $82M ARR = **~125× combined** (post-Windsurf).
- Anthropic: $380B post-money on $30B annualized revenue = **~13× ARR** (foundation-lab discount because COGS is real).

Foundation-lab agents are the existential threat that's pulling editor-company multiples up. The market is pricing in that someone wins this category outright.

### 5. The novelty window is shrinking

Per `pro-review-2026-04-24.md` (in `hub/silvercode/future/ai-terminal/`): Anthropic now ships subagents, agent teams, checkpointing, hooks, statusline JSON. Codex now ships CLI + app + server + SDK + MCP server + cloud tasks. Warp ships local + cloud agents with a split modality. cmux launched Feb 2026 with multi-agent positioning + socket API.

The "supervise multiple agent sessions" wedge — which is the Agent Workspace MVP thesis (`hub/silvercode/future/ai-terminal/00-agent-workspace.md`) — is being attacked from the foundation-lab side and from the multiplexer side simultaneously. If we ship, we ship in 2026; if we wait until 2027, the wedge is gone.

## Implications for silvery / km / Agent Workspace

1. **Agent Workspace's natural model is Shape 4 (SST playbook).** OSS core + hosted convenience layer (managed sessions, replay storage, cross-machine handoff). Anomaly proves the model works for ~10-person teams.
2. **Don't compete with Claude Code on price.** Compete on dimensions Anthropic doesn't optimize for: multi-vendor (Claude + Codex + opencode in one workspace), local-first, replay/audit, knowledge-graph memory (km).
3. **The "no markup on inference" pitch (Cline) is also available** if we want to monetize team features instead of inference. This is more enterprise-friendly but requires SSO/SCIM/VPC plumbing as table stakes.
4. **Editor-company shape is closed.** Too late to start a Cursor-shaped IDE in 2026. Don't try.
5. **Autonomous-agent platform shape is contested.** Devin's price reset is a warning; foundation labs are encroaching from above. Don't try unless we have a unique runtime story.
6. **Watch the Anomaly trajectory specifically.** They're the closest analog to where a silvery-native agent host could land: small team, OSS-first, profitable, hosted-convenience monetization. Their misses become our opportunities; their wins compress our window.

## Sources

### Cursor / Anysphere
- [Cursor's Anysphere nabs $9.9B valuation, soars past $500M ARR (TechCrunch, June 2025)](https://techcrunch.com/2025/06/05/cursors-anysphere-nabs-9-9b-valuation-soars-past-500m-arr/)
- [Cursor in talks to raise $2B at $50B valuation after hitting $2B ARR in three years (TheNextWeb, April 2026)](https://thenextweb.com/news/cursor-anysphere-2-billion-funding-50-billion-valuation-ai-coding)
- [Cursor AI Valuation Hits $60B (Tech Insider, April 2026)](https://tech-insider.org/cursor-60-billion-valuation-anysphere-ai-coding-2026/)

### Anthropic / Claude Code
- [Anthropic raises $30 billion at $380 billion valuation (Anthropic, Feb 2026)](https://www.anthropic.com/news/anthropic-raises-30-billion-series-g-funding-380-billion-post-money-valuation)
- [Anthropic Claude Code Valuation 2026 (Orbilon Tech)](https://orbilontech.com/anthropic-claude-code-valuation-2026/)

### Cognition / Devin / Windsurf
- [Cognition's acquisition of Windsurf (Cognition blog)](https://cognition.ai/blog/windsurf)
- [Cognition valued at $10.2 billion two months after Windsurf purchase (CNBC, Sept 2025)](https://www.cnbc.com/2025/09/08/cognition-valued-at-10point2-billion-two-months-after-windsurf-.html)
- [Devin Pricing](https://devin.ai/pricing/)
- [Devin 2.0: Cognition slashes price to $20/month from $500 (VentureBeat, April 2025)](https://venturebeat.com/programming-development/devin-2-0-is-here-cognition-slashes-price-of-ai-software-engineer-to-20-per-month-from-500)

### Cline
- [Cline Pricing](https://cline.bot/pricing)
- [Cline Raises $32M Building the Open-source AI Coding Agent (Cline blog)](https://cline.bot/blog/cline-raises-32m-series-a-and-seed-funding-building-the-open-source-ai-coding-agent-that-enterprises-trust)

### Continue
- [Continue Pricing](https://www.continue.dev/pricing)
- [Continue raises $3M for open-source AI coding assistants (LinkedIn)](https://www.linkedin.com/posts/y-combinator_continue-has-raised-3m-in-new-seed-funding-activity-7302432600483147776-RmhZ)
- [How Continue hit $1.4M revenue with a 9 person team in 2024 (Latka)](https://getlatka.com/companies/continue.dev/funding)

### Sourcegraph Amp / Cody
- [Sourcegraph Pricing](https://sourcegraph.com/pricing)
- [Changes to Cody Free, Pro, and Enterprise Starter plans (Sourcegraph blog, June 2025)](https://sourcegraph.com/blog/changes-to-cody-free-pro-and-enterprise-starter-plans)

### GitHub Copilot
- [GitHub Copilot Statistics 2026 (Panto AI)](https://www.getpanto.ai/blog/github-copilot-statistics)
- [Microsoft Copilot Revenue and Usage Statistics (Business of Apps)](https://www.businessofapps.com/data/microsoft-copilot-statistics/)

### Anomaly / opencode
- See [`anomaly-company.md`](./anomaly-company.md) for the full source list (TFN, Dev Genius, Technori, Crunchbase, ICUBE UTM, etc.).
