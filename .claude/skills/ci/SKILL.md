---
description: "CI/CD pipeline health — check GitHub Actions across all repos, fix failures. Alias for /infra ci."
argument-hint: [<repo>|all|fix]
---

# CI — Pipeline Health Check

**Keywords**: ci, cd, pipeline, github actions, workflow, failing, broken, build, deploy

Alias for `/infra ci`. Checks GitHub Actions workflow status across all vendor repos.

## Quick Check

```bash
# All repos at a glance
REPOS="silvery termless terminfo.dev flexily loggily bearly mdspec vimonkey"
for repo in $REPOS; do
  echo "=== $repo ==="
  gh run list --repo beorn/$repo --limit 3 --json status,conclusion,name,createdAt 2>/dev/null || echo "  (no workflows)"
done
```

## Sub-Commands

| Command | What |
|---------|------|
| `/ci` | Check all repos (default) |
| `/ci <repo>` | Check specific repo: `/ci silvery`, `/ci termless` |
| `/ci all` | Verbose: all workflows, all repos, last 5 runs each |
| `/ci fix` | Check + attempt to fix any failures (re-run, patch, push) |

## What It Checks

1. **Last run status** — green/red/pending for each workflow
2. **Recent failures** — Any `conclusion: "failure"` in last 5 runs
3. **Stale repos** — No CI runs in >7 days
4. **Doc deploys** — docs.yml / deploy.yml / deploy-docs.yml all passing
5. **Release workflows** — release.yml ready (npm auth, secrets configured)

## Fix Workflow

When a CI failure is found:
1. `gh run view <id> --repo beorn/<repo> --log-failed` — read the failure
2. Identify root cause (test failure, dependency, secret, config)
3. Fix locally if possible, push to trigger re-run
4. Or re-run directly: `gh run rerun <id> --repo beorn/<repo>`
5. For flaky tests: re-run first, investigate if it fails again

## Output Format

```
CI Health — 2026-04-01

  silvery      docs.yml ✓ (3h ago)  release.yml ✓ (1d ago)
  termless     ci.yml ✓ (2h ago)    docs.yml ✓ (2h ago)    release.yml ✓ (5d ago)
  terminfo.dev deploy.yml ✓ (1d ago)
  flexily      test.yml ✗ FAILED    ci.yml ✗ FAILED        release.yml ✓ (7d ago)
  loggily      test.yml ✓ (3d ago)  docs.yml ✓ (3d ago)
  mdspec       deploy-docs.yml ✓    release.yml ✓
  vimonkey     release.yml ✓ (14d ago)

  8/10 green | 2 failing (flexily) | 0 stale
```

## See Also

- `/infra` — Full infrastructure audit (CI + plugins + deploy + db + hooks)
- `/infra deploy` — Site deployment health
- `/release` — Version bump + npm publish + GitHub release
