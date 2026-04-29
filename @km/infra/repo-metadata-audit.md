---
id: "@km/infra/repo-metadata-audit"
aliases:
  - km-infra.repo-metadata-audit
  - km-infra-repo-metadata-audit
created_by: Bjørn Stabell
created_at: 2026-04-07T01:40:15Z
owner: bjorn@stabell.org
---

# [ ] Audit GitHub repo metadata across beorn/* (homepage, license, topics, description) @km/infra #task #P2

## Why

Hit on 2026-04-06: bearly's GitHub repo had homepage URL pointing at https://beorn.github.io/tools — a Pages site that no longer exists because the repo was renamed from beorn/tools → beorn/bearly. The dead link was on the GitHub repo card itself, invisible to /marketing seo-check, /marketing link-check, /marketing legal, etc. — none of those audit GitHub repo metadata.

## Scope

Audit fields on every public beorn/* repo:
- **homepage** — must resolve (200 OK), should match the canonical site for that package
- **description** — present, non-empty, doesn't reference renamed packages
- **license** — file present in repo + matches package.json license field
- **topics** — at least one, ideally aligned (terminal, tui, react, typescript, etc.)
- **default_branch** — should be 'main'
- **has_pages** — for docs sites, must be true
- **archived** — flag any unexpectedly archived repos

## Implementation

Probably ~50 lines: `gh api repos/beorn/$name` for each repo, validate fields, output structured findings. Drop into the future bun audit framework as audits/repo-metadata.ts.

## Parent

@km/infra/audit-all (the unified audit framework)