---
mentions:
  - km
id: "@km/infra/audit-all"
aliases:
  - km-infra.audit-all
  - km-infra-audit-all
created_by: Bjørn Stabell
created_at: 2026-04-07T01:40:01Z
owner: bjorn@stabell.org
---

# [ ] Unified audit framework + 'audit all' flow @km/infra #feature #P2

## Problem

Audits are scattered across ~16 separate workflows (/marketing audit|seo-check|legal|link-check|check, /complete, /code, /project-audit, /repo-health, /review-all, /infra, /silverize, /fp-check). Each is a hand-rolled bash + markdown checklist with its own report format, output path, and freshness tracking. Result: adding a new audit costs hours of glue, freshness is never tracked, and gaps go unnoticed (the dead bearly homepage URL pointing at /tools was invisible to every existing check until manually noticed).

## Vision

A unified `bun audit <name>` framework where each audit is a TS module exporting a structured `Report`. A common runner handles output paths, timestamps, summary aggregation, bead integration, and freshness tracking. `bun audit all` runs everything; `bun audit <name>` runs one. Reports land in a consistent format that a `/marketing audit` dashboard can render.

## Design (draft)

```typescript
// audits/<name>.ts
export const auditName = "links"
export const cadence = "weekly"
export async function run(opts: AuditOpts): Promise<AuditReport> { … }

interface AuditReport {
  name: string
  ranAt: string
  status: "pass" | "warn" | "fail"
  summary: { ok: number; warn: number; fail: number }
  findings: Finding[]
  raw?: string  // path to full output for drill-down
}

interface Finding {
  severity: "info" | "warn" | "error"
  scope: string  // site / package / file
  rule: string   // audit-specific rule id
  message: string
  fix?: string   // suggested action
}
```

## Audits to port + add (priority order)

1. **link-check** — port from scripts/check-site-links.sh (REFRAME #1, biggest immediate win)
2. **repo-metadata** — NEW, gh api repos/beorn/* — homepage URL valid? license file? topics set? description? (@km/infra/repo-metadata-audit)
3. **seo-check** — port from /marketing seo-check
4. **schema-validity** — JSON-LD schema.org validation
5. **image-audit** — OG images PNG, ≤100KB, dimensions present
6. **sitemap-audit** — well-formed, lastmod present, no 404s, matches actual pages
7. **package-consistency** — vendor packages share TS / vitest / eslint versions
8. **npm-publish-drift** — published vs in-repo, orphans, mismatches
9. **doc-code-drift** — docs pointing at code paths that don't exist
10. **tls-headers** — securityheaders.com / mozilla observatory API
11. **lighthouse-perf** — Core Web Vitals on each public page

## Why this approach

- Eliminates the 232-line bash wrapper for link-check (REFRAME found in /big analysis 2026-04-06)
- Makes adding a new audit cost ~30 lines instead of hours
- Centralizes "when did each audit last run" so /marketing audit becomes a dashboard
- Catches gaps the current setup misses (the bearly homepage URL is canonical)
- Aligned with @km/silvery/showcase-procedures runbook direction but scoped to ALL systems, not just silvery

## Done when

- [ ] `bun audit <name>` CLI exists with at least 3 audits ported
- [ ] link-check, repo-metadata, and one of (seo-check / schema-validity) live
- [ ] `bun audit all` runs everything in parallel and produces a dashboard
- [ ] Freshness tracked centrally (lastRun.json)
- [ ] /marketing audit becomes a wrapper that calls `bun audit all`
- [ ] /release pre-flight calls `bun audit all --strict` as a soft warning

