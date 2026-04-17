# Funnel Architecture — Owned Audience Strategy

Date: 2026-04-02

## The Problem

All current traffic is "rented" — Google search, HN, AI citations. If an algorithm changes, traffic drops to zero. We need funnels that end with audiences we own and can communicate with directly.

## Core Principle

The funnel isn't a separate thing. It's embedded in every touchpoint. Every tool, every page, every interaction should have a natural, valuable reason to capture a way to reach that person again.

## Three Funnel Tracks

### Funnel A: Tool → Report → Email (terminal nerds)

```
terminal-doctor / badge generator / capability checker
  → generates shareable output on terminfo.dev
    → "Get notified when your terminal adds new features" CTA
      → terminfo.dev email list
```

**Why it works:** The tool provides immediate value. The email capture offers ongoing value the user actually wants (terminal update notifications). The content is auto-generated from probe data — zero per-email effort.

**Touchpoints:**

- `npx terminal-doctor` → shareable URL on terminfo.dev → CTA
- README badge → links to terminfo.dev → CTA
- Terminal page on terminfo.dev → "Watch this terminal" → CTA
- Feature page → "Get notified when more terminals support this" → CTA

### Funnel B: Content → Comparison → Guide (TUI builders)

```
Blog post / search result / AI citation
  → comparison page or tutorial
    → "Get the migration guide" or "5-day terminal course"
      → silvery.dev email list
```

**Why it works:** Comparison searchers ("silvery vs ink") are high-intent. A migration guide or email course converts them at the moment of decision.

**Touchpoints:**

- Blog articles → inline CTA → email
- Comparison pages → "Get the migration guide" → email
- Quick start → "Get the 5-day terminal rendering course" → email
- About page → "Follow development" → email

### Funnel C: CI → PR → Community (testing people)

```
GitHub Action in CI
  → PR comments with terminal matrix results
    → link to termless.dev
      → "Join the terminal testing community"
        → termless.dev email list or Discord
```

**Why it works:** CI is the stickiest integration. Once in someone's pipeline, every PR reminds every contributor that termless exists.

**Touchpoints:**

- GitHub Action PR comments → link to termless.dev → CTA
- termless.dev docs → "Get testing tips" → email
- Snapshot failures → "Report this to termless community" → Discord

## Owned Channels (priority order)

### 1. Email lists (Beehiiv, free tier)

Three lists with different content:

- **terminfo.dev list** — terminal feature updates, new probes, compatibility changes. Auto-generated from data.
- **silvery.dev list** — release notes, tutorials, architecture deep dives. Manual.
- **termless.dev list** — testing recipes, CI tips, terminal quirks. Mixed auto + manual.

Start with one Beehiiv account, tag subscribers by interest. Split into separate lists if volume justifies.

### 2. GitHub (semi-owned)

- GitHub Discussions on silvery repo — searchable, indexed, you moderate
- GitHub Releases — star-gazers get notifications
- GitHub Sponsors — supporters get insider updates

### 3. RSS feeds

- Blog RSS on silvery.dev
- terminfo.dev data changes RSS
- Zero platform risk, developers actually use RSS

### 4. Discord (owned but high-maintenance)

- Terminal development community (broader than just Silvery)
- Channels: #silvery, #terminfo, #termless, #general
- Defer until email lists have 500+ subscribers — community needs critical mass

## Email Capture Mechanisms

| Mechanism                    | Where                           | What they get                           | Effort                 |
| ---------------------------- | ------------------------------- | --------------------------------------- | ---------------------- |
| "Watch this terminal" button | terminfo.dev terminal pages     | Email when terminal adds features       | Low (auto from probes) |
| "Get the migration guide"    | silvery.dev comparison pages    | PDF/email drip                          | Medium                 |
| "5-day terminal course"      | silvery.dev getting-started     | Daily email teaching terminal rendering | Medium (write once)    |
| Newsletter signup            | All site footers                | Monthly ecosystem digest                | Low                    |
| terminal-doctor CTA          | Tool output URL on terminfo.dev | "Get notified about your terminal"      | Low                    |
| Badge generator CTA          | terminfo.dev badge page         | "Watch compatibility changes"           | Low                    |

## The 5-Day Terminal Rendering Course

Best lead magnet for TUI builders. Content plan:

- **Day 1:** How terminals actually work (buffers, escape sequences, cell grid)
- **Day 2:** The rendering problem (why TUI apps flicker, the scrollback dilemma)
- **Day 3:** Terminal protocols you should know (Kitty keyboard, truecolor, sync output)
- **Day 4:** Testing terminal apps (snapshot testing, headless emulation, CI)
- **Day 5:** Building with Silvery (quick start, responsive layout, dynamic scrollback)

Each email is self-contained and valuable even if they never use Silvery. That's the key — educational content that happens to showcase the ecosystem.

## Metrics

Track:

- Email list size per list (terminfo/silvery/termless)
- Signup conversion rate per touchpoint
- Open rate (target: >40% for developer content)
- Click rate (target: >10%)
- Unsubscribe rate (target: <1%)

## Anti-patterns

- Don't gate content behind email (docs should always be free)
- Don't spam (max 1 email/week, ideally 2/month)
- Don't make signup required to use tools (terminal-doctor works without email)
- Don't buy lists or scrape emails
- Don't use popups on docs sites (developers hate this)
