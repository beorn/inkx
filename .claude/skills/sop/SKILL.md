---
description: "SOP — scan→propose→execute across 9 maintenance domains. The one skill that grooms everything."
argument-hint: "[domain|all|due] [--scan-only] [--fix] [--weekly|--monthly|--quarterly]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, Skill, AskUserQuestion
---

# SOP — Standard Operating Procedure

**Keywords**: sop, maintain, groom, audit, review, health check, periodic, refresh

One skill to groom everything. Each domain owns assets, runs checks (scan→propose→execute), and triggers other domains reactively.

## Usage

```
/sop              # Run all due domains (cadence-based)
/sop all          # Run everything regardless of cadence
/sop code         # Just one domain
/sop code,packages,sites  # Multiple domains
/sop --scan-only  # Scan all, report, don't propose/execute
/sop --weekly     # Only domains with weekly+ cadence
/sop --monthly    # Only domains with monthly+ cadence
/sop --quarterly  # All domains (quarterly = everything)
```

## Architecture

Every maintenance task has the same shape:

```
Check {
  id: string
  domain: Domain
  scan: () → Finding[]
  propose: (findings) → Action[]
  execute: (action) → void
  approval: "auto" | "ask"
  cadence: "session" | "weekly" | "monthly" | "quarterly"
}
```

`/sop` = for each domain whose cadence is due, run checks, propose actions, execute (with approval where needed), produce dashboard.

## 9 Domains

### 1. code — is the codebase clean?

**Assets**: source files, typecheck baseline, lint config, complexity reports, test results
**Cadence**: per-session
**Checks**:
- [ ] `typecheck` — `bash infra/typecheck/check.sh` (baseline drift)
- [ ] `lint` — `bun fix` (oxlint + oxfmt)
- [ ] `test-fast` — `bun run test:fast` (6000+ tests)
- [ ] `test-ci` — `bun run test:ci` (full suite with slow + vendor + fuzz)
- [ ] `complexity` — `bun lint:complexity` (cognitive complexity hotspots)
- [ ] `code-quality` — `/code quality --dry-run` (principles compliance)
**Triggers**: any source change
**Delegates to**: `/code`, `/tests`, `/complete`

### 2. packages — are packages publishable?

**Assets**: package.json files, CHANGELOG.md, npm-packages.md, npm registry state
**Cadence**: monthly
**Checks**:
- [ ] `version-drift` — `bun npm-registry audit` (local vs npm)
- [ ] `exports-correct` — `bun release verify <pkg>` (pack + install + import)
- [ ] `unreleased` — `bun release status` (commits since last tag)
- [ ] `dep-audit` — `npm audit` across repos (security)
- [ ] `publishability` — `bun infra/audit-packages.ts` (tsdown, publishConfig, files)
**Triggers**: code changes, upstream dep bumps
**Delegates to**: `/release`, `/npm`, `/repo-health`
**Execute**: bump, build, verify, publish (`bun release execute`)

### 3. sites — are docs current?

**Assets**: silvery.dev/*, termless.dev/*, terminfo.dev/*, loggily docs/*, flexily docs/*, all READMEs
**Cadence**: per-release
**Checks**:
- [ ] `link-check` — `scripts/check-site-links.sh` (broken links)
- [ ] `freshness` — API surface changed since docs last updated?
- [ ] `readme-versions` — do READMEs reference current versions?
- [ ] `seo` — `/marketing seo-check` (meta tags, sitemap, robots.txt)
- [ ] `changelog-gap` — unreleased changes without CHANGELOG entries?
**Triggers**: packages.publish, code.api-change
**Delegates to**: `/docs`, `/project-audit`, `/marketing`

### 4. infra — is the machinery working?

**Assets**: CI workflows, git hooks, .claude/skills/*, MCP configs, tool versions, accountly
**Cadence**: monthly
**Checks**:
- [ ] `ci-health` — `/infra ci` (GitHub Actions status across repos)
- [ ] `hook-integrity` — are hooks registered and functional?
- [ ] `skill-health` — `/systematize review` (stale/broken skills)
- [ ] `tool-versions` — tsdown, vitest, oxlint up to date?
- [ ] `account-health` — `bun accountly status` (credentials, quotas)
**Triggers**: tool version updates, new repos
**Delegates to**: `/infra`, `/claude`, `/systematize`

### 5. legal — are we compliant?

**Assets**: LICENSE files, NOTICE, dep license cache
**Cadence**: quarterly
**Checks**:
- [ ] `license-compat` — all deps have compatible licenses?
- [ ] `license-files` — every public package has LICENSE?
- [ ] `attribution` — third-party code properly attributed?
- [ ] `dep-compliance` — no GPL in MIT-licensed packages?
**Triggers**: new dependencies added (→ packages)
**Delegates to**: `/legal`

### 6. ecosystem — what changed in the world?

**Assets**: comparison docs, terminfo.dev probes, upstream version pins
**Cadence**: monthly
**Checks**:
- [ ] `competitor-versions` — Ink, blessed, terminal-kit new releases?
- [ ] `upstream-deps` — React, xterm.js, Yoga, zustand major bumps?
- [ ] `terminal-releases` — new Ghostty, WezTerm, Kitty, iTerm2 versions?
- [ ] `positioning-drift` — comparison pages reference outdated versions?
**Triggers**: npm releases of competitors, terminal release announcements
**Delegates to**: `/ink-compat`, `/terminfo-update`, `/deep` (research)
**Execute**: update comparisons, run probes, regenerate terminfo.dev

### 7. reach — how are we doing?

**Assets**: analytics dashboards, download trends, star counts, social profiles
**Cadence**: monthly
**Checks**:
- [ ] `npm-downloads` — weekly download trends (growing/flat/declining?)
- [ ] `github-stars` — star velocity, fork count, traffic
- [ ] `site-traffic` — Cloudflare analytics (pageviews, referrals, top pages)
- [ ] `social` — follower counts, mention volume (when accounts exist)
**Triggers**: packages.publish (expect download spike), sites.deploy
**Delegates to**: (new — no existing skill yet)
**Execute**: update growth dashboard, propose content for high-performing areas

### 8. inbound — what needs our attention?

**Assets**: GitHub issue triage state, security advisory log, mention log
**Cadence**: weekly
**Checks**:
- [ ] `untriaged-issues` — GitHub issues/PRs not yet converted to beads
- [ ] `unpatched-cves` — `npm audit` findings not yet addressed
- [ ] `stale-prs` — PRs open > 2 weeks
- [ ] `mentions` — Twitter/X mentions, DMs (when connected)
- [ ] `email` — support emails (when relevant)
**Triggers**: GitHub events (tribe github plugin), npm audit
**Delegates to**: `/pm`, tribe github plugin
**Execute**: triage to beads, patch CVEs, respond to mentions

### 9. backlog — is the house tidy?

**Assets**: beads (.beads/), session history, roadmap
**Cadence**: weekly
**Checks**:
- [ ] `stale-beads` — `bd stale` (no activity > 2 weeks)
- [ ] `orphan-deps` — `bd orphans` (broken dependency links)
- [ ] `unclosed-sessions` — session beads still in_progress
- [ ] `priority-drift` — P0/P1 beads older than 1 week
- [ ] `roadmap-alignment` — epic completion % (`bd epic status`)
**Triggers**: bead closures, session ends
**Delegates to**: `/pm review`, `bd doctor`
**Execute**: close stale, defer low-priority, archive completed epics

## Cross-Domain Triggers

```
code.change(API)         → sites.check(freshness) + packages.check(unreleased)
packages.publish(v0.18)  → sites.update(READMEs) + reach.check(downloads) + backlog.close(beads)
ecosystem.detect(Ink 8)  → sites.update(comparison) + reach.check(losing downloads?)
inbound.triage(CVE)      → code.fix(patch) + packages.release(security bump)
inbound.triage(issue)    → backlog.create(bead)
```

## Dashboard Output

```
SOP Report — 2026-04-12

  code        ✓ 6227 tests pass, 0 lint errors, baseline clean
  packages    ⚠ 3 repos with unreleased changes (silvery, loggily, termless)
  sites       ⚠ silvery.dev API docs stale (last updated v0.17.4, current v0.17.4+14 commits)
  infra       ✓ 5/7 CI green, 2 workflows need fix (termless, watcher-chaos)
  legal       ✓ all licenses compatible (last checked 2026-03-15)
  ecosystem   ⚠ Ink 7.0 comparison page references Ink 6.x
  reach       ✓ silvery 844 dl/wk (+12%), loggily 359 dl/wk (+8%)
  inbound     ✓ 0 untriaged issues, 0 CVEs
  backlog     ⚠ 3 stale P2 beads, 2 orphan deps

  Actions proposed: 4 (2 auto, 2 need approval)
```

## Cadence Tracking

State stored in `.claude/skills/sop/state.json`:
```json
{
  "lastRun": {
    "code": "2026-04-12T06:00:00Z",
    "packages": "2026-04-12T06:00:00Z",
    "sites": "2026-04-01T00:00:00Z",
    "legal": "2026-03-15T00:00:00Z"
  }
}
```

`/sop due` checks which domains haven't run within their cadence window.

## Relation to Existing Skills

`/sop` is the orchestrator. Existing skills become check implementations:

| Old entry point | Now callable via |
|---|---|
| `/audit` | `/sop all` (or specific domains) |
| `/review-all` | `/sop all --scan-only` |
| `/release` | `/sop packages` (or standalone) |
| `/code quality` | `/sop code` (or standalone) |
| `/legal` | `/sop legal` (or standalone) |
| `/infra` | `/sop infra` (or standalone) |
| `/pm review` | `/sop backlog` (or standalone) |

All leaf skills remain usable standalone. `/sop` adds: unified dashboard, cadence tracking, cross-domain triggers, MECE coverage guarantee.

## Implementation Status

**Scaffolding** — this skill file defines the vision. Checks marked `[ ]` are not yet wired. Implementation plan:

1. Wire the checks that already work (delegate to existing skills)
2. Add cadence tracking (state.json)
3. Add dashboard renderer
4. Add cross-domain triggers
5. Fill in missing checks (reach, ecosystem probes)
