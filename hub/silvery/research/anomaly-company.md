# Anomaly — company behind OpenTUI and opencode

_Internal competitive research. Captured 2026-04-15. Re-verify numbers before quoting._

## One-line summary

**Anomaly** (formerly **SST / Serverless Stack**) is the small-team open-source company behind `opencode` (~144k GitHub stars, AI coding agent) and `OpenTUI` (~10k stars, terminal UI framework). Founded by **Jay V** (CEO) and **Frank Wang** (CTO) in 2017, went through **Y Combinator in 2021** with their SST framework, and pivoted to AI coding agents in **June 2025**. OpenTUI was spun up in **July 2025** specifically to replace opencode's original Go/Bubble Tea TUI. Small team, open-source first, profitable, cult community, zero enterprise bloat.

## Identity and brand

- **Legal / historical name**: Anomaly Innovations (founded 2017, originally an "application development platform for start-ups", ICUBE UTM graduate team).
- **Famous name**: **SST** / Serverless Stack — their second product and the thing most developers knew them for from 2020-2024.
- **Current name**: **Anomaly** — rebrand complete. The `sst` GitHub organization now redirects to `anomalyco`: _"We've moved to https://github.com/anomalyco"_. All new repos (opencode, opentui, etc.) live under `anomalyco`.
- **Domain**: `anoma.ly` — short, memorable, on-brand.
- **GitHub org**: `github.com/anomalyco` — created 2020-06-07 (likely reserved early; activated as the primary org during the 2025 rebrand). 65 public repos.
- **Twitter/X**: `@anomalyco`.
- **Email**: `hello@anoma.ly`.
- **Tagline**: "For whatever you build."

The rebrand from SST → Anomaly is cosmetically clean and narratively consistent with the pivot from "serverless framework company" to "open-source coding agent company" — they wanted the parent brand unshackled from AWS/serverless associations.

## Founders and team

### Core founders

- **Jay V** — CEO. Co-founder of Anomaly Innovations (2017), co-founder of SST, CEO of opencode. Now leading the coding-agent business.
- **Frank Wang** — CTO. Co-founder of Anomaly Innovations (2017), co-founder of SST. Engineering lead through both SST and the opencode pivot. Previously referenced as "Founder at SEED.run" — another earlier project.

### Joined for opencode (2025)

- **Dax Raad** (`thdxr` on GitHub/npm/X). Early SST user → community lead / developer advocate → core contributor → co-founder on opencode. Dax is the **public face** of both SST and opencode: runs SST Weekly streams, writes most of the developer-facing docs, and is the most visible name in the ecosystem. His GitHub handle `thdxr` appears as a maintainer on `@opentui/core` npm package. He is the nearest thing the project has to a Guillermo Rauch / Evan You style community figurehead.
- **Adam Elmore** — AWS Hero and indie hacker. Hosts `AWS FM` podcast. Joined as a co-founder on opencode in June 2025. Connections across the AWS / serverless independent community.

### Other visible contributors

- **`kommander`** and **`fanjie`** — listed as npm maintainers on `@opentui/core` alongside `thdxr`. Likely engineers on the OpenTUI native core (Zig + C ABI).

Team size is small — public sources don't give a headcount, but the contributor surface on opencode and OpenTUI suggests **well under 20 people**, possibly under 10. This is a lean operation.

## Product history

### Phase 1 — Anomaly Innovations (2017-2020)

- Founded 2017 by Jay V and Frank Wang.
- Described as an "application development platform for start-ups". Graduated from ICUBE (University of Toronto Mississauga's incubator).
- Pre-SST. Little public footprint today.

### Phase 2 — SST / Serverless Stack (2020-2025)

- **SST** (Serverless Stack) is an open-source framework for building full-stack serverless apps on AWS.
- Launched ~2020 as a guide, became a CLI/framework, grew from there.
- **Y Combinator** — Summer 2021 batch (S21). **Raised $1M seed round** post-demo-day from Y Combinator, Greylock, SV Angel, and angels including "founders of PayPal, LinkedIn, Yelp, and YouTube" (reported by TFN / Dev Genius / Technori). Total funding raised across two rounds: ~$1.12M (Crunchbase).
- Grew the `sst` GitHub repo to **25.8k stars** (today's snapshot on the now-archived org).
- Shipped **SST Ion** (2024-ish) as the successor CLI/framework — eventually merged back into the main `sst` repo.
- Ran SST Weekly streams, built a community of serverless developers, cultivated Dax Raad as the community lead.
- **Turned profitable in 2025** (per TFN reporting).

SST is often cited as one of the _few_ developer-tool open-source companies that reached profitability on a small seed round without subsequent venture rounds. It's the blueprint for "small team, open-source core, sustainable business" in the JS-devtools world.

### Phase 3 — opencode + OpenTUI + Anomaly (2025-present)

- **June 19, 2025**: **opencode** launched. Open-source AI coding agent. Co-founders: Jay V, Frank Wang, Dax Raad, Adam Elmore.
- **July 21, 2025**: **OpenTUI** repo created. Purpose-built TypeScript-over-Zig TUI framework — replaces opencode's original Go / Bubble Tea TUI with an in-house framework the team controls.
- **H2 2025**: opencode goes vertical. Per TFN / technori.com / blog.devgenius.io reporting:
  - **650,000 monthly active users within 5 months** of launch.
  - **~50,000 GitHub stars in 5 months** (we measured ~144k on 2026-04-15, so it kept compounding).
  - **"Several million dollars in annualized revenue"** via `opencode Zen`, their hosted-model offering.
  - Enterprise adoption cited: **Cloudflare** among users.
- The `sst` GitHub org now fully redirects to `anomalyco`. SST repos are still maintained but the company's center of gravity has moved to opencode.
- Current open-source numbers (verified via `gh api`, 2026-04-15):
  - `anomalyco/opencode`: **143,844 stars**, TypeScript, ~297k LOC monorepo, 507 forks on OpenTUI specifically.
  - `anomalyco/opentui`: **10,380 stars**, TypeScript + Zig, 136 open issues, pushed daily.

### Public funding status

As of reporting available through early 2026, **Anomaly has not publicly disclosed a Series A**. The company is operating on the original ~$1.12M seed plus opencode Zen hosted-model revenue. Given the reported "several million ARR" and the trajectory, they may be:

- Intentionally bootstrapped / indie-scale (consistent with profitability in 2025)
- In the middle of a quiet raise (their investor list suggests they have warm access to tier-1 capital if they want it)
- Sitting on an offer and waiting (the AI-agent space is frothy; valuations are extreme)

Any of these is plausible. Treat "no new round disclosed" as the current public fact, not as confirmation the company is boring or starved.

## Business model

### Open-source core

- **opencode** — MIT licensed, fully open-source, self-hostable. Users can bring their own model API keys (Anthropic, OpenAI, Google, AWS Bedrock, Azure, Cohere, Mistral, xAI, Groq, 15+ providers in `packages/opencode/package.json`).
- **OpenTUI** — MIT licensed. `@opentui/core` + `@opentui/solid` + `@opentui/react` on npm, native Zig core shipped as per-platform prebuilt binaries.

### Commercial layer — opencode Zen

- **opencode Zen** is Anomaly's hosted inference / managed model offering. Users pay for routed model calls through Zen instead of wiring up their own provider keys.
- Framing: "easy button" for teams who want opencode without managing 15+ provider accounts. Also gives Anomaly a revenue hook without putting the agent itself behind a paywall.
- **Several million USD ARR** reported in 2025 (per public TFN / Dev Genius / Technori reporting). This is remarkable for a free-first open-source tool on a small seed round.

### What they explicitly _don't_ monetize (today)

- The OSS agent is fully functional without Zen.
- No enterprise tier visible in the main repo (there's an `enterprise/` package in the monorepo but it's slim).
- No paid plugins, no paid models, no paid storage.

This is the SST playbook applied to AI agents: keep the OSS thing free and genuinely useful, run a hosted service for people who want convenience, let enterprise adoption pull on the hosted thing organically.

## Competitive positioning

### Why opencode beat the incumbents

From public reporting and the repo, the reasons opencode won mind-share in H2 2025:

1. **Multi-provider from day one.** 15+ model providers (Anthropic, OpenAI, Google, AWS Bedrock, Azure, Vertex, Groq, xAI, Perplexity, Cerebras, Mistral, etc.). Users aren't locked into Anthropic, unlike Claude Code; or Google, unlike Gemini CLI.
2. **MIT license + self-hostable + no telemetry requirement**. Meaningful for developers and enterprises worried about IP leakage via closed coding agents.
3. **TypeScript monorepo, Bun runtime** — modern, fast, reads like production code. Not a research artifact.
4. **Desktop + web + CLI + TUI + Slack + extensions** from a single codebase (Tauri, Next.js app, Hono server, SolidJS TUI, Slack bot, VS Code / JetBrains extensions in the same repo). Anyone can meet their users where they are.
5. **Strong community DNA** inherited from SST — they already had a developer-facing tradition (SST Weekly, Dax Raad's personality, YC-alumni network).
6. **OpenTUI as a "we control the framework" story** — unlike rivals that ship Bubble Tea or Ink, opencode controls its own rendering stack and can ship anything they want in the terminal.

### Weaknesses / risks (candid)

- **Mixed-scope monorepo**: opencode's repo carries a lot (desktop, web, Slack, enterprise, extensions). Some of that surface is shallow, and shipping all of it well is hard with a <20-person team.
- **OpenTUI is young**: v0.1.99 at 2026-04-15. Native Zig core, per-platform binaries, breaking changes plausible. Silvery is also young but has a different testing/correctness story.
- **Hosted-inference margins are fragile**: if model prices drop or providers tighten their TOS, opencode Zen's unit economics can move quickly.
- **Enterprise GTM is not their strength**: Jay and Frank come from an OSS-framework / developer-advocate tradition, not from enterprise sales. Their revenue number suggests this is working _for now_, but scaling into enterprise at the level that justifies a Series A is a different muscle.
- **Model bundling vs. neutrality**: opencode's multi-provider pitch is strong today. As "agents with their own models" becomes the norm, the neutral-host story may become less interesting.
- **Name collision**: "opencode" is generic; "Anomaly" is also generic. Both are hard to SEO and defend as brands. Compare to "Cursor", "Claude", "Windsurf" — distinctive, trademarkable, easy to Google.

## What this means for silvery / km

1. **Silvery is competing with a YC-backed, profitable, community-native company**, not a random weekend project. OpenTUI will be resourced as a first-class deliverable because opencode depends on it, and opencode is now Anomaly's main business.
2. **But OpenTUI is not Anomaly's primary product** — it's a dependency of opencode. That means investment in OpenTUI is driven by opencode's needs, not by framework-user feedback loops. Silvery, by contrast, is designed _as_ a framework, with km as the showcase. Different incentives. Silvery should double down on framework-user concerns (canonical components, testing, correctness, DX) that opencode doesn't need from OpenTUI.
3. **The SST-to-opencode trajectory is the playbook we'd follow.** Small team, OSS-first, profitable, cultivated community, eventually pivot or extend into a related product. If silvery + km + bearly is "our SST era," we should think about what "our opencode era" looks like — and budget time for it before the bear market closes the window.
4. **The team has a strong community posture and we should respect it.** Dax Raad is a good operator, has real goodwill across the JS/TS developer community, and is the kind of person who can swing framework choices by showing up in the right threads. We should not treat Anomaly as faceless; name-recognition on our side matters when silvery eventually ships.
5. **Opportunities for strategic partnership are real but niche.** If silvery ships `@silvery/ag-solid`, there's a world where a Silvery + OpenTUI inter-op story emerges (shared widgets, shared theme specs, shared terminal-protocol tests). Unlikely in 2026, but worth keeping the door open.

## Sources (external reporting)

- [TechFundingNews — "OpenCode: The background story on the most popular open source coding agent in the world"](https://techfundingnews.com/opencode-the-background-story-on-the-most-popular-open-source-coding-agent-in-the-world/) — founders, YC batch, revenue, MAU
- [Dev Genius (Medium) — "How OpenCode went from zero to titan in eight months"](https://blog.devgenius.io/how-opencode-went-from-zero-to-titan-in-eight-months-dcdcd8ff5572) — launch timeline, growth numbers
- [Technori — "OpenCode and the Quiet Victory of Open Source AI"](https://technori.com/2025/12/23781-opencode-and-the-quiet-victory-of-open-source-ai/aaronadogy-com/) — Cloudflare mention, profitability
- [FounderTrace — Anomaly company profile](https://foundertrace.com/companies/anomaly/) — Jay V & Frank Wang founding dates
- [Crunchbase — Anomaly Innovations](https://www.crunchbase.com/organization/anomaly-innovations) — company registration details
- [Crunchbase — Serverless Stack (SST)](https://www.crunchbase.com/organization/sst-c030) — funding history ($1.12M total, YC + Greylock + SV Angel)
- [Crunchbase — Frank Wang](https://www.crunchbase.com/person/frank-wang-3) — founder profile
- [Tracxn — Serverless Stack funding rounds](https://tracxn.com/d/companies/serverless-stack/__8uQYFtVoSwnoGEAtFlHyeThzPmRbPhTZM6ExjAN0-AI/funding-and-investors)
- [PitchBook — Anomaly 2026 company profile](https://pitchbook.com/profiles/company/51609-61)
- [ICUBE UTM — Anomaly Innovations graduate team profile](https://icubeutm.ca/icube-graduate-team-anomaly-innovations-provides-an-application-development-platform-for-start-ups/) — original 2017 company
- [Grokipedia — Dax Raad](https://grokipedia.com/page/Dax_Raad) — bio, SST/opencode history
- [Northflank — "SST alternatives in 2026"](https://northflank.com/blog/sst-alternatives-serverless-stack) — useful for understanding the SST framework's current status relative to alternatives

### Sources (primary / verified)

- `gh api repos/anomalyco/opencode` — 143,844 stars, TypeScript, description "The open source coding agent." (2026-04-15)
- `gh api repos/anomalyco/opentui` — 10,380 stars, TypeScript, created 2025-07-21, 507 forks, 136 open issues, pushed 2026-04-14
- `gh api orgs/anomalyco` — created 2020-06-07, blog anoma.ly, email hello@anoma.ly, 65 public repos
- `gh api orgs/sst` — description _"We've moved to https://github.com/anomalyco"_
- `npm view @opentui/core` — maintainers `kommander`, `fanjie`, `thdxr`; repository `anomalyco/opentui`

Numbers like MAU, ARR, and star counts move fast — re-verify before quoting in any external context.
