---
description: "Audit orchestrator — one skill that runs all our system audits (links, SEO, legal, repo metadata, code quality, package health) and produces a unified dashboard."
argument-hint: "[all|due|<audit-name>] [--strict] [--quick]"
allowed-tools: Bash, Read, Glob, Grep, Skill, AskUserQuestion
---

# Audit — One Skill To Rule Them All

**Keywords**: audit, audits, audit all, audit due, health check, sop, runbook

`/audit` is the **central orchestrator** for every system audit we run across km, vendor/*, and the public marketing sites. It does not implement the audits itself — each sub-audit lives in its own home skill (`/marketing link-check`, `/marketing seo-check`, `/marketing legal`, `/code quality`, `/repo-health`, `/silverize`, etc.). This skill knows the **registry** of audits, their **cadences**, and how to **invoke** them in order.

Bead: `km-infra.audit-all` (the design + roadmap for the orchestrator)

## Why This Exists

We have ~16 audit-style workflows scattered across `/marketing`, `/complete`, `/code`, `/project-audit`, `/repo-health`, `/review-all`, `/infra`, `/legal`, `/silverize`, `/fp-check`. Each runs in isolation, has its own report format, and tracks its own freshness (or doesn't). That fragmentation means:

1. We under-audit — running them individually is friction
2. We can't see the whole picture — there's no dashboard
3. Adding a new audit costs hours of glue
4. Audits drift out of sync because there's no central cadence

`/audit` is the aggregator. Each sub-audit stays in its home skill (where it belongs); this one calls them, collects results, and produces a single dashboard.

## Quick Commands

| Command | What it does |
|---------|--------------|
| `/audit` or `/audit all` | Run every registered audit, produce unified SUMMARY |
| `/audit due` | Run only audits whose cadence has elapsed since last run |
| `/audit <name>` | Run one audit (e.g. `/audit links`, `/audit seo`) |
| `/audit --status` | Show last-run timestamps + next-due dates without running anything |
| `/audit list` | Show the registry of all known audits |
| `/audit all --strict` | Fail-fast: any audit error blocks the dashboard |
| `/audit all --quick` | Use each audit's quick mode (homepage-only for link-check, etc.) |

## Audit Registry

Each audit has a name, home skill, cadence, command, and parser. The registry is the canonical list — adding a new audit means adding a row here.

| Name | Home skill | Cadence | Command | Notes |
|------|-----------|---------|---------|-------|
| **links** | `/marketing link-check` | monthly | `scripts/check-site-links.sh` | Cross-site lychee crawl, sitemap inputs |
| **seo** | `/marketing seo-check` | monthly | (manual checklist) | Should automate via lighthouse-ci |
| **legal** | `/marketing legal` | quarterly | (manual checklist) | License + dependency + privacy |
| **repo-metadata** | `/infra repo-metadata` (planned) | monthly | `gh api repos/beorn/*` | Bead km-infra.repo-metadata-audit |
| **code-quality** | `/code quality` | per-PR | `bun fix && bun run test:fast` | Already runs on every commit |
| **package-health** | `/repo-health` | monthly | (per-package script) | License, gitignore, metadata |
| **silvery-alignment** | `/silverize` | quarterly | (per-package audit) | Philosophy + components + theme tokens |
| **completeness** | `/complete` | session-end | (manual checklist) | Remnants, stale docs, unclosed beads |
| **infra-health** | `/infra` | weekly | `gh run list` per repo | CI/CD pipeline status |
| **schema-validity** | (planned) | monthly | (planned) | JSON-LD schema.org validator |
| **image-audit** | (planned) | monthly | (planned) | OG images PNG, ≤100KB, dimensions present |
| **sitemap-audit** | (planned) | monthly | (planned) | Well-formed, lastmod, no 404s |
| **doc-code-drift** | (planned) | monthly | (planned) | Docs pointing at code paths that don't exist |
| **tls-headers** | (planned) | quarterly | (planned) | securityheaders.com / mozilla observatory |
| **lighthouse-perf** | (planned) | weekly | (planned) | Core Web Vitals on every public page |
| **package-consistency** | (planned) | monthly | (planned) | Vendor packages share TS / vitest / eslint versions |

**Adding a new audit**: 
1. Implement it in its home skill (or create a new skill if it doesn't fit)
2. Add a row to the registry above
3. Bead under `km-infra.audit-all` with implementation notes

## Cadence Definitions

| Cadence | Frequency | Trigger |
|---------|-----------|---------|
| `per-PR` | Per pull request | CI workflow |
| `session-end` | Per session | Manual via `/complete` |
| `weekly` | Mondays 06:00 UTC | Cron in CI + manual |
| `monthly` | First Monday of month | Manual via `/marketing audit` or `/audit all` |
| `quarterly` | Jan / Apr / Jul / Oct first Monday | Manual |

## Last-Run Tracking

Stored in `.audits/lastrun.json` at the repo root. Format:

```json
{
  "links": "2026-04-06T18:30:47Z",
  "seo": "2026-04-02T00:00:00Z",
  "legal": "2026-01-15T00:00:00Z",
  ...
}
```

`/audit due` reads this file and runs only audits whose `lastrun + cadence < now`. `/audit <name>` runs that audit and updates its row regardless of due date.

## Output Format

Each audit produces its own native output (per-audit conventions). The orchestrator wraps each in a section and writes a top-level dashboard:

```
.audits/run-<timestamp>/
├── SUMMARY.md          ← Dashboard: pass/fail per audit, key findings
├── links/              ← /tmp/link-check-* contents (or symlinks)
├── seo/
├── legal/
└── ...
```

The dashboard SUMMARY.md is the primary deliverable. Drill into per-audit dirs for detail.

## Integration With Other Skills

| Caller | When | What it calls |
|--------|------|---------------|
| `/marketing audit` | Monthly content audit | Calls `/audit links seo schema-validity image-audit sitemap-audit` |
| `/release <pkg>` | Pre-flight before npm publish | Calls `/audit links` for the affected site (soft warning) |
| `/review-all` | Quarterly mega-review | Calls `/audit all` |
| `/complete` | Session end | Calls `/audit completeness` only |
| `/infra ci` | CI health check | Calls `/audit infra-health` |

## Status

**Current state**: Just the registry and CLI sketch. Most "(planned)" rows still need their home-skill audit implemented before this orchestrator can call them.

**Next steps** (in order):
1. Add `bun audit` CLI that reads the registry and dispatches
2. Wire `links` (already implemented in `scripts/check-site-links.sh`)
3. Implement `repo-metadata` (km-infra.repo-metadata-audit) — first new audit caught by /big analysis
4. Migrate one existing audit (`legal`?) into the registry
5. Add `lastrun.json` tracking + `--status` command
6. Build the SUMMARY.md dashboard renderer

See `km-infra.audit-all` for the full design + roadmap.

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Implement audit logic in this skill | Each audit lives in its home skill — this skill only orchestrates |
| Add audits ad-hoc without registering | Drift means the dashboard misses things |
| Make all audits run on every invocation | Use cadences + `due` mode to keep daily runs fast |
| Block on audit failures by default | Most are soft warnings; only `--strict` mode blocks |
| Reinvent the report format per audit | Each audit's native format is fine; the orchestrator unifies via SUMMARY.md |
