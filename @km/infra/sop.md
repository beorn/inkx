---
id: "@km/infra/sop"
aliases:
  - km-infra.sop
  - km-infra-sop
created_by: Bjørn Stabell
created_at: 2026-04-12T17:14:37Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.sop
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-12T10:15:00Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [/] SOP: unified scan→propose→execute framework for all project maintenance @km/infra #task #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

SOP: unified scan→propose→execute framework for all project maintenance. 11 domains, 4 expert agents, tribe-integrated, self-improving.

## Design (DONE)
- 11 MECE domains: code, packages, security, packaging, sites, infra, legal, market, growth, inbound, backlog
- Uniform check shape: scan→propose→execute with approval gating
- Cross-domain triggers as check enqueuers
- Tribe broadcasting at every phase + gotcha collection
- /sop update for self-improvement with MECE invariant
- 4 expert agents: silvery (render), km (app), npm (releases), arch (principles)
- Asset registry (ASSETS.md) for agent activation lookup
- Skill consolidation plan: 55→12 (@km/infra/skill-consolidation)

## Build (TODO — path to 100% quality plateau)

### Phase 1: Seed expert agent knowledge files
- [ ] Run arch agent in 'update' mode — scan codebase, create arch-knowledge.md
- [ ] Run silvery agent in 'update' mode — scan pipeline, create silvery-knowledge.md
- [ ] Run km agent in 'update' mode — scan app, create @km/knowledge/md
- [ ] Run npm agent in 'update' mode — scan packages/registry, create npm-knowledge.md
Each should be a comprehensive snapshot of current state, not a stub.

### Phase 2: Wire v1 domain checks (5 domains)
- [ ] code domain: typecheck → bash infra/typecheck/check.sh, lint → bun fix, test-fast → bun run test:fast
- [ ] packages domain: version-drift → bun npm-registry audit, unreleased → bun release status, publishability → bun infra/audit-packages.ts
- [ ] inbound domain: untriaged-issues → gh api for open issues not in beads, unpatched-cves → npm audit
- [ ] backlog domain: stale-beads → bd stale, orphan-deps → bd orphans, priority-drift → bd list P0/P1 older than 1 week
- [ ] sites domain: link-check → scripts/check-site-links.sh, changelog-gap → git log vs CHANGELOG.md

### Phase 3: Build the orchestrator
- [ ] state.json cadence tracking (lastRun per domain, due calculation)
- [ ] Dashboard renderer (structured output, pass/warn/error per domain)
- [ ] Check dispatcher (invoke checks, collect findings, merge)
- [ ] --scan-only mode (scan all, report, don't propose/execute)
- [ ] Tribe broadcasting (start, per-domain findings, before execute, complete)

### Phase 4: Connect /sop to expert agents
- [ ] /sop invokes expert agents for deep diagnosis when scan finds issues in their domain
- [ ] Expert agents update their knowledge files after each invocation
- [ ] ASSETS.md lookup: when a file is modified, determine which agent to consult

### Phase 5: Resolve MECE overlaps
- [ ] npm audit: packages owns security scanning, security owns CVE response (split the check, not the data)
- [ ] Build correctness: code owns test results, packages owns verify gate, infra owns CI health (different questions about same artifact)
- [ ] Remove duplicate checks that appear in multiple domains

### Phase 6: Wire v2 domains
- [ ] security domain: npm audit (CVE lens), secret scanning (grep for tokens), provenance check
- [ ] packaging domain: bundle size tracking, dep count, tree-shaking verify, CJS/ESM compat (attw)
- [ ] infra domain: CI health (gh api), hook integrity, tool versions, account health (accountly)
- [ ] legal domain: license-files check, dep license report, forbidden license flag

### Phase 7: Absorb old skills
- [ ] Migrate /audit check registry into /sop domain checks
- [ ] Migrate /review-all sections into /sop domains
- [ ] Migrate /complete into sop.code + sop.backlog
- [ ] Migrate /project-audit, /project-cleanup, /repo-health into sop domains
- [ ] Delete absorbed skills, update CLAUDE.md references
- [ ] Verify no broken /skill references across all docs

### Phase 8: Wire v3 domains
- [ ] market domain: npm version watchlist for competitors, upstream dep major-version scanner
- [ ] growth domain: npm download trends (bun npm-registry list), GitHub stars (gh api)
- [ ] Content generation proposals from market+growth signals

### Phase 9: /sop update self-improvement
- [ ] Reads git log, open beads, tribe history, session recall
- [ ] Proposes new checks, cadence adjustments, domain boundary changes
- [ ] MECE validation on every proposed change
- [ ] Writes proposed SKILL.md edits for user approval

### Phase 10: Polish
- [ ] Expert agents maintain CLAUDE.md sections during grooming (verify the update protocol works)
- [ ] Cross-domain triggers working (code.change → sites.check, packages.publish → backlog.close)
- [ ] Full /sop run produces clean dashboard with 0 false positives
- [ ] /sop --monthly, --weekly, --quarterly cadence filters working
- [ ] git lock auto-recovery (@km/infra/git-lock-recovery)

## Quality plateau criteria
- /sop runs end-to-end with all 11 domains
- Every domain has ≥1 working check
- Expert agents have seeded knowledge files
- ASSETS.md is complete (no 'Unassigned' section)
- Old audit/review skills are deleted
- Dashboard produces actionable findings, not noise
- Tribe broadcasting works at every phase
- /sop update proposes meaningful improvements from session context