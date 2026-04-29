---
id: "@km/_orphan/l98bq"
aliases:
  - km-l98bq
created_by: Bjørn Stabell
created_at: 2026-04-16T06:18:18Z
---

# [ ] km enrich: LLM-powered backlink and timeline enrichment @km/_orphan #task #P1

Add a 'km enrich' command that scans recent vault changes (journal entries, session transcripts, modified files) and uses an LLM to: (1) entity-resolve natural language mentions against known vault nodes (e.g. 'Jose' → @JoseChu, 'the extension' → +taxes/CALENDAR Form 4868), (2) append timeline entries to relevant domain files using the compiled truth + timeline pattern (CLAUDE.md § Content structure), (3) resolve bare YYYY-MM-DD dates as implicit backlinks to daily journal pages. gbrain has a deterministic version (check-backlinks, regex only) and an LLM dream cycle. We want the LLM version — it's where the real value is. Could run as a cron agent (Haiku, pennies per run) or on-demand. The vault foundation is ready: domain files use compiled truth + timeline pattern, tasks have start::/end::/due:: props, @ids board aggregates IDs. This gives the enrichment pass something to write INTO.