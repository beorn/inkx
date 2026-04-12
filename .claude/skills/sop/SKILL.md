---
description: "SOP / ops — scan→propose→execute across 11 maintenance domains. The one skill that grooms everything. Alias: /ops"
argument-hint: "[domain|all|due] [--scan-only] [--fix] [--weekly|--monthly|--quarterly]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, Skill, AskUserQuestion
benefits-from: [recall, pm, infra]
---

# SOP — Standard Operating Procedure

**Keywords**: sop, ops, maintain, groom, audit, review, health check, periodic, refresh, cloudflare, domain

One skill to groom everything. Each domain owns assets, runs checks (scan→propose→execute), and triggers other domains reactively.

## Usage

```
/sop              # Run all due domains (cadence-based)
/ops              # Alias for /sop
/sop all          # Run everything regardless of cadence
/sop code         # Just one domain
/sop code,packages,sites  # Multiple domains
/sop infra cloudflare     # Cloudflare operations (domains, DNS, redirects)
/sop --scan-only  # Scan all, report, don't propose/execute
/sop --weekly     # Only domains with weekly+ cadence
/sop --monthly    # Only domains with monthly+ cadence
/sop --quarterly  # All domains (quarterly = everything)
/sop update       # Meta: update SOP itself from current context
```

### CLI Tool (`tools/sop.ts`)

Mechanical check runner — runs shell commands, parses output, tracks cadence, renders dashboard.

```bash
bun tools/sop.ts scan              # Run due domains
bun tools/sop.ts scan --all        # Run all regardless of cadence
bun tools/sop.ts scan code         # Just code domain
bun tools/sop.ts scan code backlog # Multiple domains
bun tools/sop.ts status            # What's due, last run times
bun tools/sop.ts dashboard         # Last results
bun tools/sop.ts help              # Show usage
```

State persisted to `.claude/skills/sop/state.json` (last run times + findings per domain).

Domain definitions and check parsers are exported from `tools/sop.ts` as `DOMAINS` for programmatic access.

### `/sop update` — self-improvement

Looks at the current session's context (recent commits, beads closed, tribe messages, bugs hit, workarounds applied) and proposes updates to the SOP:

- **New checks**: "you manually ran `npm audit` — should that be a check in the security domain?"
- **Missing assets**: "release.ts was modified but isn't tracked as an infra asset"
- **New triggers**: "silvery exports broke tests — add code.change → packages.check(exports) trigger?"
- **Cadence drift**: "you ran legal checks twice this week but it's set to quarterly — adjust?"
- **Domain gaps**: "you spent 30 min on bundle size analysis — should packaging domain have a bundle-size check?"
- **Workflow capture**: "this session's pattern (fix → verify → release → update docs) is a repeatable workflow — codify as a check sequence?"

Reads: recent git log, open beads, tribe history, session recall. Proposes edits to SKILL.md. User approves before writing.

This is how `/sop` learns — every session that does maintenance work feeds back into the SOP definition.

**MECE invariant**: every proposed change must preserve mutual exclusivity and collective exhaustiveness across the 11 domains. If a new check doesn't clearly belong to exactly one domain, that's a signal the domain boundaries need adjusting — don't just shove it somewhere. If a gap is found (something that doesn't belong anywhere), propose a new domain or expand an existing one's boundary. The domain structure is the load-bearing abstraction — protect it.

### Organizing principles

**Function-first**: organize by function (release, quality, reference, lessons) not by project (silvery, km, termless). Products standardize to fit functions; functions become comprehensive across all projects. Only break out project-specific knowledge when a function genuinely can't hold it (e.g., pipeline debugging is too deep for a general quality function). Function-first reduces coordination cost and keeps expertise concentrated.

When both function and project knowledge exist for the same area, the carveout must be explicit: "release owns the process, silvery owns silvery-specific release knowledge. If it applies to all packages, it's release's. If it only matters for silvery, it's silvery's."

**7±5 grouping**: when any level reaches 10+ items, consider sub-grouping. Homogeneous lists (all postmortems, all lookup tables) can be longer. Mixed lists (different types/purposes) should stay under 7-12.

**Information architecture**: every piece of information lives in exactly one canonical home. Docs organized by purpose (design, lessons, ref, guide, future). Agent knowledge files contain reference index + canonical cross-cutting sections + staging area. See `.claude/agents/expert/INFO-ARCHITECTURE.md`.

**Each domain = context + procedures + expert**: a domain bundles what you need to know (context/docs), how to do things (procedures/skills), and who maintains it (expert agent). Load a domain and you have everything.

**Skill frontmatter conventions** (from gstack):
- `benefits-from: [skill1, skill2]` — upstream context that makes this skill work better. If the upstream hasn't run, offer to run it first.
- `escalate-to: {agent: "condition"}` — when to delegate to a specialist agent instead of handling in-session.
- These enable context continuity between skills and clear agent handoff rules.

**Behavioral triggers** (from gbrain): use Always/Before/When/Never format for agent disciplines. See `.claude/agents/expert/INFO-ARCHITECTURE.md#behavioral-triggers`.

**RESOLVER.md**: mechanical MECE enforcement via decision tree. Walk it before writing any documentation. See `RESOLVER.md` at repo root.

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

## 11 Domains

Domains are MECE by ownership boundary:
- **code** = product/source correctness (types, lint, tests, complexity)
- **packages** = publishability + dependency freshness (versions, exports, lockfiles)
- **security** = supply chain integrity (CVE patches, secret scanning, provenance, permissions)
- **packaging** = shipped artifact quality (bundle sizes, dep counts, tree-shaking, CJS/ESM compat)
- **sites** = owned web/doc asset freshness (triggered by other domains)
- **infra** = machinery that validates/builds/releases/automates (CI, hooks, tools, accounts)
- **legal** = license + attribution compliance
- **market** = external world changes (detects; sites/packages respond)
- **growth** = our reach metrics (measures; informs content strategy)
- **inbound** = external signal intake (issues, mentions, DMs)
- **backlog** = internal work graph integrity (beads, priorities, staleness)

**Boundary notes** (from Pro review — address overlap):
- **packages** owns dep freshness + release readiness. **security** owns CVEs + supply chain. **legal** owns licenses. One dep scan, three lenses.
- **code** owns product correctness. **infra** owns the machinery that checks it. CI is infra; test results are code.
- **packaging** owns what consumers receive (bundle analysis, exports, CJS/ESM). **packages** owns what we publish (versions, registry state). Packaging feeds market positioning.
- Cross-domain triggers are **check enqueuers**, not autonomous actions. They add items to the next domain's scan queue; execution still requires approval.

### v1 scope (5 domains — backed by working skills)

Start here. These are automatable and already have skill implementations.

### 1. code — is the codebase clean?

**Assets**: source files, typecheck baseline, lint config, complexity reports, test results
**Cadence**: per-session (split by cost — fast checks default, full suite on --deep)
**Checks**:
- [ ] `typecheck` — `bash infra/typecheck/check.sh` (baseline drift)
- [ ] `lint` — `bun fix` (oxlint + oxfmt)
- [ ] `test-fast` — `bun run test:fast` (6000+ tests) — session default
- [ ] `test-ci` — `bun run test:ci` (full suite) — weekly or --deep only
- [ ] `complexity` — `bun lint:complexity` (cognitive complexity hotspots)
- [ ] `code-quality` — `/code quality --dry-run` (principles compliance)
- [ ] `perf-regression` — benchmark drift detection (when benchmarks exist)
**Triggers**: any source change
**Delegates to**: `/code`, `/tests`, `/complete`, `/perf`

### 2. packages — are packages publishable?

**Assets**: package.json files, CHANGELOG.md, npm-packages.md, npm registry state, lockfiles
**Cadence**: monthly
**Checks**:
- [ ] `version-drift` — `bun npm-registry audit` (local vs npm)
- [ ] `exports-correct` — `bun release verify <pkg>` (pack + install + import)
- [ ] `unreleased` — `bun release status` (commits since last tag)
- [ ] `dep-security` — `npm audit` across repos (CVEs in deps)
- [ ] `dep-freshness` — outdated deps, pinned old versions, major-version candidates
- [ ] `publishability` — `bun infra/audit-packages.ts` (tsdown, publishConfig, files)
- [ ] `clean-build` — all packages build from clean state, no uncommitted generated output
- [ ] `lockfile-consistency` — lockfiles match manifests, no phantom deps
- [ ] `submodule-state` — vendor submodules clean, not detached, not drifted from remote
**Triggers**: code changes, upstream dep bumps
**Delegates to**: `/release`, `/npm`, `/repo-health`
**Execute**: bump, build, verify, publish (`bun release execute`)

### 3. inbound — what needs our attention?

**Assets**: GitHub issue triage state, security advisory log, mention log
**Cadence**: weekly
**Checks**:
- [ ] `untriaged-issues` — GitHub issues/PRs not yet converted to beads
- [ ] `unpatched-cves` — `npm audit` findings not yet addressed
- [ ] `stale-prs` — PRs open > 2 weeks
- [ ] `mentions` — Twitter/X mentions, DMs (when connected — optional)
- [ ] `email` — support emails (when relevant — optional)
**Triggers**: GitHub events (tribe github plugin), npm audit
**Delegates to**: `/pm`, tribe github plugin
**Execute**: triage to beads, patch CVEs, respond to mentions

### 4. backlog — is the house tidy?

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

### 5. sites — are docs current?

**Assets**: silvery.dev, termless.dev, terminfo.dev, loggily.dev, mdspec.org, beorn.codes/flexily, all READMEs
**Cadence**: per-release
**Checks**:
- [ ] `link-check` — `scripts/check-site-links.sh` (broken links)
- [ ] `freshness` — package version changed since docs last touched?
- [ ] `readme-versions` — do READMEs reference current versions?
- [ ] `changelog-gap` — unreleased changes without CHANGELOG entries?
- [ ] `gsc-properties` — all sites have GSC properties with sitemaps submitted
- [ ] `gsc-coverage` — no indexing errors or drops (GSC API)
**Triggers**: packages.publish, code.api-change, new domain setup
**Delegates to**: `/docs`, `/project-audit`

#### Google Search Console

OAuth2 credentials at `~/.config/gcloud/gsc-credentials.json` (refresh token, auto-renews). Covers all properties owned by the Google account.

**6 verified properties** (all with sitemaps submitted):
- `sc-domain:silvery.dev`, `sc-domain:termless.dev`, `sc-domain:terminfo.dev`
- `sc-domain:beorn.codes`, `sc-domain:loggily.dev`, `sc-domain:mdspec.org`

```python
# Get access token
import json, urllib.request, urllib.parse
creds = json.load(open('~/.config/gcloud/gsc-credentials.json'))
data = urllib.parse.urlencode({
    'client_id': creds['client_id'], 'client_secret': creds['client_secret'],
    'refresh_token': creds['refresh_token'], 'grant_type': 'refresh_token'
}).encode()
resp = json.load(urllib.request.urlopen(urllib.request.Request(
    'https://oauth2.googleapis.com/token', data=data)))
token = resp['access_token']

# List properties
# GET https://www.googleapis.com/webmasters/v3/sites

# Submit sitemap
# PUT https://www.googleapis.com/webmasters/v3/sites/{site}/sitemaps/{sitemap}

# Check indexing coverage
# GET https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query
```

**New domain workflow**: add DNS (Cloudflare API) → add GSC property (PUT) → get verification token → add TXT record (Cloudflare) → verify (POST siteVerification) → submit sitemap.

### v2 scope (add when v1 is stable)

### 6. infra — is the machinery working?

**Assets**: CI workflows, git hooks, .claude/skills/*, MCP configs, tool versions, accountly, Cloudflare zones/domains/workers
**Cadence**: monthly
**Boundary**: owns tooling/automation/credentials/hosting — not product correctness, not package content
**Checks**:
- [ ] `ci-health` — `/infra ci` (GitHub Actions status across repos)
- [ ] `hook-integrity` — are hooks registered and functional?
- [ ] `skill-health` — `/systematize review` (stale/broken skills)
- [ ] `tool-versions` — tsdown, vitest, oxlint up to date?
- [ ] `account-health` — `bun accountly status` (credentials, quotas)
- [ ] `secret-scan` — no tokens/keys in committed code
- [ ] `branch-protection` — workflow permissions, push rules
- [ ] `cf-domain-expiry` — domains expiring within 60 days (Cloudflare Registrar API)
- [ ] `cf-dns-health` — zones active, DNS records resolving, no orphan zones
- [ ] `cf-pages-health` — Pages projects deploying, custom domains attached
**Triggers**: tool version updates, new repos, domain expiry approaching
**Delegates to**: `/infra`, `/claude`, `/systematize`

#### Cloudflare Operations

Cloudflare manages all owned domains, DNS, Workers, and Pages. All operations use `$CLOUDFLARE_API_TOKEN` (account `3fea5563acad414fa36c40d5c440368f`).

**Domains** (69 registered):
```bash
# List all domains with expiry
curl -s "https://api.cloudflare.com/client/v4/accounts/3fea5563acad414fa36c40d5c440368f/registrar/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Check domain availability (for purchase)
# Note: use zones API to add, registrar API to manage
```

**DNS**:
```bash
# List records for a zone
curl -s "https://api.cloudflare.com/client/v4/zones/<zone_id>/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Create record
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/<zone_id>/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"sub","content":"target.example.com","proxied":true}'
```

**Redirects** (URL rewrites):
```bash
# Page rules (legacy, 3 free per zone)
curl -s "https://api.cloudflare.com/client/v4/zones/<zone_id>/pagerules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Bulk redirects (modern, unlimited)
curl -s "https://api.cloudflare.com/client/v4/accounts/3fea5563acad414fa36c40d5c440368f/rules/lists" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

**Workers & Pages**:
```bash
# List Workers
curl -s "https://api.cloudflare.com/client/v4/accounts/3fea5563acad414fa36c40d5c440368f/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# List Pages projects
curl -s "https://api.cloudflare.com/client/v4/accounts/3fea5563acad414fa36c40d5c440368f/pages/projects" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

**Zone lookup** (name → zone_id):
```bash
curl -s "https://api.cloudflare.com/client/v4/zones?name=beorn.codes" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])"
```

**Known zones** (partial): beorn.codes (`a8b254064b15eefaa85271603c4a192b`), terminfo.dev, silvery.dev, etc. — 50+ total.

**Token permissions**: zones read/write, registrar read/write, Workers/Pages read. Missing: analytics (add if growth domain needs it).

### 7. legal — are we compliant?

**Assets**: LICENSE files, NOTICE, dep license cache
**Cadence**: quarterly
**Checks** (v1: lightweight only):
- [ ] `license-files` — every public package has LICENSE?
- [ ] `license-report` — generate dep license report, flag unknown/forbidden
- [ ] `dep-compliance` — no GPL in MIT-licensed packages?
**Triggers**: new dependencies added (→ packages)
**Delegates to**: `/legal`
**Note**: Nuanced attribution deferred until tooled.

### 8. security — is the supply chain safe?

**Assets**: npm audit results, secret scan results, provenance config, branch protection state
**Cadence**: weekly
**Checks**:
- [ ] `cve-scan` — `npm audit` across all repos (known vulnerabilities)
- [ ] `secret-scan` — no tokens, keys, or credentials in committed code
- [ ] `provenance` — npm publish provenance enabled where possible
- [ ] `permissions` — branch protection rules, workflow permissions, push rules
- [ ] `dep-confusion` — no private package names squattable on public registry
- [ ] `lockfile-integrity` — lockfiles not tampered, match manifests
**Triggers**: new dependencies added, inbound CVE alert
**Delegates to**: (new — consolidates checks from packages + infra + inbound)
**Boundary**: security owns CVE response + supply chain integrity. Packages owns dep freshness. Legal owns licenses. One dep graph, three lenses.

### 9. packaging — what do consumers receive?

**Assets**: bundle size reports, dep count reports, tree-shaking analysis, CJS/ESM compat results
**Cadence**: per-release
**Checks**:
- [ ] `bundle-size` — track dist sizes per package over time, flag growth
- [ ] `dep-count` — total transitive deps per package (fewer = better for positioning)
- [ ] `tree-shaking` — verify unused exports don't bloat consumer bundles
- [ ] `cjs-esm-compat` — `arethetypeswrong` for all public packages
- [ ] `zero-dep-claim` — packages claiming zero deps actually have zero deps
- [ ] `install-size` — `npm install` footprint (matters for docs + comparisons)
**Triggers**: packages.publish (new release → re-measure), code.change (source change → check drift)
**Delegates to**: `/release verify` (attw), (new bundle analysis tool)
**Execute**: update size reports, flag regressions, feed data to market positioning + sites
**Note**: Packaging data directly feeds market domain (competitive comparisons) and sites domain (README badges, "zero deps" claims).

### v3 scope (aspirational — need data sources first)

### 10. market — what changed in the world?

**Assets**: comparison docs, terminfo.dev probes, upstream version pins
**Cadence**: monthly
**Boundary**: detects world changes — sites/packages respond with asset updates
**Checks**:
- [ ] `competitor-versions` — Ink, blessed, terminal-kit new releases?
- [ ] `upstream-deps` — React, xterm.js, Yoga, zustand major bumps?
- [ ] `terminal-releases` — new Ghostty, WezTerm, Kitty, iTerm2 versions?
**Triggers**: npm releases of competitors, terminal release announcements
**Delegates to**: `/ink-compat`, `/terminfo-update`, `/deep` (research)
**Execute**: update comparisons, run probes, regenerate terminfo.dev
**Note**: v1 alternative — reduce to "upstream version watchlist check" only.

### 11. growth — how are we doing?

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
**Note**: Deferred until reliable data source commands exist.

## Tribe Integration

`/sop` broadcasts to tribe at every phase transition so other sessions stay informed and can flag gotchas.

**Start**: `tribe_broadcast("SOP starting — scanning [domains]. Reply with gotchas or blocks if any.")`

**Per-domain scan complete**: `tribe_broadcast("SOP [domain]: [summary]. N findings, M actions proposed.")`

**Before execute**: `tribe_broadcast("SOP executing [N actions]. Last call for objections (30s).")`
- Wait for responses. Any session can reply with "block: [reason]" to halt a specific action.
- This catches things only active sessions know: "don't publish silvery, I have uncommitted layoutDirty changes" or "termless CI is broken, skip verify"

**Non-minor findings**: `tribe_broadcast("SOP [domain] ⚠ [finding summary]")` — any warn/error finding broadcast immediately so other sessions can react or avoid conflicting work.

**After execute**: `tribe_broadcast("SOP complete: [dashboard summary]")`

**Domain agents** can also `tribe_send(to="*", type="query", ...)` to ask active sessions about their domain before proposing actions. Example: packaging agent asks "any known bundle regressions?" before flagging size growth.

## Cross-Domain Triggers

```
code.change(API)         → sites.check(freshness) + packages.check(unreleased)
packages.publish(v0.18)  → sites.update(READMEs) + packaging.measure(sizes) + growth.check(downloads) + backlog.close(beads)
packages.dep-add(new)    → legal.check(license-compat) + security.check(dep-confusion)
packaging.measure(sizes) → sites.update(badges) + market.update(comparisons)
market.detect(Ink 8)     → sites.update(comparison) + growth.check(losing downloads?)
inbound.triage(CVE)      → security.check(cve-scan) + code.fix(patch) + packages.release(security bump)
inbound.triage(issue)    → backlog.create(bead)
```

## Dashboard Output

```
SOP Report — 2026-04-12

  code        ✓ 6227 tests pass, 0 lint errors, baseline clean
  packages    ⚠ 3 repos with unreleased changes (silvery, loggily, termless)
  inbound     ✓ 0 untriaged issues, 0 CVEs
  backlog     ⚠ 3 stale P2 beads, 2 orphan deps
  sites       ⚠ silvery.dev API docs stale (last updated v0.17.4, current v0.17.4+14 commits)
  ---
  security    ✓ 0 CVEs, no secrets detected
  packaging   ⚠ silvery bundle +12KB since v0.17.4 (investigate)
  infra       ✓ 5/7 CI green
  legal       ✓ all licenses compatible (last checked 2026-03-15)
  market      — not yet wired
  growth      — not yet wired

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

`/sop` absorbs the organizational/audit layer. These skills get deleted once `/sop` is wired:
- `/audit` — replaced by `/sop` (its check registry becomes domain entries)
- `/review-all` — replaced by `/sop --scan-only` (its sections map to domains)
- `/project-audit` — absorbed into `sop.code` + `sop.sites`
- `/project-cleanup` — absorbed into `sop.infra`
- `/repo-health` — absorbed into `sop.packages`
- `/complete` — absorbed into `sop.code` + `sop.backlog`

Domain-specific skills stay as standalone entry points (useful for focused work):
- `/release`, `/code`, `/tests`, `/legal`, `/infra`, `/pm`, `/npm`, `/docs`

`/sop` delegates to these. They don't know about `/sop` — they just do their job and return findings.

## Implementation Roadmap

**v1** (5 domains — wire existing skills):
1. code, packages, inbound, backlog, sites
2. Cadence tracking (state.json)
3. Dashboard renderer
4. `--scan-only` mode

**v2** (add security + packaging + infra + legal):
5. security domain (npm audit, secret scan, provenance)
6. packaging domain (bundle sizes, dep counts, CJS/ESM compat)
7. infra domain wired
8. legal domain wired (lightweight)
9. Cross-domain triggers (reactive — as check enqueuers)
10. `--fix` auto-execute mode

**v3** (add market + growth):
11. market domain (upstream watchlist, competitor probes)
12. growth domain (npm/GitHub/Cloudflare data sources)
13. Content generation proposals from market+growth signals

## Agent Architecture (future)

Each domain can optionally run as a separate subagent — keeps domain knowledge concentrated and context small. `/sop` orchestrator spawns domain agents in parallel (following `/max` pattern), collects findings, merges dashboard.

Benefits: domain agent has focused context (only its assets + checks), can be specialized (security agent knows CVE databases, market agent knows competitor APIs), and independent domains run in parallel.

Pattern: `/sop` spawns 11 agents → each runs scan → findings collected → proposals merged → user reviews → approved actions executed.

This matches the tribe model — each domain agent is like a tribe member with a specialty.
