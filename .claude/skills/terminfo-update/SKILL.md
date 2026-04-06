---
description: terminfo.dev periodic refresh — discover, probe, validate, build, deploy. Run monthly or when upstream terminals release.
argument-hint: [discover|probe|validate|build|full|status]
allowed-tools: Bash, Read, Agent, Task, AskUserQuestion
---

# terminfo.dev Update

**Keywords**: terminfo, update, refresh, probe, discover, radar, explore

Run the terminfo.dev periodic refresh cycle. Discovers new terminal features, re-probes
all terminals, validates content, builds the site, and deploys.

**Directory**: All commands run from `cd /Users/beorn/Code/pim/km/vendor/terminfo.dev`.

## Modes

| Command | What it does | Duration |
|---|---|---|
| `/terminfo-update status` | Check what's stale, show radar stats | ~10s |
| `/terminfo-update discover` | Run explore queries + triage findings | ~5 min |
| `/terminfo-update probe` | Re-probe all terminals (headless + apps + mux) | ~5 min |
| `/terminfo-update validate` | Validate + build + check 404s | ~30s |
| `/terminfo-update build` | Build + deploy only | ~15s |
| `/terminfo-update full` | Complete refresh (all steps) | ~15 min |
| `/terminfo-update` (no args) | Same as `status` |

## Full Refresh Steps

### Step 1: Discover — what changed in the ecosystem?

```bash
cd /Users/beorn/Code/pim/km/vendor/terminfo.dev

# Check known sources for staleness
bun sitefile --check

# Run deep research queries (GPT-5.4 + web search → radar.jsonl)
bun run explore

# Show what was found
bun run radar stats
bun run radar list --type new-protocol
bun run radar list --type new-terminal
bun run radar list --type new-version
```

Cost: ~$0.20 for all 6 queries.

### Step 2: Triage — promote interesting findings

```bash
# Review findings
bun run radar show <id>

# Promote to candidates
bun run candidates promote <radar-id>

# Review and approve
bun run candidates list
bun run candidates approve <feature-id>

# Merge approved into features.json
bun run candidates merge
```

**Human review required** — never auto-merge to features.json.

### Step 3: Add probes for new features

For each new feature merged into features.json:

1. Add probe definition: `packages/probe-defs/src/<category>.ts`
2. Validate: `bun validate`

### Step 4: Re-probe all terminals

```bash
# Headless backends (automated, fast)
bun terminfo probe termless --all --force

# App probes — auto-launchable (Ghostty, iTerm2, Kitty, Terminal.app)
bun terminfo probe app --all --force

# App probes — manual daemon (Warp, VS Code, Cursor)
# In each terminal: bun terminfo probe server --start
# Then from here:
bun terminfo probe server --all

# Multiplexer pass-through (tmux, screen)
bun terminfo probe mux --all
```

**IMPORTANT**: Always probe ALL terminals — partial updates leave terminals at different
feature counts, which looks broken on the site.

### Step 5: Annotate new failures

If probes produce new failures, add explanations to `content/annotations.json`.
The probe command will exit with an error listing unannotated failures.

### Step 6: Regenerate derived content

```bash
bun analysis                    # Regenerate analysis.json commentary
bun scripts/generate-api.ts     # Regenerate API data + badges
```

### Step 7: Validate + build

```bash
bun validate                    # Check tag consistency, duplicates, missing fields
bun run build                   # Build static site (250+ pages)
bun scripts/check-404s.ts       # Verify no broken internal links
```

### Step 8: Deploy

```bash
git add -A && git commit -m "chore: periodic refresh — <summary>"
git push                        # Cloudflare Pages auto-deploys from main
```

Also update the parent km repo submodule pointer:
```bash
cd /Users/beorn/Code/pim/km
git add vendor/terminfo.dev && git commit -m "chore: update terminfo.dev submodule" && git push
```

### Step 9: Update tracking

```bash
bun sitefile                    # Regenerate lockfile with new probe dates
```

## Mode Implementations

### `status`

Run in parallel:
```bash
bun sitefile --check            # Freshness SLAs
bun run radar stats             # Radar findings summary
bun validate                    # Content consistency
```

Report what's stale, what findings are pending, any validation issues.

### `discover`

Run Step 1 (explore queries) and Step 2 (present findings for triage).
Use `/max` to run all 6 explore queries in parallel if the user wants speed.

### `probe`

Run Step 4 (re-probe all terminals). Report results summary.
If new unannotated failures appear, present them for annotation.

### `validate`

Run Steps 7 (validate + build + check-404s). Report any issues.

### `build`

Run Step 8 (deploy). Commit and push.

### `full`

Run all steps sequentially, pausing for human review at Step 2 (triage).

## Cadence

- **Monthly**: Full refresh (all steps). Minimum cadence.
- **Weekly**: Steps 1-2 only (discover + triage). Quick pulse check.
- **On terminal release**: Steps 4-8 (re-probe + rebuild). When Kitty, Ghostty, etc. ship a new version.

## Related Beads

- km-terminfo (epic) — terminfo.dev feature database
- km-termless.terminfo-probe-coverage — upgrade partial probes to full verification
- km-market.terminfo-completeness — content completeness + CI/CD
