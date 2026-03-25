# Marketing — Content Marketing Coordination

**Keywords**: marketing, blog, SEO, content, article, newsletter, distribution, programmatic

Coordinates the entire content marketing effort across silvery.dev, termless.dev, terminfo.dev, and flexily.dev. Tracks what's been done, what's next, and when each workflow should run.

**Strategy doc**: `docs/content-marketing-strategy.md` — the canonical plan with all 240 article ideas, programmatic SEO strategy, Greg Isenberg framework, and GPT Pro review findings.

**Tracking epic**: `km-market`

## Command Mapping

| User Says | Action | Frequency |
|-----------|--------|-----------|
| `/marketing` | Show dashboard: status of all phases, what's next | Anytime |
| `/marketing status` | Detailed status: pages published, SEO metrics, pipeline | Anytime |
| `/marketing next` | What to work on next (highest-priority unfinished item) | Anytime |
| `/marketing write <article-id>` | Load [workflows/write-article.md](workflows/write-article.md), write the article | When writing |
| `/marketing publish <article>` | Load [workflows/publish.md](workflows/publish.md), publish + cross-post | After writing |
| `/marketing programmatic` | Load [workflows/programmatic-seo.md](workflows/programmatic-seo.md), generate pages | Monthly |
| `/marketing infra` | Load [workflows/infrastructure.md](workflows/infrastructure.md), set up/maintain platform | Setup |
| `/marketing newsletter` | Load [workflows/newsletter.md](workflows/newsletter.md), draft monthly digest | Monthly |
| `/marketing audit` | Load [workflows/audit.md](workflows/audit.md), check content freshness + SEO health | Monthly |
| `/marketing plan` | Review and update the strategy doc | Quarterly |

## Dashboard

Run this to see current state:

```bash
bd children km-market
bd show km-market
```

Then check the execution tracker below.

## Execution Tracker

This section tracks when each workflow was last run. Update after each execution.

### Phase 0: Infrastructure
| Task | Status | Last Run | Notes |
|------|--------|----------|-------|
| robots.txt (terminfo.dev) | not started | — | |
| JSON-LD structured data (terminfo.dev) | not started | — | |
| Improve meta descriptions (terminfo.dev) | not started | — | |
| Breadcrumb schema (terminfo.dev) | not started | — | |
| Search Console submission (all sites) | not started | — | |
| Plausible analytics (all sites) | not started | — | |
| Blog infrastructure (silvery.dev) | not started | — | |
| Newsletter setup (ecosystem) | not started | — | |
| Canonical URLs (all sites) | not started | — | |
| OG image generation (terminfo.dev) | not started | — | |

### Phase 1: Programmatic SEO
| Task | Status | Pages | Last Run | Notes |
|------|--------|-------|----------|-------|
| Terminal comparison pages | done | 66 | 2026-03-25 | Commit 53fbfd9 |
| Enrich feature page meta/content | not started | ~100 | — | |
| Use-case profile pages | not started | ~10 | — | |
| Standard adoption pages | not started | ~11 | — | |
| FAQ schema on feature pages | not started | ~100 | — | |

### Phase 2: First Editorial Wave
| # | Article | Site | Status | Published |
|---|---------|------|--------|-----------|
| 2.1 | Silvery vs Ink: Honest Benchmark | silvery.dev | not started | — |
| 2.2 | Truecolor Support: Which Terminals? | terminfo.dev | not started | — |
| 2.3 | Migrating from Ink to Silvery | silvery.dev | not started | — |
| 2.4 | OSC 8 Hyperlinks: Complete Guide | terminfo.dev | not started | — |
| 2.5 | Your First Terminal Test in 5 Min | termless.dev | not started | — |
| 2.6 | Flexily vs Yoga: 2026 Benchmark | flexily.dev | not started | — |
| 2.7 | Why Your Terminal Is 80 Chars Wide | terminfo.dev | not started | — |
| 2.8 | Build a CLI Dashboard in 50 Lines | silvery.dev | not started | — |
| 2.9 | Runtime Terminal Capability Detection | terminfo.dev | not started | — |
| 2.10 | expect/pexpect vs Termless | termless.dev | not started | — |
| 2.11 | Terminal Emulators in 2026 | terminfo.dev | not started | — |
| 2.12 | Migrating from Yoga to Flexily | flexily.dev | not started | — |

### Phase 3: Origin Story + Deep Dives
(See strategy doc for full list — 12 articles, weeks 9-14)

### Phase 4: Sustained Cadence
(See strategy doc for tiered article lists per site)

### Content Enrichment (terminfo.dev)
| Entity | Total | body | history | pitfalls | examples | Coverage |
|--------|-------|------|---------|----------|----------|----------|
| Features | 133 | 133 | 0 | 0 | 0 | body: 100%, enrichment: 0% |
| Terminals | 11 | 9 | 0 | 0 | — | body: 82%, enrichment: 0% |
| Standards | 10 | 10 | 0 | — | — | description: 100%, enrichment: 0% |
| Categories | 13 | 13 | 0 | — | — | description: 100%, enrichment: 0% |

Last measured: 2026-03-25

## When to Run Each Workflow

| Workflow | Trigger | Cadence |
|----------|---------|---------|
| **Infrastructure** | First setup, or when adding a new site/tool | Once, then as-needed |
| **Programmatic SEO** | New data available (census run, new terminals, new features) | After each census update |
| **Write Article** | Next article in the priority queue | 1/week during active phases |
| **Publish** | After an article passes review | Same day as write completion |
| **Newsletter** | Accumulated 3-4 published articles | Monthly |
| **Audit** | Regular maintenance | Monthly |
| **Plan** | Strategy review, priority shift, new products | Quarterly |

## Sites

| Site | Platform | Blog Status | Programmatic Pages |
|------|----------|-------------|-------------------|
| **terminfo.dev** | VitePress + Cloudflare Pages | No blog yet | ~140 existing + 66 compare = ~206 |
| **silvery.dev** | VitePress + GitHub Pages | /blog/ exists (placeholder) | ~50 docs pages |
| **termless.dev** | VitePress | No blog yet | ~15 docs pages |
| **flexily.dev** | VitePress | No blog yet | ~20 docs pages |

## Key Principles

1. **Programmatic pages first, editorial second** — Structured data pages are cheaper and more defensible
2. **terminfo.dev is the SEO engine, silvery.dev is the product engine** — Traffic flows terminfo → silvery
3. **Every article has a CTA** — docs, GitHub, npm install, or newsletter signup
4. **80/20 AI/human** — AI drafts, human reviews and tests all code examples
5. **Freshness matters** — Benchmark/comparison pages need "last tested" dates and refresh owners
6. **Cross-link everything** — terminfo feature pages link to silvery protocol pages and vice versa

## Data Architecture (terminfo.dev)

Three layers — see `vendor/terminfo.dev/CLAUDE.md` for full directory structure and runbook:

```
content/              ← ALL input data (curated + measured)
  features.json         133 features with name, slug, tags, body, probe, baseline
  terminals.json        11 terminal apps with label, slug, description, body
  standards.json        10 standards with label, url, description
  categories.json       13 categories with label, order, description
  annotations.json      88 result overrides with notes
  probes-apps/          real terminal results (bun census:apps)
  probes-libs/          headless backend results (bun census:run)
  probes-mux/           multiplexer results (future)

packages/             ← ALL source code
  probes/               probe test files (*.probe.ts)
  cli/                  census CLI commands
  api/                  API + badge generation

docs/data/probes.data.ts ← DERIVED: computed at build time from content/
```

### Content Enrichment Pipeline

1. **`/marketing enrich`** — identify entries missing optional fields, AI-generate content
2. Review JSON diff
3. `bun run build` — verify pages render correctly
4. Commit and deploy

### Census Pipeline

1. **`/marketing census`** — `bun census:run` + `bun census:apps`
2. Check for unannotated failures → update `content/annotations.json`
3. `bun run build` → pages auto-regenerate with new data
4. Commit and deploy

## Sub-Skills

| File | Purpose |
|------|---------|
| [workflows/write-article.md](workflows/write-article.md) | Draft an article (AI-assisted, with code validation) |
| [workflows/publish.md](workflows/publish.md) | Publish + cross-post pipeline |
| [workflows/programmatic-seo.md](workflows/programmatic-seo.md) | Generate/update programmatic pages |
| [workflows/infrastructure.md](workflows/infrastructure.md) | Platform setup and maintenance |
| [workflows/newsletter.md](workflows/newsletter.md) | Monthly ecosystem digest |
| [workflows/enrich.md](workflows/enrich.md) | AI content enrichment for terminfo.dev |
| [workflows/census.md](workflows/census.md) | Census probe pipeline |
| [workflows/audit.md](workflows/audit.md) | Content freshness and SEO health check |
