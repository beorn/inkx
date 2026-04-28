# Licensing strategy — across the full stack

## TL;DR — the plan (read this first)

**Decision (locked, post-/pro 4-leg final review, 2026-04-27 night)**: open silvery at **Apache-2.0 + CLA**, sharply positioned as **the React-Ink-migration framework**. silvercode + km stay proprietary. tribe = open wire/spec (Apache + CC BY 4.0) + proprietary hosted gateway. The **SDK-with-services** revenue pattern (Stripe Elements / Mapbox SDK) — open silvery components funnel to paid backend services (`<AgentSession>`, `<RecallPanel>`, `<TribeRoom>`, `<SquadView>`, `<ContextSafety>`, etc.).

**Two-layer brand**:
- *Cluster 1 (open, Apache-2.0 + CLA)*: silvery + flexily + termless + terminfo + loggily + mdspec + emulators + alien-* + minor satellites.
- *Cluster 2 (proprietary)*: silvercode + km + tribe-internal + hosted services (subscription-auth, ambient-context-safety, recall-hosted, agentroom-hosted).

**Shipped state (much further along than the doc previously implied)**:
- `silvery/ink` migration shim is **already shipped** (vendor/silvery/packages/ink, v0.21.0, ~3K LOC, covers Box/Text/Spacer/hooks/render/animation/focus/cursor/stdin/measure-text/sanitize/chalk-compat). silvery.dev claims "98.6% Ink compatible" — grounded.
- Cluster-1 sites live and polished: **silvery.dev** (98.6% Ink-compat hero), **termless.dev**, **loggily.dev** (22× faster than noop), **mdspec.org** (executable markdown testing, pre-release 0.x, used by silvery + termless), **beorn.codes/flexily/** (1.5-5.5× faster than Yoga, 1561 tests). flexily.org / flexily.dev parked.

**Real critical-path work remaining** (~2-3 weeks if focused):
1. **Killer demo** — silvery.dev's missing flagship. Top candidates: silvery-system-monitor (htop-class) + silvery-acp-chat (BYO-key coding agent, AI-tailwind). Doing both ≈ 2-3 weeks. Optional fourth path: commission a high-profile Ink user via Migration Assurance Program.
2. **Migration case study** — pick mid-tier Ink project (2K-15K stars, NOT Wrangler), one-line import swap (`from "ink"` → `from "silvery/ink"`), document diff + perf delta. ~3 days.
3. **silvery.dev hero rewrite** — promote "98.6% Ink compatible" to hero slot; add "Migrating from Ink" landing-nav alongside "Building new TUIs."
4. **Cluster-1 cross-promotion** — coherent entry-point navigation + cross-links between cluster-1 sites.
5. **Codify The Seam Rule** in silvery's repo (framework-vs-application boundary; prevents feature-creep-by-guilt as silvery gains traction).
6. **Adopt Harmony CLA** (Individual + Entity) via CLA-Assistant; one-page "Why we use a CLA" explainer.
7. **Launch post + outreach** to 5-10 mid-tier Ink-using projects. Conference angle: *"Beyond Ink: a new rendering contract for AI-era TUIs"* (succession, not patricide).
8. **Weekly Ink-roadmap watch** — Vadim v5 monitoring; if a major Ink upgrade lands, accelerate launch by 2 weeks.
9. **Verify factual claims** before launch materials: replace "all big AI labs use Ink" with *"Ink is the de facto standard for AI-era developer CLIs, including Copilot CLI, Wrangler, and a majority of the npx AI tool ecosystem."*

**Review cadence** (dual + strategic):
- **Day 30**: docs + shim shipped, demo public, 1 successful migration, 3+ engineering signals.
- **Day 60**: 3 migrations (1 not by us), 1-2 external committers, 3-5 credible inbounds.
- **Day 90 qualitative**: 5+ migrations OR 1 named reference OR steady ink-compat fix cadence. **Kill criterion**: zero inbound interest AND no Ink project realistically benefits.
- **Day 180 quantitative**: > 10K DL/wk → continue; flat at < 5K → diagnose distribution-vs-value.
- **Month 12 strategic**: silvery generating qualified leads for silvercode/km? If not, OSS strategy is hobby, not business.

**Outcome distribution** (conservative recalibration from /pro):
- 45% — meaningful niche (10-50K DL/wk at 18 months, brand halo intact)
- 25% — mid-tier reference migration ( > 5K-star project migrates publicly)
- 5% — Big Tech migration (don't count on it)
- 25% — nominal traction (silvery becomes resumeware / background infra)

The 75% case (top three) makes the strategy worth running. Decision survives without the 5% miracle.

**Options considered (audit trail — all five preserved below)**:
1. All-proprietary (Cursor pattern) — rejected: closes Ink-migration market.
2. Apache silvercode + paid cloud (Confluent pattern) — rejected: opens unproven product code.
3. Two-cluster Cursor-pattern with silvery-extensions in private monorepo — rejected: no clean architectural seam.
4. silvery proprietary going forward (JetBrains pattern) — initially recommended by /pro round 3 (GPT-5.4 Pro 19.5/20). Pivoted away after user surfaced corrected competitive segmentation (Ink-migration market, OpenTUI architectural mismatch).
5. **Open silvery + sharp Ink-migration positioning (current decision)** — 4-of-4 final /pro models confirmed (GPT-5.4 Pro 20/20, Kimi K2.6 17/20, Grok 4 17/20, Gemini 3 Pro 13/20). No Option 6 wins (AGPL toxic, BSL too complex for framework, source-available worst-of-both).

**Key risk + mitigation**:
- *Ink upgrade* (Vadim ships v5 with mouse + multi-pane) → weekly roadmap watch + accelerate on signal + architectural moat (multi-process rendering, remote panes — features hard for Ink to retrofit).
- *Open/closed boundary bleed* → The Seam Rule codified before contributors arrive; "Out of scope" GitHub label with polite boilerplate.
- *Maintenance reality* → 1-2 hrs/week is fantasy if Option 5 succeeds; plan for 5-8 hrs/week or aggressive community delegation.
- *Killer-demo gap* → call it out; allocate 2-3 weeks; system-monitor + acp-chat candidates.

---

## Status

**The historical arc**: three /deep + /pro passes converged on Option 4 (close silvery; protect 45:1 leverage). The /pro analysis was genuinely strong given its inputs but worked with an incomplete competitive map. After the recommendation landed, the user surfaced a series of considerations that materially shift the call:

1. **The opportunity is slipping** — urgency for opening, not optionality
2. **Releasing silvery is marketing for silvercode** — top-of-funnel that closure forfeits
3. **Inbound interest from acquirers** — visible OSS infrastructure leadership materially affects acquisition conversations
4. **OpenTUI's architecture is not conducive to Ink migration; silvery is** — they serve different segments
5. **silvery is a perfect swap-out for Ink, and all the big AI labs are on Ink** — defined large addressable market with a uniquely-positioned product

The corrected competitive segmentation: silvery is **not** competing with OpenTUI for "next-gen TUI framework" (OpenTUI has won that slot via Anomaly + Kilo distribution). silvery is competing for **the Ink-migration market** — a distinct, large, untapped segment with no other viable migration target. This is a knife-shaped position OpenTUI cannot replicate.

**The decision is Option 5 with sharp positioning: open silvery aggressively at Apache-2.0 + CLA, position explicitly as "the React-Ink-migration path," 3-6 months of focused promo before silvercode public launch.**

**Note (2026-04-27 night): the "silvery++ tier" / layered moat option was considered and rejected.** It would have required manufacturing an artificial seam between silvery's general framework primitives (which Ink-migrating teams need) and silvery primitives that benefited silvercode specifically. Empirically, silvercode's leverage came mostly from silvery *core* (general components, focus scope, layout, reconciler, incremental rendering, mouse) — not from silvercode-specific silvery primitives. The architecture doesn't have a natural core/non-core seam; manufacturing one is expensive, brand-toxic (looks like artificial bait-and-switch), and would weaken both the Apache-silvery-pitch and the silvercode-revenue-protection. silvercode-specific UX (multi-pane host, file-claim viz, ambient channel rendering, two-region composer) is silvercode *application* code, kept closed in the silvercode private monorepo. silvery is fully Apache + CLA, single tier.

**Realistic competitor-clone timeline under this posture**: silvery open + competitor needs to build their own ACP wiring + subscription auth + ambient-context-safety + CrossAgentState + cloud services = ~1-3 months for a credible silvercode-equivalent. Closure would have bought 2-4 additional months. That delta is the price of capturing the Ink-migration market + funnel + acquirer signal — judged worthwhile.

The earlier /pro convergence on Option 4 stands as the analysis based on the framing it had access to — preserved below as historical context. The actual founder's strategic priors (which /pro could not see) coupled with the corrected segmentation produce a different answer.

Three new data points from the user that drive the call:

1. **silvery took 3 months to develop; silvercode took 2 days because silvery did the work** → 45:1 leverage ratio. Silvery is the strategic asset, not silvercode app code.
2. **silvery has not been promoted because there's no good showcase yet — silvercode is that planned showcase, but if silvercode goes proprietary, the showcase loop breaks.**
3. **emulators (vt100/vt220/vterm) and loggily are zero-maintenance** — reverses the deep's deprecate recommendations.

Plus convergent /pro arguments: closing silvery preserves the 45:1 accelerator exclusively; "I think it'll splash" is founder-optimism without ground-truth; time-boxed experiment is paralysis-with-extra-steps; brand halo isn't required for devtool fundraising (Cursor/Notion/Linear/JetBrains precedents); 5-15 hrs/week is low-balled; bounded OSS experiments leak.

**The recommended posture is now Option 4. Sections below preserve other options for historical context but are superseded.**

**Audience**: Bjørn (decision-owner), future contributors, anyone evaluating the licensing posture of any package in the portfolio.

**Scope**: license + commercial-posture decision per layer (silvery / tribe / km / silvercode / agentroom) and per package (~62 packages). Sits below [`integrated-workdesk.md`](integrated-workdesk.md); references the moats identified in [`hub/silvercode/future/ai-terminal/silvercode-squad-mode.md`](../../silvercode/future/ai-terminal/silvercode-squad-mode.md).

**One-line summary**: pick a clean lane (Cursor-style fully proprietary OR Confluent-style Apache + proprietary cloud services); don't hedge with BSL.

## Executive summary — the current decision (2026-04-27 final)

**The decision**: open silvery at Apache-2.0 + CLA with sharp positioning as **the React-Ink-migration framework**; commit to 3-6 months of focused promo before silvercode public launch; keep silvercode + km proprietary; tribe ships as **open wire/spec** (Apache-2.0 + CC BY 4.0) with a proprietary hosted gateway (Confluent/MongoDB-Atlas pattern); maintain termless + terminfo + emulators + loggily as the open cross-promotional terminal-R&D cluster.

**The pitch in one line**: *"silvery is the swap-out for Ink, and all the big AI labs are on Ink."* OpenTUI has won the post-Ink-greenfield slot but cannot serve the Ink-migration market — silvery's architecture uniquely targets that segment. The market is large (Claude Code + gemini-cli + Copilot CLI + Wrangler are all on Ink with millions of DL/wk between them), specific (architectural compat that OpenTUI doesn't offer), and untapped.

### Revenue architecture: SDK-with-services pattern (clarified 2026-04-27 night)

silvery is fully open Apache-2.0 + CLA. silvery *includes* SDK-shaped components anyone can integrate freely — but those components are architecturally locked to talk to *our* paid cloud services. Component code is open (drives adoption); operating the component requires our service (drives revenue).

This is the **API economy / Stripe Elements / Mapbox GL / Twilio SDK / Algolia InstantSearch / Sentry SDK pattern** applied to TUI components. Multi-billion-dollar precedent. Not exotic.

silvery components that follow this pattern:

- `<AgentSession>` — embed a running coding agent into your TUI. Open component. Operating requires our subscription-auth gateway + ambient-context-safety service.
- `<RecallPanel>` — semantic search over session history. Open component. Vector index + LLM retrieval hosted by us.
- `<TribeRoom>` — cross-machine agent coordination. Open component. Coordination across machines requires our hosted agentroom gateway.
- `<SquadView>` — visualize multi-agent file claims + handoffs. Open component. Cross-pane coordination state runs on our cloud.
- `<ContextSafety>` — ambient-context-safety pipeline. Open component. Safety guardrails + token-savings tracking run server-side.
- `<TermlessRunner>` — run termless tests against our hosted matrix of real terminals.
- `<TerminfoVerify>` — capability checks against our verified-data tier.

Each component: free to integrate, pay to operate. Customer choice cascade:

- *"I want to migrate from Ink"* → use silvery (free framework)
- *"I want one of silvery's premium components in my own app"* → integrate it (free), pay for the backend service
- *"I want the polished all-in-one coding product"* → buy silvercode subscription
- *"I want the agentic knowledge workspace"* → buy km subscription

Multiple revenue paths, all funneling through the same open framework.

**Why this collapses the leverage-leak worry**: a competitor with open silvery still needs to build their own backend services to power their components. The moat moves from framework code (which leaks) to operational services (which don't). Component code is API-client glue; reproducing it doesn't get the operational service.

### The two-layer brand architecture

**Cluster 1 — Open Terminal R&D and Developer Infrastructure** (all Apache-2.0 + CLA):
- **silvery** (the React-Ink-migration TUI framework, marquee asset) — `silvery.dev` (live; hero claims "98.6% Ink compatible", "3-27× faster than Ink in mounted rerenders", 45+ components, AI-coding-agent example)
- **flexily** (Yoga-compatible flex layout engine; co-strategic with silvery; ~1.5-5.5× faster, 3× smaller, no WASM, 1561 tests) — `beorn.codes/flexily/` (live; flexily.org/flexily.dev parked, redirect-or-leave decision pending)
- **termless** (headless terminal testing; 10 backends, < 1ms tests, recording → GIF/SVG/APNG/asciicast) — `termless.dev` (live)
- **terminfo.dev** (terminal capability database) — site live
- **vt100.js / vt220.js / vterm.js** (emulator backends; support termless; zero-maintenance)
- **loggily** (unified TS debug/log/span API; ~22× faster than noop loggers, 3KB, OTel/Pino/Sentry transports) — `loggily.dev` (live)
- **mdspec** (executable markdown testing — make docs executable, fail tests when README examples drift; used internally by silvery + termless) — `mdspec.org` (live, pre-release 0.x)
- **alien-projections, alien-resources, alien-trees** (reactive primitives at `github.com/beorn/bearly/packages/`)
- **vimonkey** (fuzz testing for Vitest)
- **vitepress-enrich** (VitePress docs tooling)
- **@silvery/{ansi, color, commander}** (silvery satellites)

Brand voice: rigorous, performance-conscious, terminal-native, multi-target-ambitious. Cross-promotional: each repo's docs reference the others. Same brand-pattern as Charm.sh (Bubble Tea + Glamour + Lip Gloss as the open identity).

**Shipped surface as of 2026-04-27**: cluster-1 is **mostly already public** — silvery.dev / flexily(beorn.codes) / termless.dev / loggily.dev / mdspec.org are all live with polished landing pages and concrete performance receipts. The remaining strategic work is *not* "launch these sites" but (a) coherent cross-promotion + entry-point navigation between them, (b) the silvery launch moment specifically (hero rewrite, migration case study, killer demo, outreach), (c) the killer demo itself — silvery.dev lacks a flagship app showcase, since silvercode + km can't fill that role (proprietary; wrong shape).

**Cluster 2 — Proprietary AI Product Line + Service Backends**:
- silvercode app code (proprietary, private monorepo)
- silvercode-internal silvery extensions (live in silvercode private monorepo, not separate packages)
- km app + cloud (proprietary, Notion/Linear pattern)
- tribe wire + spec (Apache-2.0 + CC BY 4.0) — protocol stays open as a standardization play; tribe-internal extensions stay private
- agentroom gateway (Apache reference impl + CC BY 4.0 spec + paid hosted gateway)
- All paid cloud services (subscription-auth, ambient-context-safety, recall-hosted, agentroom-hosted, termless-cloud, terminfo-verified)
- Private @beorn/{accountly, tap, watcher-chaos}, claude-tty-mcp

The bridge between clusters: silvery includes SDK-shaped components (`<AgentSession>`, `<RecallPanel>`, `<TribeRoom>`, `<SquadView>`, `<ContextSafety>`, `<TermlessRunner>`, `<TerminfoVerify>`) that are open code with cluster-2 services as the operational backend. SDK-with-services pattern.

### Per-layer license matrix (final)

- **silvery** → **Apache-2.0 + CLA**. Open. Positioned as Ink-migration framework. CLA preserves relicensing optionality for future versions.
- **silvercode (app code + cloud services)** → **proprietary**, private monorepo. The actual revenue-generating product.
- **silvercode-internal silvery extensions** → live in silvercode's private monorepo, **not** as separate `@silvery/*` packages. (Earlier "silvery++" tier rejected as architectural fiction — silvercode's leverage came from silvery *core*, not from silvercode-specific silvery primitives. Manufacturing a core/non-core seam is artificial and brand-toxic.)
- **km** → **fully proprietary**. Notion/Linear pattern. Open Markdown export schema as portability hygiene.
- **tribe** → **Apache-2.0** wire + **CC BY 4.0** event-vocabulary spec. Conformance tests + "tribe-compatible" badge program. Internal extensions stay in silvercode private monorepo.
- **agentroom gateway** (when built) → **Apache-2.0 reference impl + CC BY 4.0 spec + paid hosted gateway**. Confluent-Cloud / MongoDB-Atlas pattern.
- **termless ecosystem** (15 packages) → **Apache-2.0**. Cluster 1 cross-promo. Termless-cloud as commercial wedge if 3+ design partners commit.
- **terminfo.dev** → **Apache-2.0 code + CC0 or ODbL data**. Public-good infra. Verified-data enterprise tier as optional commercial wedge.
- **vt100.js / vt220.js / vterm.js** → **Apache-2.0**. Zero-maintenance, support termless backends. Reverses the deep's deprecate recommendation.
- **flexily** → **Apache-2.0**. Strategic to silvery's multi-target.
- **loggily** → **Apache-2.0**. Low-touch maintenance. User: "no problem to maintain, generally nicer to work with."
- **alien-* (projections, resources, trees)** → Apache-2.0. Consider merging into single `alien-signals-extras`.
- **vimonkey, mdspec, vitepress-enrich** → Apache-2.0; maintenance mode or donate.
- **@silvery/{create, headless, test, theme}** (deprecated subpackages) → fold into silvery barrel; final MIT tag.
- **@bearly/github** → Apache-2.0; low-touch.
- **Private @beorn/* (accountly, tap, watcher-chaos), claude-tty-mcp** → proprietary.

### Why this — the empirical chain that produced it

1. **45:1 leverage ratio**: silvery took 3 months; silvercode took 2 days because silvery did the work. Framework is the strategic asset.
2. **silvery's distribution today**: 3K DL/wk combined across the ecosystem. Essentially zero community. Closing silvery costs little community-wise; opening silvery has substantial upside *if* it can find traction.
3. **silvery hasn't been promoted because there's no good showcase yet**: silvercode was the planned showcase. *But* silvercode going proprietary means the showcase loop becomes asymmetric (silvercode-as-product can market silvery via "built with silvery" + demo videos, à la Cursor → VS Code).
4. **Ink is dominant** (1M+ DL/wk via Claude Code, Gemini CLI, Copilot CLI, Cloudflare Wrangler) but **capability-capped** (no good mouse, single-target, full-redraw flicker, limited multi-pane). It's not "bad" — it's predictable and feature-limited.
5. **OpenTUI is "also good"** and is the post-Ink-greenfield incumbent (Anomaly's distribution + Kilo's $8M-backed marketing). Silvery cannot compete with OpenTUI for greenfield — that race is lost.
6. **OpenTUI's architecture is not conducive to Ink migration** — it's a different abstraction. **Silvery is specifically designed as an Ink-compatible drop-in.** This is the wedge.
7. **Big AI labs all use Ink.** They have a real reason to want a migration path as their products hit Ink's limits. Silvery is the only architectural answer.
8. **The window is slipping.** The longer Ink-using projects accumulate Ink-specific customizations or migrate to OpenTUI (via rewrite), the smaller silvery's addressable market becomes.
9. **silvercode's leverage was mostly silvery core stuff.** No clean architectural seam exists between "Ink-migration features" and "silvercode-specific features." This rules out the layered "silvery + silvery++" model — it would require artificial line-drawing on top of code not designed for that split.

### Realistic competitor-clone timeline (with open silvery)

If a competitor wants to build a silvercode-equivalent with open silvery:
- Use silvery (free, public): saves ~3 months of framework work
- Build their own ACP wiring per backend: ~weeks
- Build their own subscription-auth flows per vendor: ~weeks (genuinely hard; vendor-specific)
- Build their own ambient-context-safety pipeline: ~weeks (architectural design)
- Build their own CrossAgentState semantics: ~weeks
- Build their own cloud services if they want services moats: ~months

Total: **~1-3 months** for a credible silvercode-equivalent on open silvery.
Total on closed silvery: **~4-6 months** (need to build the framework first or use OpenTUI which doesn't do Ink-migration).

**Closure delta: 2-4 months of head-start.** The price of capturing the Ink-migration market + funnel + acquirer signal vs the protection of an additional 2-4 months runway. Judged worthwhile given silvercode's brand + first-mover + services + execution velocity advantages.

### Realistic outcome distribution (committing to Option 5 / Ink-migration positioning)

- **60%** — silvery captures meaningful niche of Ink-fatigued segment over 12-18 months; ~30-100K DL/wk; real brand halo for silvercode; durable strategic asset.
- **20%** — one mid-tier project (more likely Cloudflare Wrangler or similar than Anthropic) does an actual migration → reference customer → cascade.
- **5%** — Big Tech (Anthropic / Google / Microsoft) migrates a major product. Don't count on it; institutional inertia is real. This is the "miracle" outcome.
- **15%** — silvery doesn't get traction beyond current 3K DL/wk; revisit posture in 6 months.

The 80% case (most-likely + optimistic) makes the strategy worth running. Decision is sound without the miracle outcome.

### The historical arc of options considered

For audit trail. Five options were considered across three /deep + /pro passes:

1. **All-proprietary (Cursor pattern)** — silvery + silvercode + km + tribe all closed. Considered but rejected: closes the door on Ink-migration market, AAIF gravity, brand halo.
2. **Apache silvercode + paid cloud (Confluent pattern)** — open silvercode app code + proprietary services. Considered but rejected: silvercode's services moats are unproven; opening the entire app code is too aggressive when commercial validation hasn't happened.
3. **Two-cluster Cursor-pattern with silvery-extensions in silvercode private monorepo** — silvery core open, silvercode-specific silvery primitives private. Considered but rejected: empirically there's no clean architectural seam (silvercode's leverage was silvery core, not extensions).
4. **silvery proprietary going forward (JetBrains pattern)** — silvery closed, lightweight open cluster (termless + terminfo). **Recommended by /pro round 3 with rare cross-voice convergence (GPT-5.4 Pro 19.5/20, Gemini 3 Pro 16, Grok 4 17). Pivoted away from after the user surfaced corrected competitive segmentation /pro hadn't engaged with.**
5. **Open silvery with sharp Ink-migration positioning (current decision)** — silvery Apache-2.0 + CLA, 3-6 months focused promo, position as "the React-Ink-migration framework." Cluster 1 cross-promotional with termless + terminfo. silvercode + km + tribe stay proprietary. **This is the final decision.**

### Three concrete deliverables for executing Option 5

> **Shipped-state correction (2026-04-27)**: the migration shim already exists. `vendor/silvery/packages/ink/` (v0.21.0, ~3K LOC) ships as `silvery/ink` + `silvery/chalk` exports inside the published `silvery` package. Covers Box / Text / Spacer / hooks (563 LOC) / render (846 LOC) / animation / focus / cursor / stdin / measure-text / sanitize / chalk-compat — past 80/20, into 98.6%-claim territory per silvery.dev. The /pro deliverable "build the shim" is not the path; the path is **promote the shipped shim** with a real migration case study and a hero rewrite.

1. **Make "swap-out for Ink" provable, not aspirational.** The claim does the work; without proof, the positioning collapses.
   - Ink-to-silvery migration guide (concrete API mapping table) — write/polish; the shim's surface is the source of truth
   - ~~`@silvery/ink-compat` shim package handling 80% of common Ink patterns~~ — **already shipped** as `silvery/ink` (98.6% per landing page)
   - Side-by-side demo repo (same app, both frameworks, commits show migration)
   - **One actual real-world migration**: pick a non-trivial open-source Ink project, swap `import { Box, Text } from "ink"` → `from "silvery/ink"`, document honestly. With shim shipped, this is ~3 days of work, not weeks. The headline writes itself: *"we migrated [popular Ink project] to silvery in 3 days — one import line."*

2. **Targeted promo, not generic OSS marketing.** Position as Ink-migration path, not generic React TUI framework.
   - Launch post: *"Migrating from Ink: the post-Ink React TUI"* — focus on Ink's specific limitations (mouse, multi-pane, performance, multi-target) and silvery's exact answers
   - Comparison-with-receipts table: silvery vs Ink on the dimensions that matter; benchmarks, not marketing
   - Conference angle: *"Why Ink is the wrong abstraction for AI-era TUIs"* (sharp, controversial, gets attention)
   - Outreach to 5-10 mid-market Ink-using projects (not BigCo cold)

3. **Killer demo — the missing flagship.** silvery.dev currently lacks a daily-driver showcase app. km + silvercode can't play this role (proprietary; wrong shape — workspace tools don't translate to "look at this beautiful TUI"). Without a flagship the framework reads as a spec, not a product. Candidates in priority order:
   - **silvery-system-monitor (htop-class)** — universally recognized reference, daily-driver retention, naturally exhibits silvery's Ink-impossible features (multi-pane, mouse-sortable columns, live-streaming updates, color depth). No clear leader in the space; safest splash.
   - **silvery-acp-chat** — minimal open coding-agent client (BYO API key, no cloud services dependency). Catches AI-tooling zeitgeist, demos `<AgentSession>` / streaming / multi-pane, opens the SDK-with-services mental path toward silvercode. Risk: needs a clear "demo, not product" line vs silvercode.
   - **silvery-clone-of-popular-Ink-tool** — strongest *migration* argument but the Ink ecosystem skews toward install-wizards / framework demos rather than daily-driver TUIs; candidate pool is thin.
   - **Commission a high-profile Ink user to migrate their tool via the Migration Assurance Program** — slowest, most expensive, highest-signal. Turns "we need a demo" into "we have a reference customer."

   Doing one wow demo (system-monitor) plus one AI-tailwind demo (acp-chat) ≈ 2-3 weeks combined, probably beats picking either alone. The non-demo move (paid migration) is parallel, not exclusive.

4. **Time-box but commit.** 3-6 months focused promo *before* silvercode public launch. Real budget, not hedged.
   - 3-5 weeks focused work upfront (post + demos + migration guide + compat layer)
   - Sustained 1-2 hrs/week ongoing (social, blog, X engagement)
   - Conference talk submissions to JSConf, ReactConf, OSPOCon, AI-tooling events
   - Targeted outreach to 5-10 Ink-using projects
   - Day-90 review: if no inbound interest from any Ink-using team and no migration demos generating traction, revisit. But run the actual experiment — don't half-commit.

### Falsification triggers (when to revise the call)

**Triggers to harden** (double down on Option 5):
- Inbound interest from Ink-using teams within 60 days of launch
- HN front page / dev.to virality / conference acceptance
- 2+ third-party migrations to silvery in the wild
- silvercode's design-partner pipeline benefits visibly from silvery brand

**Triggers to revisit / pivot back to Option 4** (close silvery):
- 90 days post-launch, no Ink-using team has shown inbound interest
- OpenTUI ships an Ink-compat layer first (defensive — they could)
- Maintenance overhead exceeds 15 hrs/week with no proportional adoption signal
- silvercode hits early monetization signal (paying design partners pre-public-launch) — pivot to closure to maximize commercial moat

**Triggers to escalate** (go all-in like the Challenger argued):
- Major AI lab inbound — *"We want to migrate Claude Code / gemini-cli / Copilot CLI off Ink, silvery is the path"*
- Investor strategy pivot — devtools VCs say OSS framework with traction would materially change round dynamics
- Conference + influencer commits at scale (Pragmatic Engineer, ThePrimeagen, Theo)

### What this changes from the original /pro Option 4 recommendation

The /pro convergence on Option 4 was real but was based on:
- An assumption that the framework lane was lost (true for greenfield, NOT true for Ink-migration)
- An assumption that "splash" was generic OSS adoption (true, but the real opportunity is *targeted* Ink-migration)
- An assumption that silvercode's services moats would defend value alone (unproven)
- An assumption that close-now optionality was abundant (true for delaying, but the window for entering Ink-migration market is bounded)

The user's empirical corrections — particularly *"silvery is specifically targeted at Ink migration; OpenTUI is not; all big AI labs use Ink; the window is slipping"* — invalidated the assumptions /pro relied on. Once the competitive segmentation was corrected, the recommendation should also flip. The /pro analysis remains a useful audit trail; the conclusion no longer survives the corrected inputs.

### Final /pro review of the converged decision (2026-04-27 night)

A 4-leg dual-pro review (GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro + Grok 4) was run on the converged Option 5 plus the per-layer matrix above. **All four models confirmed.** Judge breakdown via GPT-5-Mini: GPT-5.4 Pro 20/20, Kimi K2.6 17/20, Grok 4 17/20, Gemini 3 Pro 13/20. No model recommended pivoting back to Option 4 or to a sixth alternative (AGPL, BSL, source-available all rejected). The strategy is locked. Findings worth integrating:

**Critical contradiction (now fixed)**: the original draft said "silvercode + km + tribe (going forward) stay proprietary" while the matrix listed tribe wire as Apache-2.0 + CC BY 4.0. Both GPT-5.4 Pro and Kimi flagged this as the only line in the document that, if shipped wrong, "poisons the entire strategy." Tribe is an interoperability protocol — proprietary protocols don't get adopted. **Resolution**: tribe is open wire (Apache) + open vocab (CC BY 4.0) + proprietary hosted gateway. The matrix was right; the executive-summary line was wrong. Fixed above.

**Positioning refinement**: keep "the React/Ink migration framework" as the primary launch wedge, but anchor a secondary identity as **"an advanced React TUI runtime (multi-pane, incremental rendering, mouse-first)"** so docs/landing-page nav splits into "Migrating from Ink" and "Building new TUIs." Migration-only is too narrow as a permanent identity — Year-2 problem if Year-1 succeeds. Polyfills don't win halo effects; next-generation paradigms do. Use the migration wedge as activation energy; let the framework's identity be the thing you build the future on. Both /pro and Kimi independently called this out.

**CLA specifics**: use the **Harmony CLA** (Individual + Entity variants), automated via **CLA-Assistant** or **EasyCLA**, with a one-page "Why we use a CLA" explainer in the repo committing to no rug-pulls and Apache-2.0 as the default. Avoid copyright assignment (highest contributor friction). Inbound = outbound except for explicit relicensing carve-out. DCO-only was considered and rejected: retroactive CLA is impossible, and given the strategic intent to monetize downstream (silvercode/km), a lightweight CLA up front is necessary prepayment of friction.

**Shim scope is 80/20, not 100% parity**. `@silvery/ink-compat` should target the common surface — `Box`, `Text`, `Spacer`, `useInput`, `useApp`, basic `render()`. It should explicitly **not** chase deep `Static` optimizations, custom Ink reconciler hacks, or obscure `measureElement` edge cases. Migration guide gets two tracks: **Track A (Automated)** for standard CRUD TUIs (target: 15-min migration); **Track B (Manual)** for advanced apps with multi-pane / mouse / rendering-model differences (target: 2-hour architectural migration). Promising 100% Ink API compat builds a second framework inside the framework — that's a trap.

**Real-world migration target**: NOT Cloudflare Wrangler. Too high-profile, too politically sensitive, too large to migrate quickly, and the maintainer may simply ignore us. Pick a **mid-tier Ink project (2K-15K stars)** that's visibly maintained where the author has publicly complained about Ink limitations. A migrated 5K-star project the maintainer *tweets about* is worth more than a Wrangler attempt sitting in a private branch. Selection criterion list: candidates ranked now, not at execution time.

**Maintenance is not 1-2 hrs/week if Option 5 succeeds — it's 5-8.** The 1-2 hrs/week budget is fantasy in the 60% case. Edge-case bugs across Windows Terminal / iTerm / Kitty, terminal-specific rendering issues, PRs that break the reconciler, conformance test maintenance — at 30K+ DL/wk with a real Ink-fatigued user base, the volume rises. Plan capacity for 5-8 hrs/week sustained, or commit to aggressive community delegation. Pretending otherwise sets the project up for the "open-source burnout" pattern.

**Falsification triggers — tighten to dual cadence**:

- **Day 30** (post-launch): docs + shim shipped; demo repo public with reproducible benchmarks; 1 successful migration (your own fork or friendly adopter); 3+ substantive engineering signals (issues from Ink users, technical questions about migration).
- **Day 60**: 3 total migrations (1 not by you); 1-2 external committers contributing migration fixes; 3-5 credible inbounds from Ink-based projects evaluating migration.
- **Day 90 (qualitative)**: 5+ migrations OR 1 named mid-tier reference OR steady ink-compat fix cadence indicating life beyond core team. **Kill criterion**: zero inbound interest AND inability to identify a single Ink project that would realistically benefit. (Both true → revisit positioning, not necessarily closure.)
- **Day 180 (quantitative)**: DL/wk trajectory > 10K and growing → continue. Flat at < 5K → diagnose distribution problem (fixable with more outreach) vs value problem (not fixable). **Pivot criterion**: no reference migration by month 6 → broaden to "advanced React TUI" or accept resumeware.
- **Month 12 (strategic)**: is silvery generating qualified leads for silvercode/km? If not, the OSS strategy is hobby, not business strategy.

**Outcome distribution — recalibration suggested**: the original 60/20/5/15 is directionally honest but slightly optimistic on "meaningful niche." More conservative range: **45% meaningful niche** (10-50K DL/wk at 18 months, brand halo intact, slower); **25% mid-tier reference migration** (one project with > 5K stars migrates and talks about it); **5% Big Tech migration** (unchanged, don't count on it); **25% nominal traction** (< 10K DL/wk, silvery becomes resumeware / background infra). Either calibration makes the strategy worth running. Adopt the more conservative number for internal expectations; keep the original for "sound without miracle" framing in external materials.

**Factual claims — verify before publishing**:

- "All big AI labs use Ink" → **overstated**. Verified for GitHub Copilot CLI and Cloudflare Wrangler (open repos). Anthropic's Claude Code and Google's Gemini CLI exhibit Ink-like behavior but their UI implementations are proprietary; we cannot publicly assert dependency. **Replace launch-post phrasing** with: *"Ink is the de facto standard for AI-era developer CLIs, including Copilot CLI, Wrangler, and a majority of the npx AI tool ecosystem."* Just as powerful, defensible.
- "Cloudflare Wrangler uses Ink" → **verify before quoting**. Some Wrangler tooling shifted to Rust as of v2; the Ink-using component may be limited. Check the actual repo before naming.
- "OpenTUI not conducive to Ink migration" → **demonstrate, don't assert**. Include a brief architectural comparison in the launch post (immediate-mode layout vs React reconciler with retained state) so the claim is visible from code, not from rhetoric.

**Ink upgrade risk** (Vadim Demedes): if Ink ships a major upgrade with multi-pane / mouse / partial-redraw support, the migration wedge collapses overnight. Mitigation: speed (the 3-6 month promo window is a race against Ink's roadmap, not arbitrary); architectural differentiation (silvery's long-term moat must be a fundamentally superior reconciler, plugin model, or multi-process rendering — features hard for Ink to retrofit). **Action**: weekly 15-min check on Ink's GitHub issues, roadmap, and Vadim's social for v5 signals. If a v5 alpha appears, accelerate launch by 2 weeks.

**The Seam Rule** (codify the open/closed boundary): write down the framework-vs-application heuristic in the silvery repo before contributors start asking for silvercode features.

**Two corrections (2026-04-27 night → 2026-04-28)** brought this rule to its final form. They're worth preserving as audit trail:

- **First correction**: an early draft cut at "generic vs agent-shaped." User flagged this as ceding the entire agentic-chat space to OpenTUI: the Ink-migration target users are *building agentic chat tools* (Claude Code, gemini-cli, Copilot CLI). If silvery doesn't ship agent UI patterns, those teams reach for OpenTUI or stay on Ink — migration story collapses.
- **Second correction**: the obvious next cut was "all client-side rendering open / services proprietary," with `<AgentChat>` and `<ConversationPane>` shipping in silvery. **Vercel's AI SDK** (11.9M weekly DLs, 23.8K stars, 620+ contributors) shows this is too generous. They explicitly kept polished UI components (`AI Elements`) **proprietary alongside** their cloud services, while open-sourcing only the *hooks* (`useChat`, `useCompletion`) and the streaming primitives. *"Deliberately minimal on opinionated UI"* is their phrase. Same shape on `chat-sdk.dev` — open platform-abstraction adapters, no pre-built stateful components. Vercel reserved the polished UI as a *separate moat* alongside services. We should too.

**Final canonical wording**:

> **Open in silvery**:
> - Generic primitives (`Box`, `Text`, `ListView`, `SelectList`, `TextInput`, `VirtualList`, `Tabs`, `Tree`, etc.)
> - Agent-domain **hooks** and state machines (`useAgentSession`, `useStreamingMessage`, `useToolUse`, `useRecall`, `useSquad`, `useHandoff`, `useContextSafety`)
> - **Unopinionated** primitive agent components: minimal `<Message>`, `<ToolCall>`, `<StreamingText>` — barebones rendering, BYO styling, useful as building blocks
> - All the rendering / interaction / state / theme / focus / mouse / layout machinery
>
> **Proprietary in silvercode (cluster-2 application)**:
> - **Polished, opinionated, branded** components (`<AgentChat>`, `<ConversationPane>`, `<SquadView>`, `<HandoffViz>`, `<ContextSafetyMonitor>`, etc.) — these embody silvercode's specific UX choices and are the *silvercode visual identity*
> - The integrated silvercode application (workflow, polish, brand)
>
> **Proprietary in cluster-2 services**:
> - Auth flows, secret management, cloud state, network protocols
> - Ambient-context-safety pipeline logic, hosted recall index, CrossAgentState orchestration, agentroom gateway runtime, multi-machine coordination
>
> **Tiebreaker test for any new component**: *does this embody silvercode's specific UX choices, or is it a generic building block any AI tool would reach for?* Generic building block → silvery. silvercode-specific → silvercode.

**Why this is the right cut** (validated against Vercel's data):

1. **Migration target stays complete**: an Ink-using AI tool team migrates and gets all the hooks + primitives they need. The actual migration pain in Ink isn't widget styling — it's streaming, focus, mouse, tool-use rendering, multi-pane state. Hooks + primitives cover all of that. Teams build their own polished UI on top, exactly like Vercel users do.
2. **silvercode's moat is fatter than services-alone**: polished components + services + brand + integrated assembly. Cursor's moat *is* partly the polished UI (the specific feel of message UX, smart inline diffs, what makes Cursor *Cursor*). Vercel proved at 11.9M DL/wk you can keep that proprietary while open-sourcing the heart.
3. **Vercel-shaped community dynamics**: open hooks become the standard for AI-tool builders in TS/React (silvery-equivalent of `useChat`); third parties build their own polished component sets (some open, some commercial); silvercode is the canonical-blessed implementation alongside silvery.
4. **No feature-creep-by-guilt**: when contributors ask "can silvery have `<AgentChat>`?" — the answer is "we ship the hooks and primitives; the polished branded `<AgentChat>` lives in silvercode." This is defensible because it's exactly what Vercel does.

Add a "Scope and Boundaries" doc to silvery's repo using this canonical wording. Add a GitHub issue label "Out of scope (lives in silvercode or cluster-2 service)" with a polite boilerplate pointing users to either the BYO-key path on silvery hooks, the silvercode integrated product, or the cluster-2 service.

**Terminfo data licensing**: do NOT attempt to relicense data derived from ncurses terminfo under CC0/ODbL. Either license could be invalid given upstream provenance. Safer path: publish the *transformation pipeline* under Apache-2.0; document how users fetch terminfo from upstream and transform locally; if hosting compiled artifacts, preserve original license notices (likely permissive-with-attribution, not ODbL). Verify upstream license before shipping.

**Trademark hygiene**: the "Ink" name belongs to its maintainers. Use **`@silvery/ink-compat`** as the package name (not bare "ink-compat"). Include a clear "not affiliated with Ink" disclaimer in README. Frame as "compatibility layer for migrating Ink apps," never as endorsement. Conference-talk angle softens from *"Why Ink is the wrong abstraction for AI-era TUIs"* (sharp but reads as patricide) to *"Beyond Ink: Why AI-native CLIs need a new rendering contract"* — succession, not attack. Vadim is well-liked; making silvery look like a hostile fork alienates the Ink community we're trying to recruit from.

**Don't preview silvercode while silvery is launching**: no "coming soon" teasers in the silvery README. No public references to silvercode from silvery repos. Keep them decoupled in public consciousness until silvery has independent credibility. The open-source community has an immune reaction to "vendor frameworks." If silvery has 6 months of authentic OSS evolution, reference projects, and Stack Overflow answers before silvercode appears, silvery gains legitimacy on its own. When silvercode launches later, its positioning becomes "the commercial IDE built on the open framework," not "the reason this framework exists."

**Flagship demo that is NOT silvercode**: a framework without a flagship is a spec. Within the first 6 weeks, ship one polished open-source app built on silvery that is *not* silvercode — `silvery-git-client` (multi-pane, mouse, async ops) or `silvery-system-monitor` (htop rebuilt with silvery to show performance and layout). Doubles as living documentation and implicit proof of capability.

**Migration Assurance Program (Option 6C bolt-on)**: layer on top of Option 5, not replacing it. Sell a paid program — *"guaranteed migration of one Ink app in 2 weeks with dedicated engineering support, plus prioritized feature work for gaps."* Converts awareness directly into revenue + high-signal references without gating code. Open 2-3 pilot slots at launch. Complements rather than complicates the OSS posture.

**Sequencing — silvery first, silvercode later — confirmed.** Run an early-access / waitlist for silvercode on day one of silvery's launch (capture interest, don't show product). Optionally: silvercode private beta with 3-5 design partners during silvery's promo window — marketing halo is stronger and we hedge against awareness-without-monetization. Public silvercode launch only after silvery has independent traction signal.

**Why no Option 6 wins** (challenger explored four alternatives, all rejected):

- **AGPL silvery**: toxic to AI labs and enterprise CLI tools — Ink is MIT, OpenTUI is MIT, AGPL exiles silvery from the target ecosystem.
- **BSL 1.1 with conversion**: works for databases and infra-as-a-service where "production use" is clear. For a UI framework, the threat model isn't competing SaaS — it's someone building a better IDE. BSL deters contributors and stifles plugin authors. HashiCorp's BSL experiment shows developers fork to true open licenses anyway.
- **Split Apache core + commercial advanced packages**: the seam doesn't exist (already established empirically). Manufacturing one for pricing produces a tortured codebase and unhappy users.
- **Fully closed with public source-available reference**: worst of both worlds — none of the community benefits, all of the support burden ("I can see the code, why won't you fix this?"), competitors can still study architecture.

The converged decision is robust against alternative license structures. Apache-2.0 + CLA is correct.

**Commit checklist** (from /pro):

1. Resolve the tribe contradiction in the executive summary (done above).
2. Specify the CLA: Harmony Individual + Entity, CLA-Assistant automation, "Why we use a CLA" explainer.
3. Scope `@silvery/ink-compat` explicitly as 80/20 bridge in deliverables — no reconciler hacks, no Static parity.
4. Adopt the dual review cadence (90-day qualitative + 180-day quantitative + 12-month strategic) with explicit kill/pivot criteria.
5. Set up weekly 15-min Ink-roadmap monitoring.
6. Codify The Seam Rule in silvery's repo before opening contributors.
7. Pick 3 candidate Ink projects (2K-15K stars) for the real-world migration, ranked by maintainer-engagement likelihood. Don't default to Wrangler.
8. Verify terminfo data provenance before picking dataset license.
9. Use `@silvery/ink-compat` (scoped) with "not affiliated with Ink" disclaimer.
10. Soften the conference-talk angle to "Beyond Ink" rather than "Ink is wrong."
11. Open 2-3 Migration Assurance Program pilot slots at launch.

Decision: **commit**. Stop deliberating. The strategy is sound, the matrix is clean, the window is closing. Execute.

---

## Why this doc exists

The user is genuinely re-evaluating posture — open to taking everything private if better business, or opening more if better long-term. The default-OSS-by-inertia policy that put silvery + tribe on MIT and km + silvercode in private repos is being audited.

## The /pro consensus (2026-04-27)

After /deep + /pro on the high-level OSS-vs-private question (sources: `/tmp/oss-vs-private-deep-result-2026-04-27.md`, `/tmp/oss-vs-private-pro-result-2026-04-27.md`), four AI voices (GPT-5.4 Pro, Kimi K2.6, Gemini 3 Pro, Grok 4) converged on rejecting the deep's BSL-with-30-month-conversion recommendation. The unified position:

### Pick a lane. Don't hedge.

- **Path A — Cursor-style fully proprietary**: silvercode + km closed; compete on UX/execution; raise on SaaS narrative.
- **Path B — Confluent/Red-Hat/GitLab-style open core**: silvercode core Apache-2.0; proprietary cloud services (ambient-context-safety, credentials broker); km fully proprietary; raise on open-engine + paid-cloud narrative.

Both are *fundable*. Cursor proves Path A; MongoDB/Confluent prove Path B. **Mixed-posture (BSL or AGPL+commercial) is the worst capital-strategy outcome** — gets $8M seeds from generalist VCs lacking conviction, not $900M rounds from category specialists.

### Why /pro killed BSL specifically

1. **HashiCorp/Elastic comparables don't apply.** Those were *server-side data infra* with hyperscaler-rent risk. silvercode is *client software* (desktop shells + agent host). No AWS-RDS-cloning threat exists for an IDE/agent host. BSL solves a problem we don't have.
2. **Day-0 BSL is psychologically worse than reactive flip.** HashiCorp got ferocious backlash *despite* a decade of Apache trust accumulated first. Silvercode has zero trust cushion. Contributors refuse BSL repos; enterprise procurement pauses; standards bodies ignore non-OSI projects.
3. **The 30-month conversion clause is "the worst of both durations."** Too long for community trust (agent tools cycle in 12-18 months), too short to defend a wedge against fast competition. No canonical example of a dev-tool company honoring such a clause on schedule.
4. **The real comparables (Cursor, VS Code, Zed, OpenCode, Continue) don't use BSL.** None of them. The IDE/agent-host space has no parasitism problem solvable by BSL.
5. **Mixed posture has fundraising negative-correlation.** Cursor raised $900M with a crisp closed story; MongoDB raised at IPO with a crisp open story. BSL signals "we don't believe our services moat is real." Hedges underprice.

### Key /pro factual catches on the deep

- **AAIF formation date**: deep said "late 2025"; actual date **October 25, 2024** (Linux Foundation press release).
- **Cursor $50B Bloomberg March 2026 talks**: rumor-grade; treat as fiction unless filed.
- **OpenHands Series A**: deep said "$18.8M Nov 2025"; one /pro voice cites $50M led by Menlo. Conflicting; verify before citing.
- **MongoDB Atlas 70%+**: actual FY2024 was 63%; ~65-68% in FY2025 Q1-Q3; 70% is forward projection.
- **Redis 8 + AGPL**: Redis 8 doesn't exist yet at model knowledge cutoff.
- **Pattern**: deep cited several specific numbers as if filed, when they were extrapolations or hallucinations. Verify before quoting.

## RECOMMENDED POSTURE (recalibrated 2026-04-27 evening): the two-cluster model

After the user's three new data points (45:1 silvery-leverage, no-showcase-yet, silvercode possibly going proprietary) and the second /pro pass (Kimi: *"silvery must close or be donated"*), the recommended lane is **the two-cluster model**, not the original Path A or Path B.

### Cluster 1 — Open Terminal R&D (cross-promotional)

**Brand identity**: "We make serious terminal infrastructure."
**Pattern**: Charm.sh ships Bubble Tea + Glamour + Lip Gloss as open, monetizes Crush + hosted services.
**Cross-promotion**: silvery uses termless for testing; termless uses terminfo for capability detection; terminfo's data informs silvery's terminal detection. Each package's docs can link to the others.

Packages in cluster 1 (all Apache-2.0 + CLA):
- silvery (the framework)
- @silvery/ansi, /color, /commander
- flexily (supports silvery's multi-target)
- @termless/core, /cli, /test + top adapters (xtermjs, kitty, wezterm, libvterm)
- vt100.js, vt220.js, vterm.js (zero-maintenance, support termless)
- terminfo.dev (Apache code + CC0 or ODbL data)
- loggily (per user: "no problem to maintain, generally nicer to work with")
- vimonkey (small, niche)
- alien-projections, /resources, /trees (general-purpose reactive primitives)
- mdspec, vitepress-enrich (maintenance mode or donate)

### Cluster 2 — Proprietary AI Product (cross-promotional)

**Brand identity**: "We make agentic knowledge work."
**Pattern**: Cursor + Linear + Notion — coherent commercial product line, paid SaaS.
**Cross-promotion**: km is the workspace, silvercode is the coding surface inside km, tribe coordinates the swarm across panes, cloud services monetize the value.

Cluster 2 (proprietary):
- silvercode (the coding agent host application code)
- **silvercode-internal silvery extensions** (multi-pane host primitives, focus-per-pane, ambient channel rendering, file-claim viz, two-region composer base components — *the bits that made silvercode 2 days*). NOT published as separate npm packages. Lives in `apps/silvercode/src/silvery-extensions/` inside the private monorepo.
- km (the workspace)
- tribe (going forward; last MIT version stays on npm so existing users aren't broken)
- Cloud services (ambient-context-safety, credentials broker, hosted agentroom gateway)
- Private @beorn/* (accountly, tap, watcher-chaos), claude-tty-mcp

### Bridge: agentroom gateway

agentroom is the public-facing interface between cluster 2 and the open world. Speaks tribe internally (cluster 2 substrate) and Matrix externally (cluster 1's posture). Implementation Apache-2.0; paid managed gateway is cluster 2 revenue.

This means tribe-the-internal-substrate is private, but agentroom-the-bridge is open. Standards adoption via Matrix; differentiation via the hosted gateway service tier.

### How this resolves the 45:1 problem

The bits of silvery that gave silvercode 2-day leverage live in the **silvercode private monorepo as `silvery-extensions`**, not as published `@silvery/*` packages. A competitor cloning silvercode can `npm install silvery` to get the general framework but still has to rebuild the multi-pane host primitives, focus-per-pane, ambient channel rendering, file-claim viz, etc. from scratch. The cloning cost goes from "2 days" back to "weeks-to-months." This is the **Cursor pattern** — VS Code open, Cursor's AI extensions proprietary.

### How this resolves the showcase loop

silvery still gets a showcase, just not silvercode itself:

1. **Cluster 1's cross-promotion is its own showcase.** silvery + termless + terminfo as an "open terminal R&D" cluster creates legitimacy without requiring silvercode to be open.
2. **silvercode-as-product creates indirect awareness for silvery** through demo videos, "built with silvery" badging, blog posts. Cursor → VS Code precedent: you can drive framework awareness through a closed product.
3. **A small deliberately-open companion showcase**: ship a multi-pane todo app or "silvery starter" that demonstrates the framework's capabilities *without* exposing silvercode-specific primitives. Marketing-only.

### Revenue compounding

Cluster 1 doesn't directly monetize. It produces:
- Recruiting credibility
- Trust signal for cluster 2
- Adoption surface (silvery users → cluster 2 prospects)
- Open-source brand goodwill

Cluster 2 monetizes:
- silvercode subscriptions/seats
- km cloud + paid sync/collab
- Hosted agentroom gateway (BYOK + audit + SOC2)
- Ambient-context-safety SaaS (token-savings metered)
- Credentials broker (enterprise certifiable)

### What this changes from the original Path B framing

| Element | Original Path B | Two-cluster model |
|---|---|---|
| silvercode license | Apache-2.0 + proprietary cloud | Fully proprietary |
| silvery license | Apache-2.0 (framework) | Apache-2.0 (framework) — unchanged |
| silvercode-specific silvery primitives | Were ambiguous | **Inside silvercode's private monorepo, not separate packages** |
| tribe license | Apache-2.0 + CC BY 4.0 spec | **Future versions proprietary; last MIT on npm; agentroom is the open public bridge** |
| km | Proprietary | Proprietary — unchanged |
| Capital story | "Confluent-style" | "Cursor-style with open infrastructure halo" |

### When to revisit (the "contributing back" tripwire)

When silvercode + km cloud services exceed **$100k ARR** (Grok's bar), revisit:
- Could silvery's proprietary primitives be open-sourced as goodwill?
- Could tribe be donated or made spec-with-paid-impl?
- Stripe pattern: open from a position of revenue strength, not from seeking adoption.

## The recommended posture (Path B, /pro majority pick) — superseded

silvercode's three actual moats — ambient-context-safety, CrossAgentState, subscription-auth-as-first-class — are all **services moats**, not **code-secrecy moats**. None requires BSL or proprietary code to defend.

| Moat | Defensibility under Apache-2.0 silvercode | Verdict |
|---|---|---|
| Ambient-context-safety | Service moat — proprietary backend (vector indexing, ML guardrails, cost controls). Open the SDK; sell the API metered by tokens-saved. | **Stays moat.** License of client doesn't matter. |
| Subscription-auth-as-first-class | Trust/compliance moat — enterprises pay for SOC2, audit trails, vendor integrations. Open-source the *client-side* broker; sell the hosted certifiable backend with SLAs. | **Stays moat.** Operationally hard, not code-secret. |
| CrossAgentState | Protocol moat — protocols only become standards when *unencumbered*. Apache + a spec (Kubernetes / GraphQL pattern) lets you own the standard. **BSL ensures rivals fund a clean-room "OpenAgentState" within months.** | **Apache STRENGTHENS it; BSL kills it.** |

The deep diagnosed the moats correctly and prescribed the wrong drug.

## Per-layer posture (high-level)

### silvery (currently MIT) — RECALIBRATED 2026-04-27 with empirical data

**Critical data point from the user (2026-04-27)**: silvery took **3 months to develop**; silvercode took **2 days** because it was built on silvery. That's a **~45:1 leverage ratio**. The framework is not "an adoption surface providing ~20% of the work" (the lazy framing); it is **~98% of the heavy lifting** for any silvercode-shaped product.

This empirically defeats the deep+pro framing that "silvercode's moat lives in application code." If anyone with silvery + 2 days of ACP-wiring effort can replicate silvercode's structural primitives, then **silvery itself is the strategic asset** — not silvercode's app code.

The previous "stay open, Apache-2.0+CLA" recommendation was built on the assumption that silvercode has substantial application-layer differentiation that silvery doesn't provide. The 45:1 ratio inverts that.

**Recommendation: genuinely contested. Three viable paths, all materially different.**

#### Path S1: silvery fully proprietary (closure)

- Future versions closed; existing MIT versions live on (irrevocable)
- A fork of last-MIT-silvery may emerge (OpenSearch/OpenTofu/Valkey precedent), but silvery's distribution is small (~3K DL/wk) — fork needs community demand that may not exist
- Cost: brand/recruiting/AAIF-friction (real but bounded by small community)
- Benefit: future improvements (canvas/DOM targets, advanced features) stay private — keep the 45:1 leverage exclusive
- **Choose if**: user is genuinely concerned about competitive cloning (the user's stated concern), and silvery's roadmap has substantial unshipped value (canvas + DOM targets) worth protecting

#### Path S2: layered moat — silvery core open, silvercode-specific silvery components proprietary

- **Open (Apache-2.0)**: `silvery` core barrel, `@silvery/ansi`, `@silvery/color`, `@silvery/commander`, basic components (SelectList, TextInput, VirtualList, theme, focusScope)
- **Closed (proprietary or BSL-with-conversion)**: `@silvery/host` (or whatever package contains the multi-pane primitives, focus-per-pane, ambient channel rendering, file-claim viz, two-region composer base components — the silvercode-specific bits)
- Public silvery is "build any TUI"; proprietary silvery extensions are "build a multi-agent host like silvercode"
- Requires careful identification of *which* silvery bits enabled the 2-day silvercode build. If the 2 days mostly consumed multi-pane primitives + focus scopes + composer components, those become the proprietary tier.
- **Choose if**: user wants to keep silvery's adoption surface intact for general TUI building, but specifically protect the multi-agent-host primitives that gave silvercode the 45:1 leverage

#### Path S3: silvery stays Apache-2.0 + accept commoditization, monetize elsewhere

- Apache-2.0 + CLA, treat silvery's framework lane as commoditizing fast
- Lean on silvercode's *services moats* (subscription auth, credentials broker, ambient-context-safety cloud) as the actual revenue line — not on silvery or silvercode app exclusivity
- Race to ship the cloud services and brand them before competitors clone the host shape
- **Choose if**: confident the services moats (especially subscription-auth-as-first-class) are themselves strong enough to defend against silvercode-clones. Bet on services + execution velocity, not framework exclusivity.

**The user's specific concern, validated**: *"if we make silvery open then others can more easily build a silvercode"* — empirically true given the 45:1 ratio. The deep's pushback ("framework adoption > secrecy") is still directionally correct for *most* frameworks but doesn't apply when leverage is this high.

**Open questions to resolve before committing**:
1. Of the 3-month silvery development, how much was *silvercode-specific* (multi-pane host, ambient channel rendering, focus-per-pane) vs *general TUI* (SelectList, theme, layout)? If <30% is silvercode-specific, Path S2 is the surgical fix. If >70% is, Path S1 becomes more attractive.
2. What's silvery's roadmap for the next 12 months? If canvas/DOM targets ship, the leverage compounds further — Path S1's value of keeping that exclusive grows. If silvery is mostly stable terminal-only, the leverage is what it is and Path S2 captures most of the protection.
3. Empirically, is silvery's MIT distribution generating any community gravity, or is the 3K DL/wk mostly silvercode + km + bjørn's other projects calling it? If essentially zero external use, closing it costs nothing because there's no community to lose.

**Pending /pro on these specific questions** — the second-pass /pro fired 2026-04-27 with the silvery-proprietary steelman explicitly requested. Will fold its finding into this section.

### tribe (currently MIT) — recalibrated 2026-04-27

tribe is potentially **the core of the swarm/ACP system**, not "just a coordination bus." It's the substrate where silvercode's CrossAgentState lives, where agentroom's cross-machine event flow runs, where the entire multi-agent swarm thesis is implemented. Closer to "the protocol that wins or loses the standardization war" than to "an adoption surface."

**Recommendation**: keep open with three explicit layers, each with appropriate license:

1. **tribe wire protocol + JSON-RPC bus** → **Apache-2.0**. The commodity transport layer. Standardization play. Goal: become the boring default for cross-session coordination, picked up by Continue/Kilo/OpenHands/OpenCode for interop.
2. **`org.agentroom.*` event vocabulary + spec** → **CC BY 4.0** with neutral foundation governance (Matrix.org or AAIF). The semantic-standard layer. This is the Kubernetes-pods-style asset — the *vocabulary* is what wins the standardization war, not the wire protocol.
3. **agentroom gateway reference implementation** (uses tribe + vocabulary + adds Matrix bridging + vault projection + sub-agent edge-compute) → **Apache-2.0 ref impl + paid managed cloud**. The Confluent-Cloud / MongoDB-Atlas equivalent. Monetize hosted gateway (BYOK, audit, SOC2, sub-agent platform), not source code.

**Why all three open layers**: protocols are *weakest as moats and strongest as standards*. Closing tribe makes it useless as a standard *while* failing to prevent competitors — they'll build on ACP A2A directly or invent their own bus (cross-session JSON-RPC over UDS isn't hard). The Kubernetes/GraphQL/MCP precedent: every meaningful protocol that won did so by being unencumbered. Closing the swarm protocol is the *worst* move — prevents standardization without preventing competitors.

**What stays proprietary** (the actual moat layers):
- silvercode's specific use of tribe (CrossAgentState integration + ambient-context-safety framing) — lives in `apps/silvercode/src/`
- agentroom hosted service tier — compliance, sub-agent edge compute, observability dashboards, multi-tenant isolation
- Cloud services that consume tribe events (ambient-context-safety, credentials broker)

**Cross-reference**: this layering is the same shape that the [agentroom ventures](../../ventures/acp-proxy-2026-04-27.md) #11/#12/#13/#14 collapse into. The deep+pro analyses converge on Apache+CC-BY+Cloud-Services as the right substrate posture.

### km (currently private)

**Recommendation**: stay **fully proprietary**. **Notion / Linear pattern, NOT Obsidian pattern.** Open Markdown export schema as portability hygiene; no plugin SDK obligation.

**Reasoning** (per /pro Kimi + Gemini push-back on the deep's Obsidian framing):
- Obsidian is a one-person bootstrapped local-markdown app, pre-AI. Founder Steph Ango (2019). $5/mo sync. Survivorship bias.
- AI-native workdesks need cloud inference, embeddings, model routing, identity/secret brokering, team workspace semantics, compliance — none of which run on a local laptop. Different cost structure.
- Real comps: **Notion ($10B+, closed and proprietary data) and Linear (closed)**, not Obsidian.
- Logseq's AGPL struggle is product (sync reliability, mobile polish), not licensing. Anytype's BUSL struggle is UX maturity. License doesn't determine workspace adoption.

The "open client + open data" framing creates expectations of community contribution silvercode/km can't sustain at this scale. Better to be unambiguously proprietary with markdown export as a trust signal.

### silvercode (currently private)

**Two clean lanes** (the /pro position — pick one, don't hedge):

#### Path A: fully proprietary
- silvercode core: closed
- Plugin SDK (if any): Apache-2.0 (so OSS hosts can embed our adapters)
- Cloud services: closed, paid
- **Choose if**: confidence in Cursor-class execution velocity + distribution; want hypergrowth fundraising narrative.

#### Path B: Apache-2.0 + proprietary cloud services (/pro majority recommendation)
- silvercode core (squad/CrossAgentState engine, the pane host): **Apache-2.0** with patent grant + DCO
- Plugin SDKs: Apache-2.0
- Specs (CrossAgentState protocol, ambient-channel framing): CC BY 4.0
- Proprietary cloud services: ambient-context-safety SaaS (token-savings metered), credentials broker (BYOK + audit + vendor SLA), team RBAC, hosted agentroom gateway
- Enterprise UI shells, team RBAC: closed
- **Choose if**: confidence in services moats + standards leverage; want Confluent/MongoDB IPO-shape narrative.

**Default to Path B** unless explicit reason to choose Path A. Reasoning:
- silvercode's three actual moats are all services
- Multi-backend identity is preserved
- AAIF-era standards gravity (October 2024 onward) favors open-source engines
- Path B keeps both fundraising lanes open longer (can pivot to Path A if execution velocity emerges)

**Not BSL.** Not under any condition. The /pro pass is unanimous.

### agentroom gateway (planned, not yet built)

**Recommendation**: **Apache-2.0** reference impl + **CC BY 4.0** spec. Pursue **neutral foundation governance** (Matrix.org or AAIF) **before** silvercode commercial launches.

**Reasoning**: agentroom is the highest-network-effect asset in the portfolio (24/25 on the ventures rubric). It must look like *infrastructure*, not a moat. Cannot be a "BSL trojan horse" — if silvercode were BSL, rival hosts would treat agentroom as hostile (an attempt to own the rails while taxing the train). Path B aligns; Path A doesn't conflict.

Monetize a **paid managed gateway** (BYOK, audit, SOC2, isolation, compliance reports) — the Confluent Cloud / MongoDB Atlas pattern.

## Section 5: Per-package portfolio (PENDING)

We own ~62 packages on npm under maintainer `beorno`, plus several private vendor packages. A second /deep + /pro pass is in flight specifically on this question. Will update this section when it returns.

**Pre-research provisional view** (subject to revision):

- **silvery ecosystem** (12 packages) — likely Apache-2.0; potential dual-license question for the main barrel
- **tribe + bearly tools** (4 packages) — Apache-2.0
- **flexily, loggily, vimonkey** — Apache-2.0 (foundation, not strategic)
- **termless** (15 packages) — likely Apache-2.0; possible "termless cloud" hosted CI as commercial wedge
- **vterm/vt100/vt220** — likely deprecate or donate; xterm.js dominates
- **mdspec, vitepress-enrich** — Apache-2.0; may donate
- **terminfo.dev** — likely public-good Apache + ODbL (data); possible commercial wedge for verified-data tier
- **alien-* (projections, resources, trees)** — Apache-2.0 (small, strategic for reactive-primitives positioning)
- **private @beorn/* packages** — keep proprietary

The bigger question for Section 5: **62 packages is a lot of maintenance surface**. Some should probably be deprecated, donated, or merged. The deep is asked to identify which packages are strategic vs adoption-surface vs commodity-we-shouldn't-maintain.

**Tracking bead**: `km-all.silvery-packages-licensing-2026-04-27` (pending /deep response).

## Tripwires

When to revisit posture:

### Path B → Path A (close silvercode)
Trigger if: a third-party launches a commercial silvercode-as-a-service AND >10-15% cannibalization for 2+ consecutive quarters AND <1% upstream contribution. Even then prefer business tactics (better managed offering, partnerships) over license flips. Reactive flips trigger foundation forks (OpenSearch, OpenTofu, Valkey precedents) within weeks.

### Path A → Path B (open silvercode)
Trigger if: AAIF/MCP/ACP standards consolidation accelerates AND silvercode is excluded from default stack conversations because it's closed AND a competitor (Kilo, opencode-with-coordination, Continue) ships a credible Apache squad-mode equivalent. This would force opening to stay relevant.

### km → opening
Trigger if: plugin ecosystem demands more guarantees, OR community help is needed on sync engines, OR fundraising requires "open" story. Even then keep client proprietary; open the sync engine/spec only.

### agentroom → tightening
Don't tighten. If anything, donate to a foundation faster if Anthropic/OpenAI/Kilo/Continue request neutral control. Stay infrastructure-shaped.

### silvery → revisit on deep return
Awaiting per-package deep dive. The question of whether silvery itself should go proprietary is genuinely contested — small distribution, framework layer commoditizing, adoption hasn't compounded as expected. Will update when deep returns.

## Capital strategy

### Path A pitch
*"We are the best proprietary AI agent host. Revenue is subscription SaaS + enterprise. Multiples are SaaS."*
- Target: top-tier devtools VCs (a16z, Sequoia, GC, Khosla)
- Comp: Cursor at $9.9B
- Demands: Cursor-class execution velocity + distribution

### Path B pitch
*"We are the open-source agent host. Revenue is managed cloud services (ambient-context-safety, credentials broker, hosted agentroom). Multiples are infra SaaS."*
- Target: open-source devtools VCs (Cota, Heavybit, Decibel, OSS Capital)
- Comp: MongoDB ($Atlas ~70% of revenue at FY2025-26), Confluent (Cloud-driven IPO), GitLab ($10B+ IPO)
- Demands: services moat must be real and demonstrable

### Don't pitch mixed
*"BSL-now, Apache-later, sort-of-open, sort-of-closed"* — undefined narrative, generalist VCs only, $8M seed-shaped.

## Acquirer scenario

If the goal is sale to a strategic acquirer (Anthropic, GitHub/Microsoft, Vercel, OpenAI) in 24-36 months, both paths work but with different acquirers:

- **Path A acquirers**: GitHub (Copilot product fit), JetBrains, Google (gemini-cli expansion). Want clean closed IP.
- **Path B acquirers**: Anthropic (MCP ecosystem owner), Cloudflare (workers-for-agents fit), Datadog (observability adjacency). Want infrastructure IP with permissive licenses to integrate.

**Mixed-posture acquirers don't really exist.** Acquirers want to either absorb a clean closed product (Path A) or absorb an infrastructure project they can integrate (Path B). BSL is a tax during diligence either way.

## What does NOT matter for this decision

- **Star counts** — gameable, marketing metric.
- **OpenRouter routing volume** — routing-incentive leaderboard, not market share.
- **Hype around the next month's "consolidation winner"** — too volatile to act on.
- **Sentimental attachment to existing licenses** — relicensing forward versions is legal and routine. Don't be sentimental.

## What DOES matter

- **Confidence in services moats** (ambient-context-safety, credentials broker as commercial wedges, not just features)
- **Velocity of execution** (Path A's prerequisite; can you outrun Cursor in your slice?)
- **Capital appetite** (Cursor-style needs $50M+ in 18 months; MongoDB-style can run leaner)
- **Founder-led narrative discipline** (can you tell a clean story to 50 investors without confusion?)

## Decision rule (one paragraph)

**If you have or can credibly project Cursor-class execution velocity and want hypergrowth fundraising → Path A (fully proprietary silvercode + km, silvery+tribe stay Apache).** **If you have services-moat conviction + want IPO-shape eventually → Path B (Apache silvercode + proprietary cloud services + proprietary km, silvery+tribe Apache).** **If you can't decide between A and B yet, you're not ready to decide — and BSL is not a substitute for deciding.** Run the silvercode squad mode wedge for 90 days; the validation result will inform which lane is correct.

## Cross-references

### Upstream / vision
- [`hub/km/design/vision.md`](vision.md) — workspace vision (workdesk frame)
- [`hub/km/design/integrated-workdesk.md`](integrated-workdesk.md) — execution plan; this licensing-strategy doc is referenced from there

### Related strategy
- [`hub/silvercode/future/ai-terminal/silvercode-squad-mode.md`](../../silvercode/future/ai-terminal/silvercode-squad-mode.md) — the validated wedge
- [`hub/silvercode/future/ai-terminal/02-agent-integration.md`](../../silvercode/future/ai-terminal/02-agent-integration.md) — ACP-not-fork decision (separate from silvercode license posture)
- [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md) — agentroom ventures (24/25)
- [`hub/silvery/research/coding-agent-landscape.md`](../../silvery/research/coding-agent-landscape.md) — competitive context

### Research artifacts (2026-04-27)
- `/tmp/oss-vs-private-deep-context-2026-04-27.md` — context for high-level deep
- `/tmp/oss-vs-private-deep-result-2026-04-27.md` — high-level deep result (251 lines, ~$2-5)
- `/tmp/oss-vs-private-pro-result-2026-04-27.md` — high-level /pro result (559 lines, $1.85)
- `/tmp/silvery-and-packages-deep-context-2026-04-27.md` — context for per-package deep (in flight)
- (pending) `/tmp/silvery-and-packages-deep-result-2026-04-27.md` — Section 5 will pull from this
- (pending) `/tmp/silvery-and-packages-pro-result-2026-04-27.md` — /pro enrichment of Section 5

## Tracking beads

- `km-all.oss-vs-private-2026-04-27` — high-level layer plan analysis (this doc derives from)
- `km-all.silvery-packages-licensing-2026-04-27` — per-package analysis (Section 5 pending)

## Bottom line

The /pro-vetted recommendation is **Path B (Apache silvercode + proprietary cloud services + proprietary km)** unless explicit reason to pick Path A. The decision is not urgent — license posture can be set when silvercode commercial launch happens, not before. **What matters today**: don't accidentally entangle silvercode-specific logic into silvery/tribe (preserves the option to open silvercode later without dragging the framework with it), and don't ship anything to npm under BSL while indecisive (pre-commits to a posture /pro flagged as worst-of-both-worlds).

Section 5 will fold in per-package recommendations when the silvery+packages deep returns. That research is specifically asked to argue both sides on whether silvery itself should go proprietary.
