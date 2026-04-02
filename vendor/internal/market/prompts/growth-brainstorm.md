# Winning Prompt: Growth Brainstorm

Used 2026-04-02, GPT 5.4 Pro, $2.27, generated 30 high-quality non-obvious growth ideas.

## Why it worked

1. **Specific ecosystem context** — listed every product with one-line descriptions
2. **Current state** — told it what distribution already exists (SEO, programmatic pages) so it didn't suggest what we already have
3. **Anti-generic constraint** — "Not generic 'post on social media' advice"
4. **YC framing** — "what would a YC-backed startup do" triggers concrete, action-oriented thinking
5. **Quantified goal** — "0 to 10,000 developers in 6 months" forces specificity
6. **Structured categories** — 6 specific buckets (tools, partnerships, community, content, AI-native, DX) prevents generic answers
7. **Effort/impact requirement** — forces the model to think about feasibility, not just creativity

## The prompt

```
I'm building an ecosystem of open-source terminal development tools:
- silvery.dev — React TUI framework (45+ components, incremental rendering)
- terminfo.dev — terminal feature compatibility database (206 pages, probe data for 11 terminals)
- termless.dev — headless terminal testing framework (Playwright for terminals)
- Flexily — pure TypeScript flexbox layout engine
- Loggily — structured debug logging

Current distribution:
- All sites have SEO (unique descriptions, schema markup, sitemap, llms.txt)
- terminfo.dev has 66 programmatic comparison pages
- No social media presence yet, no newsletter, no community

Target audience: developers building terminal applications (AI agents, TUI tools, CLI apps)

Give me 30 creative, non-obvious growth ideas. Not generic 'post on social media' advice. Think: what would a YC-backed startup do to get from 0 to 10,000 developers knowing about this ecosystem in 6 months? Include ideas for:
1. Free tools/widgets that drive awareness
2. Partnerships and integrations
3. Community building
4. Content that goes viral in developer circles
5. AI-native distribution (MCP servers, AI tool integrations)
6. Developer experience that creates word-of-mouth

Be specific and actionable. For each idea, estimate effort (low/medium/high) and potential impact (low/medium/high).
```

## Template for reuse

```
I'm building [specific product/ecosystem description with metrics].

Current distribution: [what you already have — so the model doesn't waste ideas on existing work]

Target audience: [specific, not "developers"]

Give me [N] creative, non-obvious [growth/marketing/distribution] ideas.
Not generic [anti-pattern to avoid].
Think: what would [aspirational company/approach] do to [specific quantified goal]?

Include ideas for:
1. [category 1]
2. [category 2]
...

Be specific and actionable. For each idea, estimate effort and impact.
```

## Key: the anti-generic constraint

The single most important element is telling the model what NOT to suggest. Without "Not generic 'post on social media' advice", you get:

- Post on Twitter
- Write blog posts
- Submit to Product Hunt
- Create a Discord

With the constraint, you get:

- README compatibility badge generator
- terminal-doctor CLI for bug reports
- GitHub Action that comments on PRs
- Shadcn-style pattern registry
