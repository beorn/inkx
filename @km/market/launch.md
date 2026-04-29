---
id: "@km/market/launch"
aliases:
  - km-market.launch
  - km-market-launch
created_by: claude:0b5ea482
created_at: 2026-03-10T18:48:29Z
owner: bjorn@stabell.org
---

# [ ] Silvery ecosystem launch: marketing rollout and community outreach @km/market #feature #P4

Plan and execute a friendly, community-first marketing rollout for silvery (TUI framework), flexily (layout engine), and loggily (logger). Goal: establish silvery as a credible, well-documented alternative to Ink — not by attacking Ink, but by demonstrating real value.

## Philosophy

Lead with genuine value, not competitive positioning. Ink is excellent — silvery builds on the same React foundation with a different rendering architecture that solves specific pain points. The tone should be: "we love what Ink started, and we built on it."

## Phase 1: Foundation (Before Any Outreach)

### Documentation & Polish
- [ ] silvery.dev is complete: getting started, migration guide, API reference, comparison (done)
- [ ] Flexily docs at flexily.dev: benchmarks, Yoga comparison, CSS compliance story
- [ ] loggily docs: why another logger, performance, tree-shaking
- [ ] All packages published to npm with proper READMEs
- [ ] GitHub repos have clear descriptions, topics, social previews
- [ ] LICENSE files in all repos

### Showcase
- [ ] 3-5 example apps demonstrating silvery strengths (dashboard, kanban, text editor, file browser, chat TUI)
- [ ] Live web playground (xterm.js-based) where people can try silvery in browser
- [ ] Benchmark reproduction instructions that anyone can run
- [ ] Screenshot gallery / terminal recordings (asciinema or similar)

### Testing & Stability
- [ ] All test suites green, CI passing
- [ ] Ink compat test suite published and reproducible
- [ ] At least one real production app using silvery (km)

## Phase 2: Soft Launch

### Content
- [ ] Launch blog post on silvery.dev: "Introducing Silvery — React for Terminals, Evolved"
  - Tell the story: why we built it, what problem it solves, how it relates to Ink
  - Show the architecture diagram (layout-first vs render-first)
  - Include benchmarks with reproduction instructions
  - Link to migration guide
- [ ] Flexily standalone post: "Flexily — A Pure JavaScript Flexbox Engine"
  - Focus on CSS spec compliance, zero-allocation design, Yoga comparison
  - Position as useful beyond silvery (any layout engine consumer)
- [ ] "Migrating from Ink" tutorial post with before/after code
- [ ] Twitter/X thread summarizing the value proposition

### Community Seeding
- [ ] Post to Hacker News (Show HN)
- [ ] Post to Reddit r/javascript, r/typescript, r/commandline, r/node
- [ ] Post to relevant Discord servers (React, terminal UI, CLI tooling)
- [ ] Submit to JavaScript Weekly, Node Weekly, React Status newsletters

## Phase 3: Friendly Outreach to Ink Users

The most important phase. These teams are actively hitting limitations that silvery solves. The approach must be respectful and genuinely helpful — not sales-y.

### Principles
1. **Open an issue or discussion, not a PR.** PRs feel presumptuous. An issue saying "we built something that might help with X" is collaborative.
2. **Reference their specific pain points.** Generic "try our thing" messages get ignored. "We noticed you reported [specific issue] — silvery solves this via [mechanism]" is helpful.
3. **Offer to help migrate.** Not "switch to us" but "if you want to try it, we will help you through any rough edges."
4. **Credit Ink.** Every outreach should acknowledge that silvery builds on Ink ideas and React patterns.
5. **Be honest about tradeoffs.** Silvery is newer, has a smaller community, and some edge cases may not be covered yet.

### Target Teams (Priority Order)

#### Tier 1: Active Pain, High Visibility
- **Gemini CLI** (Google) — Scrolling (#765), useLayoutEffect flicker (#773), CJK/IME (#759), cursor positioning (#870). The team is actively contributing Ink patches. A GitHub Discussion offering silvery as an alternative architecture would be well-received.
- **Claude Code** (Anthropic) — Yoga memory growth (#4953), scrollback needs, multiplexer rendering. Internal connection makes this the easiest first mover.

#### Tier 2: Would Benefit, Less Acute Pain
- **Shopify CLI** — Third-party component fragmentation, input isolation for multi-step wizards, theming. A blog post or case study showing component consolidation would resonate.
- **Prisma CLI** — Table layout, scrollable data views, auto-truncation. Less urgent but clear quality-of-life improvement.

#### Tier 3: Visibility Multipliers
- **Terraform CDK** (HashiCorp) — Scrollback for streaming deploy output, synchronized output for tmux users.
- **Gatsby, Turbo, tsx, create-react-app** — Lighter Ink usage, but high npm download counts. Migration would signal ecosystem maturity.

### Outreach Format (Template)

For each team, the outreach should be:

1. **Where**: GitHub Discussion in their repo (preferred), or a comment on a relevant open issue
2. **Subject**: "Alternative approach for [specific issue]"
3. **Body**:
   - Acknowledge their work and the specific issue
   - Brief explanation of how silvery solves it architecturally (not just "use our thing")
   - Link to working example or test case
   - Offer to pair on a proof-of-concept migration
   - Honest about silvery maturity/tradeoffs
4. **Follow-up**: If they respond positively, offer a dedicated migration guide for their codebase

### Vadim (Ink maintainer) Outreach

This is the most sensitive one. Vadim has built something incredible that thousands of projects depend on. The approach:

- Reach out personally (Twitter DM or email, not public issue)
- Frame silvery as complementary, not competitive — "we explored a different rendering architecture, curious what you think"
- Offer to contribute learnings back (e.g., the layout-first approach, incremental rendering techniques)
- Ask if he would be open to silvery being listed as an alternative in Ink docs (like how frameworks cross-reference each other)
- NO public comparisons that feel adversarial

## Phase 4: Ecosystem Growth

### After Initial Traction
- [ ] Publish `create-silvery-app` scaffolding tool
- [ ] Build adapters for popular Ink community components (ink-select-input, ink-spinner, etc.)
- [ ] Conference talks: React Conf, NodeConf, terminal UI meetups
- [ ] Video tutorials on YouTube
- [ ] Sponsor/support terminal emulator projects (Ghostty, WezTerm, Kitty)

### Flexily Standalone Marketing
- [ ] Position flexily as a general-purpose layout engine (not silvery-specific)
- [ ] Benchmark against Yoga in non-terminal contexts (React Native layout, game UIs)
- [ ] Contribute CSS spec compliance tests upstream

### Community Building
- [ ] Discord server for silvery users
- [ ] "Built with Silvery" showcase page
- [ ] Monthly changelog / release notes blog posts
- [ ] Contributor guide and "good first issue" labels

## Success Metrics

- npm weekly downloads: 100 → 1K → 10K → 100K
- GitHub stars: 0 → 100 → 500 → 2000
- Production users: 1 (km) → 5 → 20
- Ink migration guides completed: 0 → 3 → 10
- Community contributors: 0 → 5 → 20

## Timeline (Tentative)

- **Month 1**: Phase 1 completion (docs, examples, publishing)
- **Month 2**: Phase 2 (soft launch, blog posts, community seeding)
- **Month 3-4**: Phase 3 (outreach to Ink users, migration support)
- **Month 5+**: Phase 4 (ecosystem growth, conferences, community)

## Blocked On

User confirming overall strategy before proceeding with any outreach.