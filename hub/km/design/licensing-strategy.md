# Licensing strategy — across the full stack

**Status**: Option 5 locked (open silvery Apache + CLA; voice softened; corporate structure slots into existing PLEP plan). Last revised 2026-04-28.

**Audience**: Bjørn (decision-owner), future contributors, anyone evaluating the licensing posture of any package in the portfolio.

**Scope**: license + commercial-posture decision per layer (silvery / tribe / km / silvercode / agentroom / PlainBrain) and per package (~62 packages). Sits below [`integrated-workdesk.md`](integrated-workdesk.md) and references the moats identified in [`silvercode-squad-mode.md`](../../silvercode/future/ai-terminal/silvercode-squad-mode.md).

---

## TL;DR — the plan

**Decision**: open silvery at **Apache-2.0 + CLA**. silvercode + km stay proprietary. tribe = open wire/spec (Apache + CC BY 4.0) + proprietary hosted gateway. PlainBrain (the markdown-filesystem shape km uses, elevated to a named portable standard) follows the same shape — open spec, open reference impl, paid services + canonical commercial app.

**Voice**: silvery's existing identity ("React for modern terminal apps. Powerful apps. Polished UIs.") stays the lead; Ink compatibility surfaces as a capability, not the wedge headline. Don't read as hostile to Ink/Vadim; succeed by being good, not by attacking.

**Verified claims that stay on the page**: 98.6% Ink compatible (silvery/ink shipped at v0.21, ~3K LOC), 3-27× faster than Ink in mounted rerenders, 1.5-5.5× faster than Yoga via flexily, ~22× faster than noop loggers via loggily. Battle-tested and visible on silvery.dev today.

---

## The three open-standard plays (the structural spine)

The portfolio decomposes into three parallel "open-standard + proprietary canonical implementation + paid services" plays — the same shape Docker, MongoDB, Confluent use:

| Open standard | Canonical implementation | Paid services tier |
|---|---|---|
| **silvery** (React TUI framework) | silvercode (integrated agentic IDE) | recall-hosted, ambient-context-safety, subscription-auth |
| **tribe** (coordination wire + event vocab) | agentroom hosted gateway | multi-machine routing, hosted Matrix bridge, CrossAgentState orchestration |
| **PlainBrain** (agentic-work repo format spec) | km (canonical workspace) | multi-device sync, recall index, team features, AI ops |

**Docker analogy** — and cautionary tale: open spec → eventually OCI standard; open engine → moby/containerd; paid commercial UX → Docker Desktop + Hub. When the spec became infrastructure, value flowed *away* from Docker Inc. into k8s/containerd. Docker survived by pivoting to Docker Desktop UX + data-gravity moat. **Our moat must be the canonical-best-implementation + cloud services + brand**, not spec ownership alone.

**Why three standards reinforce**: silvery captures AI-tool install base; tribe captures the coordination wire; PlainBrain captures the agentic-work substrate. Each brings traffic to the others; together they form a coherent platform story for fundraising / acquisition.

**Sequencing — don't launch all three at once**:
- Month 0-2: silvery promo (the locked plan)
- Month 1-3: tribe wire v0 preview alongside silvery launch ("unstable draft")
- Month 3-6: PlainBrain spec v0 preview after silvery has measurable traction

---

## The proprietary product line (cluster 2)

The commercial side of the portfolio. Three product surfaces and a hosted-services tier; together they monetize the open standards above.

### 1. silvercode — the integrated agentic coding IDE

Cursor analog for the terminal. The flagship commercial product built on silvery + tribe + PlainBrain. Subscription billing (planned).

**The silvercode-specific application assembly** (proprietary; lives in silvercode private monorepo):
- Multi-pane coding host (specific 2×2 layout, keybindings, session orchestration)
- File-claim visualization (specific UX showing which agent owns which file)
- Ambient-channel composition (AMBIENT vs ROOM channel split)
- Two-region composer (message input + tool palette)
- Cross-agent state visualization (distributed state visible to operator)
- The integrated agent-coding loop UX
- silvercode-internal silvery extensions (NOT shipped as separate `@silvery/*` packages)

**Validated near-term wedge**: squad mode — multi-pane parallel-agent execution with CrossAgentState. See [`silvercode-squad-mode.md`](../../silvercode/future/ai-terminal/silvercode-squad-mode.md).

**Entity path**: future Delaware C-Corp issued to Wyoming HoldCo at PMF / investment trigger (PLEP Phase 2, 2027-2028). 83(b) within 30 days. Founder shares post-July-2025 for QSBS new tier (50/75/100% at 3/4/5 years).

### 2. km / Knowledge Machine — agentic knowledge workspace

Notion/Linear analog for agents+humans. The canonical commercial implementation of PlainBrain. Subscription billing (planned).

**km-specific application assembly** (proprietary; lives in km private monorepo):
- Board / cards / kanban UI for KNodes
- Calendar surface, daily journal
- Agent personas, persona working memory, durable plans
- Beads (issue tracker) + recall (FTS5 + LLM retrieval) integration
- com/rooms / com/chats projection from tribe events
- Bidirectional markdown ↔ SQLite ↔ board sync
- The integrated agentic-knowledge-work UX

**Architecture**: km is the canonical PlainBrain client + the canonical agentroom client. PlainBrain spec is open (any tool can implement); km is the reference implementation we sell.

**Entity path**: either folds into the planned Kimmi C-Corp (already in PLEP Phase 2 plan; conceptually adjacent to km) or forms its own Delaware C-Corp. **Decision needed.** Same QSBS / PLEP timing as silvercode.

### 3. agentroom hosted gateway — ACP↔Matrix bridge with managed cloud

The canonical commercial implementation of the tribe wire. Top-scoring venture (24/25). Confluent-Cloud / MongoDB-Atlas pattern.

**Open** (Apache + CC BY 4.0): the wire spec, event vocabulary, conformance test suite, "tribe-compatible" badge program, reference implementation in repo.

**Proprietary**: the production-hosted gateway with multi-machine routing, hosted Matrix bridge, CrossAgentState orchestration, multi-tenant coordination, SLAs, audit trails, regional data residency, enterprise SKUs.

**Status**: planned, not built. Likely Phase 2-3 (2027-2028) or spun out as separate venture.

### 4. Hosted services tier (the SDK-with-services backend)

Backs the polished generic agent components silvery ships open. Component code is open + free; operating the component requires a paid service subscription.

- **subscription-auth gateway** — SSO/SAML, OAuth flows, secret vault, token-bearing credentials, audit. Backs `<AgentSession>`.
- **ambient-context-safety pipeline** — LLM context filtering, prompt-injection guards, safety classifiers, redaction. Backs `<ContextSafetyMonitor>`.
- **recall-hosted** — vector index + LLM retrieval over a user's PlainBrain repo. Backs `<RecallPanel>`.
- **multi-device sync** — CRDT reconciliation across machines for PlainBrain repos. Backs km's multi-device features.
- **CrossAgentState orchestration** — atomic updates, conflict resolution, multi-process coordination. Backs `<SquadView>`, `<HandoffViz>`.
- **PlainBrain cloud** — hosted PlainBrain backing services (recall, sync, team features, AI ops).
- **silvery-cloud** — single backplane that exposes all of the above to silvery components. The `<AgentSession>`/etc. components hit silvery-cloud; silvery-cloud routes to the relevant service.
- **termless-cloud** — hosted termless matrix (tests against real terminal emulators in cloud). Backs `<TermlessRunner>`. Commercial wedge if 3+ design partners commit.
- **terminfo-verified** — verified-data enterprise tier on top of terminfo.dev's open data. Backs `<TerminfoVerify>`.

**Pricing**: per-seat / per-organization for silvercode + km consumers; usage-based or tier-based for direct-API consumers (third-party apps that integrate silvery components and need our backend).

**Entity path**: hosted services revenue flows through the relevant Growth C-Corp (silvercode Inc / Knowledge Machine Inc) at PLEP Phase 2; pre-Phase-2 revenue goes through personal Schedule C and is assigned to the C-Corp at formation.

### 5. Internal infrastructure (proprietary, not customer-facing)

Tools we use to build the products but don't ship.

- **claude-tty-mcp** — MCP server for terminal automation in development
- **@beorn/{accountly, tap, watcher-chaos}** — internal infra packages
- **bearly tooling internals** — tribe daemon, recall, hooks, llm CLI orchestration

These are private not because they're commercially valuable, but because they're internal. Could be open-sourced selectively if external interest emerges.

### tribe-internal extensions — proprietary tail of an open protocol

The wire format + event vocab are open (Apache + CC BY 4.0). The **silvercode/km-specific** event types (e.g. `m.silvercode.squad.claim`, `m.km.bead.progress`, persona/lease semantics tied to our products) live in silvercode/km private monorepos. Never shipped as separate `@tribe/*` packages.

Anyone implementing the open tribe wire can add their own product-specific event types under their own namespace. We just keep ours private.

### Commercial products map

```
PUBLIC USERS
     ↓
┌────────────────────────┐
│ silvercode (IDE)       │ ← subscription
│ km (workspace)         │ ← subscription
└────────┬───────────────┘
         ↓ (consume)
┌────────────────────────────────────────────┐
│ Hosted services tier (silvery-cloud)        │
│ ─ subscription-auth                         │
│ ─ ambient-context-safety                    │
│ ─ recall-hosted                             │
│ ─ multi-device sync                         │
│ ─ CrossAgentState orchestration             │
│ ─ PlainBrain cloud                          │
│ ─ termless-cloud                            │
│ ─ terminfo-verified                         │
└────────┬───────────────────────────────────┘
         ↓ (also consumed by)
┌────────────────────────────────────────────┐
│ Third-party apps integrating silvery        │
│ open components (BYO key + paid backend)    │
└────────────────────────────────────────────┘

OPEN INFRA (cluster 1) provides the client glue all of the above use:
silvery + tribe wire + PlainBrain spec + flexily + termless +
loggily + mdspec + emulators + alien-* + minor satellites
```

---

## Per-layer license matrix (final)

- **silvery** → **Apache-2.0 + CLA**. Open. Includes silvery/ink + silvery/chalk shim (already shipped). CLA preserves relicensing optionality.
- **silvercode (app code + cloud services)** → **proprietary**, private monorepo. The actual revenue-generating product.
- **silvercode-internal silvery extensions** → live in silvercode private monorepo, not as separate `@silvery/*` packages.
- **km** → **fully proprietary**. Notion/Linear pattern. PlainBrain export for portability.
- **tribe** → **Apache-2.0** wire + **CC BY 4.0** event-vocabulary spec. Conformance tests + "tribe-compatible" badge program. Internal extensions stay in silvercode private monorepo.
- **PlainBrain** → **Apache-2.0** code + **CC BY 4.0** spec. Reference implementation in `km`. Domains: plainbrain.org, plainbrains.com.
- **agentroom gateway** → **Apache-2.0 reference impl + CC BY 4.0 spec + paid hosted gateway**. Confluent-Cloud / MongoDB-Atlas pattern.
- **flexily** → **Apache-2.0**. Strategic to silvery's multi-target.
- **termless ecosystem** → **Apache-2.0**. Cluster-1 cross-promo.
- **terminfo.dev** → **Apache-2.0** code + **CC0** data (verify upstream ncurses provenance before relicensing dataset).
- **vt100.js / vt220.js / vterm.js** → **Apache-2.0**. Zero-maintenance, support termless backends.
- **loggily** → **Apache-2.0**. Low-touch maintenance.
- **mdspec** → **Apache-2.0**. At `mdspec.org`, executable markdown testing, pre-release 0.x. (NOT mdspec.dev — that's an unrelated SaaS.)
- **alien-projections / alien-resources / alien-trees** → Apache-2.0 at `github.com/beorn/bearly/packages/`.
- **vimonkey, vitepress-enrich** → Apache-2.0; maintenance mode or donate.
- **@silvery deprecated subpackages** → fold into silvery barrel.
- **Private @beorn/* + claude-tty-mcp** → proprietary.

**Cluster brands**:
- *Cluster 1 (open, Apache + CLA)*: silvery + flexily + termless + terminfo + loggily + mdspec + emulators + alien-* + minor satellites. Brand voice: rigorous, performance-conscious, terminal-native, multi-target.
- *Cluster 2 (proprietary)*: silvercode + km + tribe-internal + hosted services. Brand voice: polished agentic-knowledge-work product line.

---

## The Seam Rule (v4 — codify in silvery's repo before contributors arrive)

The cut is **generic-component vs application-assembly**, not "polished vs unpolished." Both silvery and silvercode have polish; the difference is component-shape vs application-shape.

**Open in silvery** (polished generic agent components — what every AI-tool builder wants):
- All silvery framework primitives (`Box`, `Text`, `ListView`, `SelectList`, `TextInput`, `VirtualList`, `Tabs`, `Tree`, etc.)
- Agent-domain hooks (`useAgentSession`, `useStreamingMessage`, `useToolUse`, `useRecall`, `useSquad`, `useHandoff`, `useContextSafety`)
- Polished, opinionated, generic agent components (`<AgentChat>`, `<ToolUseRenderer>`, `<StreamingMessage>`, `<ConversationPane>`, `<RecallPanel>`, `<SquadView>`, `<HandoffViz>`, `<ContextSafetyMonitor>`) with sensible defaults, BYO API key out of the box
- All rendering / interaction / state / theme / focus / mouse / layout machinery

**Proprietary in silvercode** (the silvercode-shaped application assembly):
- The multi-pane coding host (specific 2×2 layout, keybindings, session orchestration)
- File-claim visualization, ambient-channel composition, two-region composer
- Cross-agent state visualization
- The integrated agent-coding loop UX — the Cursor analog

**Proprietary in cluster-2 services**:
- Auth flows, secret management, cloud state, network protocols
- Ambient-context-safety pipeline logic, hosted recall index, CrossAgentState orchestration, agentroom gateway runtime, multi-machine coordination

**Tiebreaker test**: *is it component-shape (any AI tool would want it, polished defaults) or application-shape (embeds silvercode's particular product choices)?* Component-shape → silvery. Application-shape → silvercode.

**Traffic-light rubric** for ambiguous cases:
- *Green (always silvery)*: rendering, layout, input, local state, theming, streaming components, polished generic agent components.
- *Yellow (silvery + service-backed adapter)*: recall viz, context monitors, transcripts. Pluggable interface in silvery; ship local-only adapter (open) AND silvercode-cloud adapter (proprietary).
- *Red (always cluster-2)*: secrets / auth / token-bearing flows; multi-tenant or multi-user state; managed tool execution with sandboxing/audit; orchestration across machines/sessions; durable storage and indexing; compliance.

**Tiebreaker dimensions**: multi-user / multi-device → service. Needs durability, audit, or compliance → service. Requires secrets or server-side credentials → service. Single-user, ephemeral, UI-only → glue.

**Why not Vercel-shaped (hooks-only)**: Vercel AI SDK is a hooks library; silvery is a UI framework. Stripping polished components from silvery defeats silvery's brand promise ("Polished UIs") and the migration thesis (Ink users want polished components, not just hooks).

**Cursor analog**: Cursor's moat isn't "we own autocomplete widgets" — it's the integration + the specific shape of Cursor as a product. Same here. If a competitor uses silvery's `<AgentChat>` to build a different agent IDE, silvercode doesn't lose because silvercode IS its specific integrated assembly + cluster-2 services + brand.

Add a "Scope and Boundaries" doc to silvery's repo. Add a GitHub issue label "Out of scope (silvercode-specific application assembly)" with polite boilerplate.

---

## Revenue architecture: SDK-with-services

silvery is fully open. silvery includes SDK-shaped components anyone can integrate freely — but those components are architecturally coupled to talk to **our** paid cloud services. Component code is open (drives adoption); operating the component requires our service (drives revenue).

This is the **API economy / Stripe Elements / Mapbox GL / Twilio SDK / Algolia InstantSearch / Sentry SDK pattern** applied to TUI components. Multi-billion-dollar precedent.

Components that follow this pattern: `<AgentSession>` (subscription-auth gateway + ambient-context-safety service), `<RecallPanel>` (vector index + LLM retrieval), `<TribeRoom>` (hosted agentroom gateway), `<SquadView>` (cross-pane coordination state), `<ContextSafety>` (safety guardrails server-side), `<TermlessRunner>` (hosted terminal matrix), `<TerminfoVerify>` (verified-data tier).

**Customer choice cascade**:
- *"I want to migrate from Ink"* → use silvery (free framework)
- *"I want polished agent components in my own app"* → integrate (free), pay for backend service
- *"I want the polished all-in-one coding product"* → buy silvercode subscription
- *"I want the agentic knowledge workspace"* → buy km subscription

The moat moves from framework code (which leaks) to operational services (which don't). Component code is API-client glue; reproducing it doesn't get the operational service.

---

## Corporate structure — slot into existing family-office PLEP plan

**Founder residency (load-bearing)**: US/California as of 2025-01-25 (Canadian departure return same date). Not Norway-resident despite Sparebank1 + Norwegian citizenship.

**Use the existing planned Wyoming HoldCo, NOT a new vehicle.** Documented at `~vault/areas/@office/CHARTER.md` and `~vault/areas/@office/Entities/HoldCo.md`. The PLEP/MEES architecture is already designed:

```
INDIVIDUALS (Bjorn + Delei, 50/50)
            ↓
CONTROL LAYER (Q1 2026 formation)
   Wyoming HoldCo LLC ($60/yr; multi-member required for QSBS pass-through)
            ↓
  ┌─────────┼─────────┐
  ↓         ↓         ↓
OPERATING  GROWTH    INVESTMENT
LLCs       C-Corps   accounts
(Mama      (Kimmi,   (personal,
 Muse)     silvercode-future,  future Investment LLC)
           km-future)
```

**Key constraints**:
- **Multi-member 50/50 Bjorn + Delei** — required for QSBS pass-through (2× $15M = $30M tax-free at 5+ year hold). Both must be members BEFORE HoldCo acquires C-Corp shares.
- **HoldCo cannot generate active income** (SE-tax trap). Migration help / pre-C-Corp silvercode subscriptions go through Operating LLCs, future C-Corps, or personal Schedule C — not HoldCo directly.
- **Defer CA foreign-reg until CA-source income** — saves $800/yr franchise tax until Phase 3 (2028-2030).
- **Wyoming, not Delaware** — $60 vs $300/yr; explicitly chosen in CHARTER for "better for holding."
- **83(b) election within 30 days** of any C-Corp founder share issuance.
- **Founder shares post-July-2025** for new tiered QSBS exclusion (50/75/100% at 3/4/5 years).

**The silvery portfolio slots in**:
- *silvery + tribe + PlainBrain* (open-standard IP + trademarks + domains for silvery.dev / plainbrain.org / knowledgemachine.co etc.) → owned by Wyoming HoldCo (passive holding allowed).
- *silvercode* → future Delaware C-Corp issued to HoldCo at PMF/investment trigger (PLEP Phase 2, 2027-2028).
- *km / Knowledge Machine* → either folds into the planned Kimmi C-Corp or forms its own C-Corp (decision needed, since km/Kimmi are conceptually adjacent and Kimmi is already in the PLEP plan).
- *Migration help (this year, pre-C-Corp)* → personal Schedule C; assign to silvercode C-Corp at Phase 2.

**HoldCo name**: TBD per Formation Checklist. Family-office-shape (e.g., *Stabell Holdings LLC*), NOT product-themed (silvery / silver-anything is wrong because HoldCo also holds Mama Muse, Kimmi, future investments).

**For VC concerns about 50/50 spousal LLC**: standard solved by **Operating Agreement designating Bjorn as Managing Member with sole voting authority over portfolio C-Corp shares**. Delei retains 50% economic interest, no veto on operating decisions. Industry-standard for spousal HoldCos; competent corp counsel handles in 30 minutes.

**Advisors**:
- *First*: Jose Chu (existing US tax CPA) — confirm SMLLC vs partnership treatment, CA Form 568 mechanics, IP-contribution structure. ~2-3 hours, $600-900.
- *Defer*: Cooley / Wilson Sonsini-class corporate counsel until first spin-out is imminent (~$15-25K).
- *Not needed*: Norwegian or Canadian tax advisors for go-forward structure. Italo Voso continues only on Canadian wind-down (T1 + BeoULC).

---

## Critical-path execution plan

Sequenced; corrected by /pro v2 — order-of-operations matters. Quiet launch first; loud launch after proof in hand.

### Week 0-1 (start now, no demo dependency)

1. **silvery.dev hero rewrite** — keep existing identity. Add Ink-compat as a feature. "Migrating from Ink" as third-tier nav, not headline. Verified claims (98.6% Ink-compat, 3-27× faster) stay on the page in feature row.
2. **Migration case study** — pick mid-tier Ink project (2K-15K stars, NOT Wrangler), one-line import swap, document diff + perf delta. ~3 days.
3. **Outreach to 5-10 maintainers** — private DMs. Frame: *"we built something you might find useful"* not *"we built the migration path off your platform."*
4. **Codify The Seam Rule (v4)** in silvery's repo — Scope and Boundaries doc + GitHub label.
5. **Adopt Harmony CLA** (Individual + Entity) via CLA-Assistant.
6. **Verify factual claims** for launch materials: replace "all big AI labs use Ink" with *"de facto standard for AI-era developer CLIs, including Copilot CLI, Wrangler, and a majority of the npx AI tool ecosystem."*
7. **Register Silvery trademark + publish trademark policy** — Apache doesn't grant trademark rights; this is the fork-risk leverage.
8. **Public compatibility harness** — pin "98.6%" to methodology + Ink version + measurement date.
9. **Audience-capture stack** — Newsletter (Buttondown $9/mo or Resend free, with tagged opt-ins). X handle. GitHub Discussions on cluster-1 repos. Discord server with focused channels. Unified "stay in the loop" footer on silvery.dev.

### Week 1-3 (ONE demo, tightly scoped)

10. **silvery-acp-chat demo** — minimal coding-agent client, BYO API key, one provider (Claude or GPT), streaming + tool-use rendering + multi-pane + retry/error UX. 60-120s video. *silvery-system-monitor demoted to Q3 evergreen.*

### Week 2-4 (parallel during demo, distribution tooling)

11. **PR-opening outreach bot** (NOT a codemod — sed one-liner suffices for the import swap). Tool runs the import-swap on forks of target Ink projects, runs benchmarks, opens PRs with concrete value. Optional companion: small `silvery doctor` compat-check CLI (~1-2 days).
12. **`create-silvery` CLI** — two modes: new-app + migrate-existing-Ink-side-by-side.
13. **Discord weekly office hours**.

### Week 4-6 (loud launch + spec leadership)

14. **Loud launch push** — only after demo + 1 case study + 1 positive maintainer signal. Conference angle: *"Silvery: React for AI-era TUIs"* (silvery on its own merits). HN, Reddit, JS Weekly, X/Twitter, conference CFPs.
15. **Tribe Wire v0 preview** (Apache + CC BY 4.0, "unstable draft"). Claim "standard" mantle before competitors.
16. **Weekly Ink-roadmap watch** — Vadim v5 monitor; if a major Ink upgrade lands, accelerate launch by 2 weeks.
17. **~~Migration Assurance Program v0~~** — *reactive only, not promoted publicly*. If a maintainer asks, say yes case-by-case. No public landing page, no Calendly slot, no committed SLA. Avoids consultancy-shaped brand voice.

---

## Audience-capture stack

Without it, the promo wave drives attention to silvery.dev where it bounces.

**Tier 1 (must-have, Week 0-1)**: Newsletter, X/Twitter, GitHub Discussions, Discord, unified footer.

**Tier 2 (Week 2-3)**: Calendly for migration help (reactive). Blog with RSS. /showcase page. Cluster-1 unified newsletter.

**Tier 3 (post-traction)**: Bluesky handle. Matrix bridge via tribe gateway (self-dogfooding moment). Weekly office hours.

**Skip**: LinkedIn (silvercode-time, not silvery-time), Slack community (Discord wins), Mastodon-as-primary, TikTok / Shorts, own subreddit.

Each channel captures a different intent: discovery (X) / engagement (Discord) / re-engagement (newsletter) / support funnel (GitHub Discussions) / conversion (Calendly). Skipping any wastes a category of incoming attention.

---

## Cluster-1 sites — current state

Most cluster-1 surface is **already public**:

- **silvery.dev** — live; "98.6% Ink compatible" hero already on page; 45+ components; AI-coding-agent example
- **flexily** at `beorn.codes/flexily/` — live; "1.5-5.5× faster than Yoga, 1561 tests"; flexily.org / flexily.dev parked
- **termless.dev** — live; "headless terminal testing, 10 backends, < 1ms tests"
- **loggily.dev** — live; "Clarity without the clutter, ~22× faster than noop loggers, 3KB"
- **mdspec.org** — live; "executable markdown testing, pre-release 0.x"; used internally by silvery + termless. NOT `mdspec.dev` (unrelated SaaS publishing tool with $9/mo Pro tier)

Remaining work is cross-promotion + the silvery launch moment specifically, not "launch these sites."

---

## Outcome distribution + falsification triggers

**Outcome distribution** (post-/pro-v2 recalibration):
- **25-35%** — nominal traction (3-6K DL/wk; resumeware / background infra)
- **40-50%** — meaningful niche (8-15K DL/wk at 18 months; brand halo intact; small services ACV)
- **20-25%** — mid-tier reference migration (15-40K DL/wk; one >5K-star project migrates publicly; mid-six to low-seven figure services ACV)
- **3-7%** — Big Tech anchor (80K+ DL/wk; FAANG-ish team migrates; spec referenced in third-party docs)

Strategy survives in the 50-75% case (meaningful niche + mid-tier).

**Review cadence**:
- *Day 30* (post-quiet-launch): hero shipped, 1 case study, 3+ engineering signals
- *Day 45* (post-loud-launch): demo public, 1 lighthouse migration evaluation, HN traction
- *Day 60*: 3+ migrations (1 not by us), 1-2 external committers, 3-5 inbounds; aim 2-3× DL/wk lift
- *Day 90 qualitative kill*: zero inbound + zero Ink projects realistically benefitting + <20% sustained DL/wk growth → revisit positioning, possibly pivot back to Option 4 (closure)
- *Day 180 quantitative*: >10K DL/wk → continue; flat at <5K → diagnose distribution-vs-value
- *Month 12 strategic*: silvery generating qualified leads for silvercode/km? If not, OSS strategy is hobby

**The /pro v2 dominant signal worth heeding** (Kimi's *demand thermocline* framing): 3K DL/wk has been stable for months despite shipped Ink-compat. The market has seen silvery and not moved. Could be a **category failure** (Ink users don't feel the migration itch), not a marketing failure. If after 90 days of disciplined execution we're still at the thermocline, diagnose category-bet-was-wrong → pivot back to Option 4 with services-only revenue.

**Triggers to escalate** (all-in on silvery promo, delay silvercode 6+ months):
- Lighthouse (>5K-star) migration committed within 60 days
- Demo goes viral (>2K stars on demo repo, sustained 3-5× DL/wk spike)
- 3+ inbound from mid-market teams asking for migration help
- Major AI lab inbound (Anthropic / Google / Microsoft) — *"Ink is killing us, we want to migrate"*

---

## Killer-demo gap (acknowledged risk)

silvery.dev's missing flagship. km + silvercode can't fill the role (proprietary; wrong shape — workspace tools don't translate to *"look at this beautiful TUI"*). Without one, the framework reads as a spec.

**Plan**: ship silvery-acp-chat (Week 1-3) as the flagship. Better target-audience match than system-monitor (Ink users *are* building agent CLIs). System-monitor → Q3 evergreen.

**If demo slips**: outreach + case study + reactive MAP collect signal in parallel. Demo is not a single point of failure.

---

## Strategic narrative — how we got here

**Origin (2026-04-26 to 2026-04-27)**: three /deep + /pro passes converged on **Option 4 (close silvery)** based on framing inputs that turned out to be incomplete. The user surfaced empirical corrections that materially shifted the call:

1. **45:1 leverage ratio**: silvery took 3 months; silvercode took 2 days because silvery did the work. Framework is the strategic asset.
2. **silvery has been live with shipped Ink-compat for months at 3K DL/wk** — base rate established; not pre-launch.
3. **OpenTUI architecture is not conducive to Ink migration; silvery is** — they serve different segments. This is silvery's wedge.
4. **Big AI labs use Ink** (Copilot CLI, Wrangler, npx AI ecosystem) — defined large addressable migration market.
5. **The window is slipping** — longer Ink projects accumulate Ink-customizations or migrate to OpenTUI greenfield, shrinking the addressable market.

**Pivot to Option 5** (open silvery, sharp Ink-migration architectural position) confirmed by 4-of-4 final /pro models (GPT-5.4 Pro 20/20, Kimi K2.6 17/20, Grok 4 17/20, Gemini 3 Pro 13/20).

**/pro v2 (2026-04-28 morning)** then critiqued the execution plan after empirical findings:
- silvery/ink already shipped (98.6% per silvery.dev hero)
- Cluster-1 sites already live
- 3K DL/wk plateau may be a *demand thermocline* (Kimi)
- Demo budget unrealistic (2 demos in 2-3 weeks → 6-8 weeks reality)
- Order of operations was inverted (hero + case study + outreach should start NOW; demo follows)
- Tribe Wire v0 preview should ship in 4-6 weeks alongside silvery launch, not month 6+
- Codemod was over-engineered for a one-line import swap; PR-opening bot is the actual high-leverage tool

**Three Seam Rule iterations** (2026-04-27 night → 2026-04-28):
- *v1 "generic vs agent-shaped"* → rejected (cedes agentic chat to OpenTUI; the Ink-migration target users ARE building agent CLIs)
- *v2 "client glue vs operational service"* → directionally right
- *v3 "Vercel-shaped: hooks-only"* → rejected (silvery is a UI framework, not a hooks library; stripping polished components breaks brand promise)
- *v4 "polished generic component vs application-assembly"* → final. Polished generic agent components in silvery; silvercode-shaped specific application assembly in silvercode.

**Voice softening (2026-04-28)**: Ink-migration is the architectural capability, not the wedge headline. Don't lead with *"Drop-in for Ink"* — risks Ink-community backlash; Vadim is well-liked. Verified claims (98.6%, 3-27×) stay on the page; the *positioning* claim defers until third-party validation.

**Corporate structure correction (2026-04-28)**: I (Claude) initially recommended forming "Ardentum LLC" Delaware single-member without checking the vault. The user has a fully-designed family-office PLEP architecture with Wyoming HoldCo (multi-member 50/50 Bjorn + Delei) for QSBS optimization. The silvery portfolio slots into the existing plan; no new vehicle needed.

**MAP de-promoted to reactive-only (2026-04-28)**: Don't launch a public Migration Assurance Program with SLAs and committed slots. If a maintainer asks for migration help, say yes case-by-case. Avoids consultancy-shaped brand voice and unnecessary capacity commitment.

**Five options considered (audit trail)**:

1. *All-proprietary (Cursor pattern)* — rejected: closes Ink-migration market.
2. *Apache silvercode + paid cloud (Confluent pattern)* — rejected: opens unproven product code.
3. *Two-cluster Cursor-pattern with silvery-extensions in private monorepo* — rejected: no clean architectural seam.
4. *silvery proprietary going forward (JetBrains pattern)* — initially recommended by /pro round 3. Pivoted away after corrected competitive segmentation.
5. ***Open silvery + sharp Ink-migration architectural positioning (current decision)***. No Option 6 wins (AGPL toxic, BSL too complex for framework, source-available worst-of-both).

---

## Cross-references

### Upstream / vision
- [`integrated-workdesk.md`](integrated-workdesk.md) — canonical product future plan
- [`vision.md`](vision.md) — workspace framing (km + tribe + agents-as-bridges)
- [`silvercode-squad-mode.md`](../../silvercode/future/ai-terminal/silvercode-squad-mode.md) — validated near-term wedge

### Family-office strategy
- `~vault/areas/@office/CHARTER.md` — PLEP/MEES entity architecture + QSBS strategy
- `~vault/areas/@office/Entities/HoldCo.md` — Wyoming HoldCo formation plan
- `~vault/areas/@office/Entities/Mama_Muse_LLC.md` — separate Delei entity
- `~vault/areas/@office/Entities/Kimmi_Corp.md` — planned C-Corp
- `~vault/projects/+founder-portfolio/entity-ledger.md` — historic entity inventory (Beowa, EOSC, Happylatte, etc.)

### Silvercode landscape
- [`02-agent-integration.md`](../../silvercode/future/ai-terminal/02-agent-integration.md) — fork tripwires
- [`09-agent-host-landscape.md`](../../silvercode/future/ai-terminal/09-agent-host-landscape.md)
- [`10-agent-router-landscape.md`](../../silvercode/future/ai-terminal/10-agent-router-landscape.md)
- [`hub/silvery/research/coding-agent-landscape.md`](../../silvery/research/coding-agent-landscape.md)

### Research artifacts (audit trail)
- `/tmp/strategy-pro-v2-final-2026-04-28.md` — most recent /pro v2 review (4-leg, GPT-5.4 Pro + Kimi + GPT-5.4 Pro split-test, Kimi judge winner 19/20)
- `/tmp/strategy-final-pro-result-2026-04-27.md` — final /pro convergence on Option 5 (4-leg, GPT-5.4 Pro 20/20)
- `/tmp/strategy-meta-review-pro-result-2026-04-27.md` — meta-review across five options
- `/tmp/silvery-and-packages-pro-result-2026-04-27.md` — silvery proprietary deep-dive
- `/tmp/oss-vs-private-pro-result-2026-04-27.md` — initial OSS-vs-private deep-dive
- `/tmp/coding-agents-pro-result-2026-04-27.md` — coding-agent landscape

### Tracking beads
- `km-all.vision-reframe-2026-04-27`
- `km-all.kilo-opencode-fork-2026-04-27`
- `km-all.coding-agent-landscape-2026-04-27`
- `km-all.oss-vs-private-2026-04-27`
- `km-all.silvery-packages-licensing-2026-04-27`

---

## Bottom line

Open silvery Apache + CLA. silvercode + km + cluster-2 services proprietary. tribe + PlainBrain follow silvery's open-spec / canonical-impl / paid-services pattern. Voice stays *"React for modern terminal apps"* with Ink-compat as a capability. Wyoming HoldCo (multi-member 50/50) holds the IP; Delaware C-Corp spin-outs at PMF for QSBS pass-through. Critical-path: case study + hero rewrite + outreach + audience capture this week; ACP-chat demo in 2-3 weeks; loud launch when proof is in hand. Falsify on Day 90 if 3K DL/wk plateau holds.

Stop deliberating. Execute.
