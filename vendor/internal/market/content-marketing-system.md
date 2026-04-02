# Content Ops

A lightweight editorial workflow for the silvery ecosystem. One author, AI-assisted, across 4 sites.

## The Pipeline

```
STRATEGY → IDEATE → BRIEF → EVIDENCE → DRAFT → VALIDATE → APPROVE → PUBLISH → MAINTAIN
```

### 1. Strategy (quarterly)

Review content direction. What products need distribution? Where does search intent exist?

- Update `vendor/internal/bearly/content-ideas-50.md` with new ideas
- Cull ideas that no longer make sense
- Check: which existing articles need refresh?

### 2. Ideate (ongoing)

Capture ideas when they come up. Each idea needs:

- Primary site (silvery.dev, terminfo.dev, termless.dev, beorn.codes/flexily)
- Format: tutorial / deep dive / comparison / data analysis
- Audience: who searches for this?
- Why now: is there a reason to publish this soon?
- Evidence available: can I prove the claims?

Ideas live in `vendor/internal/bearly/content-ideas-50.md`

### 3. Brief (before drafting)

5-10 lines. Answer:

- Who is this for?
- What specific question does it answer?
- What's the core claim or insight?
- Why should they trust this article? (what proof exists?)
- What makes it different from docs?

### 4. Evidence (before drafting)

The most underrated stage. Collect before writing:

- Runnable code examples (tested, all variables defined)
- Benchmark data with methodology (hardware, runtime, versions)
- terminfo.dev probe data for compatibility claims
- Screenshots or terminal recordings
- Links to specs, issues, or source code

**For devtools, proof beats polish.**

### 5. Draft

AI drafts, human reviews. AI is useful for prose, structure, and expanding notes. AI is NOT the source of truth for technical claims, benchmarks, or competitor comparisons.

### 5b. Visuals

Create visuals after the draft is stable but before validation. Each article should have:

**Required:**

- OG preview image (auto-generated at build time — see tooling below)

**When applicable:**

- Terminal recording (GIF/player) for tutorials and demos
- Architecture diagram for pipeline/system design articles
- Comparison table (markdown, already strong)

**Optional:**

- AI-generated hero image for flagship articles
- Annotated screenshots for before/after or UI examples

Drafts go to `vendor/internal/blogs/<site>/`

Writing rules:

- First person ("I built", "I found")
- 1000-1500 words
- No private project leaks (no "km", "Knowledge Machine")
- No absolutes about competitors
- Code examples must run
- End with honest tradeoffs, not a CTA

### 6. Validate (two passes)

**A. Automated checks:**

```bash
# Private project leaks
grep -rn "\bkm\b\|Knowledge Machine" vendor/internal/blogs/silvery/*.md

# Absolute competitor claims
grep -in "isn't possible\|can't implement\|visible flicker\|for free\|full stop" vendor/internal/blogs/silvery/*.md

# Marketing phrases
grep -in "the real value\|single biggest\|game.changer\|just works" vendor/internal/blogs/silvery/*.md
```

**B. /pro review (GPT 5.4 Pro):**
Rate each article 1-10 on four dimensions. All must be 7+ to publish.

| Dimension       | What it measures                  | Target |
| --------------- | --------------------------------- | ------ |
| Authenticity    | Sounds like a real developer?     | 7+     |
| Accuracy        | Claims correct, code runnable?    | 7+     |
| Tone            | Factual, not sales copy?          | 7+     |
| Interestingness | Would a developer finish reading? | 7+     |

**C. Technical pass (human):**

- Code runs
- Commands work
- Versions are correct
- Claims are defensible

### 7. Approve (human)

Author reads the article and signs off. This is not optional — AI review catches different things than human review.

### 8. Publish

```bash
cp vendor/internal/blogs/silvery/<slug>.md vendor/silvery/docs/blog/
# Update blog index
# If 5+ articles: re-enable blog nav
cd vendor/silvery && bun run docs:build && git add docs/blog/ && git commit && git push
```

### 9. Maintain (ongoing)

Every published article gets:

- Publish date
- Last verified date
- Update trigger (new release, benchmark outdated, competitor changed)

Refresh queue: check every 3 months. Stale devtools content is worse than no content.

**Spend 20-25% of content time maintaining old posts, not just creating new ones.**

## Schedule

### Recommended cadence: 1 substantial post every 2-3 weeks

Don't try to make 4 sites equally active. Publish the best next article on the right site.

### Monthly rhythm (Option B from Pro research)

| Week   | Activity                                            |
| ------ | --------------------------------------------------- |
| Week 1 | Choose topic, write brief, gather evidence          |
| Week 2 | Draft (AI-assisted)                                 |
| Week 3 | Validate (/pro review, code testing, fix) + publish |
| Week 4 | Lighter support post + refresh one old article      |

### Content mix per month

- 1 flagship article (data-driven analysis, deep dive, comparison)
- 1-2 support pieces (tutorial, "how I built X", migration note)

## Article Inventory

### Current Drafts

Location: `vendor/internal/blogs/silvery/`

| Article                        | Words | Status                        | Pro Scores (A/Ac/T/I) |
| ------------------------------ | ----- | ----------------------------- | --------------------- |
| Comparing macOS Terminals 2026 | 1404  | Fixing — terminal set         | 7/4/6/8               |
| Building an AI Agent TUI       | 1475  | Fixing — code snippets        | 8/5/7/8               |
| Dynamic Scrollback             | 1378  | Fixing — alt-screen absolutes | 8/5/7/8               |
| Terminal Protocols 2026        | 1492  | Fixing — terminal set         | 7/4/6/7               |
| Layout-First Rendering         | 1500  | Fixing — competitive tone     | 7/3/5/7               |

### Publish Priority

1. AI Agent TUI — hottest topic, best voice
2. Dynamic Scrollback — unique concept
3. macOS Terminals — high search volume
4. Terminal Protocols — educational, evergreen
5. Layout-First Rendering — needs most work

### Ideas Backlog

50 ideas at `vendor/internal/bearly/content-ideas-50.md`

## Quality Gates Summary

Before publishing, every article must pass:

- [ ] No private project leaks
- [ ] First person voice, no marketing fluff
- [ ] All code examples run (variables defined, imports present)
- [ ] Performance claims linked to methodology
- [ ] Competitor claims are first-person observations, not absolutes
- [ ] Honest tradeoffs section
- [ ] /pro review: all four dimensions 7+
- [ ] Author reviewed and approved
- [ ] Consistent data across articles (terminal counts, feature numbers)
- [ ] No social proof with weak stats

## Cross-site Strategy

| Site                | Focus                         | Best formats                       |
| ------------------- | ----------------------------- | ---------------------------------- |
| silvery.dev         | TUI development, architecture | Tutorials, deep dives, comparisons |
| terminfo.dev        | Terminal compatibility data   | Data analysis, protocol guides     |
| termless.dev        | Terminal testing              | Recipes, testing tutorials         |
| beorn.codes/flexily | Layout algorithms             | Benchmarks, Yoga comparisons       |

**One idea can power multiple surfaces.** Publish the canonical version on one site, link from others.

## Distribution (Greg Isenberg playbook)

Core principle: **distribution matters more than content generation.** One article should become 5+ pieces across channels.

### Repurposing Pipeline

Every published article gets repurposed:

```
Blog article
├── X/Twitter thread (3-5 tweets, key insight + link)
├── LinkedIn post (founder POV, slightly different angle)
├── HN/Reddit submission (if substantial + not overtly promotional)
├── Newsletter mention (if Beehiiv set up)
└── Terminal GIF clip (if the article has a demo)
```

### Channel Strategy

| Channel                                           | What works                                                                                                                     | Cadence                         | Tool                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------- |
| **Hacker News**                                   | Data-driven posts, terminal deep dives, honest comparisons. "Show HN" for product, editorial for insights. Never submit fluff. | Only when genuinely interesting | Manual                    |
| **Reddit** (r/commandline, r/terminal, r/reactjs) | Helpful content, answer questions, share data. Be a contributor first.                                                         | 1-2/month                       | Manual                    |
| **X/Twitter**                                     | Thread from article key points, terminal GIFs, benchmark numbers, hot takes                                                    | 2-3/week when active            | Typefully ($12/mo)        |
| **LinkedIn**                                      | Founder perspective posts, "here's what I learned building X"                                                                  | 1/week                          | Taplio ($49/mo) or manual |
| **Newsletter**                                    | Monthly digest of articles + ecosystem updates                                                                                 | Monthly                         | Beehiiv (free tier)       |
| **dev.to / Hashnode**                             | Cross-post articles with canonical URL back to silvery.dev                                                                     | Same day as publish             | Manual                    |
| **YouTube**                                       | Terminal recordings, demo walkthroughs, conference-style talks                                                                 | When ready (defer)              | —                         |

### HN/Reddit Rules

- Never submit your own marketing content as if it's editorial
- Best performers: data-driven analysis, honest comparisons, educational deep dives, "I built X and here's what I learned"
- Terminal content does well on HN — the audience cares about this stuff
- Don't submit every article — only the genuinely interesting ones
- Comment and engage in threads — don't just drop links

### What NOT to distribute

- Thin tutorial content (keep for docs)
- Product announcements disguised as articles
- Anything that scored below 7 on /pro review
- Articles without real proof (benchmarks, data, code)

### Tool Setup (when ready)

| Tool             | Purpose              | Cost      | Priority                     |
| ---------------- | -------------------- | --------- | ---------------------------- |
| Beehiiv          | Newsletter           | Free tier | Set up first                 |
| Typefully        | X/Twitter scheduling | $12/month | When posting regularly       |
| dev.to account   | Cross-posting        | Free      | Set up first                 |
| Hashnode account | Cross-posting        | Free      | Set up first                 |
| Taplio           | LinkedIn automation  | $49/month | Defer until LinkedIn matters |

### Repurposing with AI

Use Claude/ChatGPT to convert a published article into:

1. **X thread**: "Extract the 5 key insights from this article as a Twitter thread. First tweet should hook. Last tweet links to the full article."
2. **LinkedIn post**: "Rewrite the core insight as a 200-word founder perspective post. First person, conversational."
3. **Reddit comment**: "Summarize this as a helpful reply to someone asking about [topic]. Don't be promotional."

**Rule:** AI repurposes, human reviews and posts. Never auto-post AI output without reading it.

## Best Practices (from Vercel/Stripe/Linear + Greg Isenberg research)

1. **Fewer, better pieces** — quality compounds, volume doesn't
2. **Write close to product truth** — from real implementation experience
3. **Docs and blog reinforce each other** — cross-link, don't duplicate
4. **Comparisons are specific and fair** — criteria explicit, tradeoffs acknowledged
5. **Content is skimmable** — one thesis, short sections, code blocks
6. **Strong point of view** — opinionated but technically fair
7. **Maintain published content** — stale is worse than missing
8. **Distribution > creation** — one great article repurposed 5 ways beats 5 mediocre articles
9. **Proof beats polish** — real benchmarks, terminal recordings, data from terminfo.dev
10. **Founder voice wins** — first person, opinionated, technically honest

## Visual Tooling

All free. Total cost: $0/month (optional $15/month for Ideogram text-in-image).

### Automated (build-time, zero per-article effort)

**OG preview images** — `@nolebase/vitepress-plugin-og-image`

- Auto-generates 1200x630 PNG for every page at build time
- Uses Satori (Vercel's JSX-to-SVG engine) + resvg for PNG
- Pulls title/description from frontmatter
- Install: `bun add -D @nolebase/vitepress-plugin-og-image`

**Inline diagrams** — `vitepress-plugin-mermaid`

- Mermaid diagrams rendered inline from markdown code blocks
- Supports flowcharts, sequence, state, C4, ER diagrams
- Dark/light theme aware
- Install: `bun add -D vitepress-plugin-mermaid mermaid`, wrap config with `withMermaid()`
- AI-friendly: Claude/GPT can generate Mermaid from text descriptions

### Manual (per-article, when needed)

**Terminal recordings** — VHS (charmbracelet/vhs)

- Declarative `.tape` files — scripted, deterministic, CI-friendly
- Output: GIF, MP4, WebM
- Install: `brew install vhs` or `nix-install nixpkgs#vhs`
- Example `.tape` file:
  ```
  Output demo.gif
  Set FontSize 14
  Set Width 1200
  Set Height 600
  Type "bun run app"
  Enter
  Sleep 2s
  Type "j"
  Sleep 500ms
  ```

**Interactive terminal player** — asciinema

- Records real terminal sessions as `.cast` files
- Embeddable player for web (asciinema-player Vue component)
- Best for: silvery.dev demos where users can scrub through recordings

**Complex architecture diagrams** — D2 (d2lang.com)

- CLI: `d2 input.d2 output.svg`
- Multiple layout engines, better than Mermaid for complex systems
- Version-controllable `.d2` files

**Screenshots** — Shottr

- Free, 1.2 MB, M-chip optimized
- Bendable arrows, pixel ruler, OCR, scrolling capture
- Best for: annotated terminal screenshots, before/after comparisons

**Code snippet images** — Silicon

- Rust CLI: `silicon main.rs -o output.png`
- Like Carbon but offline, instant, no browser needed

### AI Image Generation (for hero images)

**Primary: Gemini (free tier)**

- ~500 images/day free via Google AI Studio
- $0.02-0.04/image via API
- Good for abstract, terminal-aesthetic visuals

**For text in images: Ideogram ($15/month)**

- Best text rendering (~90% accuracy)
- API available from Plus tier
- Use when OG images need custom text beyond the auto-generated template

**For premium art: Midjourney (sparingly)**

- Best artistic quality, worst automation (Discord-based)
- Use for key pages only (landing, about)

### When to use what

| Article type  | OG image | Recording    | Diagram    | Hero image |
| ------------- | -------- | ------------ | ---------- | ---------- |
| Tutorial      | Auto     | VHS tape     | Maybe      | Skip       |
| Deep dive     | Auto     | Skip         | Mermaid/D2 | Optional   |
| Comparison    | Auto     | Side-by-side | Table      | Skip       |
| Data analysis | Auto     | Skip         | Chart      | Optional   |
| Architecture  | Auto     | Skip         | D2         | Skip       |
