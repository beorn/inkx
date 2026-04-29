---
id: "@km/market/unified-search"
aliases:
  - km-market.unified-search
  - km-market-unified-search
created_by: claude:4929065a
created_at: 2026-04-02T18:28:52Z
---

# [ ] Integrated search across all ecosystem sites (silvery.dev, termless.dev, terminfo.dev, beorn.codes) @km/market #feature #P2

All ecosystem sites are VitePress — they should have unified search that spans the entire ecosystem.

## Sites
- silvery.dev — TUI framework docs
- termless.dev — terminal testing docs
- terminfo.dev — terminal compatibility database
- beorn.codes — portfolio + blog
- beorn.codes/flexily — layout engine docs
- beorn.codes/loggily — logging docs
- beorn.codes/mdspec — markdown testing docs

## Options

### A. VitePress local search (built-in)
Each site already has VitePress's built-in local search (miniSearch). But it only searches the current site.

### B. Algolia DocSearch
Free for open-source docs. One index spans multiple sites. Cmd+K search across the entire ecosystem. Best UX but requires Algolia account + crawler setup.

### C. Pagefind
Static search index built at deploy time. Can merge indices from multiple sites. No external service needed. Self-hosted.

### D. Custom search via shared index
Build a combined search index at deploy time from all sites. Host as a JSON file on one site. Query from all sites via fetch.

## Recommendation
Algolia DocSearch (B) is the gold standard for docs search. Free for OSS. Setup: apply at https://docsearch.algolia.com/, configure one crawler for all sites.

Pagefind (C) is the best self-hosted option. No external dependency. Build indices per site, merge at deploy.

## Cross-site search UX
When searching on silvery.dev, results from termless.dev and terminfo.dev should appear in a separate section:
- [silvery] Results from this site
- [ecosystem] Results from termless.dev, terminfo.dev