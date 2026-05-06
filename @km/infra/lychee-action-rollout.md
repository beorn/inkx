---
mentions:
  - km
id: "@km/infra/lychee-action-rollout"
aliases:
  - km-infra.lychee-action-rollout
  - km-infra-lychee-action-rollout
created_by: Bjørn Stabell
created_at: 2026-04-07T01:42:19Z
owner: bjorn@stabell.org
---

# [ ] Roll out lychee-action to 5 vendor docs CI workflows @km/infra #task #P2

## Why

Per-PR link checking is the cheapest fast-feedback layer. Complements the cross-site /marketing link-check (which catches bit-rot but only on monthly cadence). The two layers are complementary:

| Layer                            | Catches                                                                 | Misses                                                             |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| lychee-action (per-repo, per-PR) | New broken links from PRs; weekly cron catches link rot in repo content | Cross-site links that break when site B deletes a page             |
| /marketing link-check (monthly)  | Cross-site rot, 3rd-party rot, bit-rot, sites without CI                | Brand-new breaks (no PR triggers detection until next monthly run) |

## Scope

Add `.github/workflows/links.yml` to each of these vendor repos:

- [ ] silvery (has docs.yml + release.yml)
- [ ] termless (has ci.yml + docs.yml + release.yml)
- [ ] terminfo.dev (has deploy.yml + release.yml + validate.yml)
- [ ] flexily (has ci.yml + docs.yml + release.yml + test.yml)
- [ ] loggily (has docs.yml + release.yml + test.yml)

Skip bearly + mdspec — no .github/workflows dir, would need a full CI setup first.

## Template

```yaml
name: links
on:
  pull_request:
    paths: ['**/*.md', '**/*.html', 'docs/**']
  schedule:
    - cron: "0 6 * * 1"  # Mondays 06:00 UTC
  workflow_dispatch:
jobs:
  lychee:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: lycheeverse/lychee-action@v2
        with:
          args: |
            --max-concurrency 24
            --no-progress
            --accept '200..=204,206,301,302,303,307,308,403,429'
            --exclude '^(mailto|tel|javascript):'
            './**/*.md'
            './**/*.html'
          fail: true
```

## Why same args as the cross-site script

Keep accept/exclude patterns aligned so per-PR and monthly runs agree on what's "broken". A link should not pass per-PR but fail monthly.

## Done when

- All 5 vendor repos have .github/workflows/links.yml
- One green run on each via workflow_dispatch
- Pre-existing broken links in each repo (if any) are either fixed or excluded with comment

## Parent

@km/infra/audit-all

