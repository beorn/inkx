---
id: "@km/all/upstream-waiting"
aliases:
  - km-all.upstream-waiting
  - km-all-upstream-waiting
created_by: claude:cc081a9a
created_at: 2026-04-27T05:46:33Z
owner: bjorn@stabell.org
---

# [ ] [epic] Upstream-blocked items — review monthly @km/all #feature #P3

Registry of beads that wait on a fix in an upstream project (Bun, Node, dependencies, etc.). Reviewed monthly as part of /sop infra cadence.

**Canonical workflow**: `.claude/skills/pm/workflows/upstream.md` §8 "Register for tracking" — the bead description template, field semantics, and unwind protocol all live there. This epic's job is just to be the parent that makes children visible to the monthly review.

**Membership rule**: any bead is parented here when our code contains a workaround that exists *because* an upstream package is broken. The bead stays open until our code is back to clean (workaround removed AND upstream fix verified in the version we depend on, i.e. Status = `adopted-locally`).

**Children parent here, not their package scope**. The package is implicit in the bead ID prefix (@km/bearly.*, @km/silvery.* etc.). bd parent is single-valued; we use this epic for the upstream-only view, the prefix carries the package.

**Required fields for every child** (per upstream.md §8):
- `Upstream:` URL — issue or PR
- `Status:` enum — `filed-upstream` | `merged-upstream` | `released-upstream` | `adopted-locally` (most beads register at `filed-upstream`; only `adopted-locally` justifies running unwind steps)
- `Last checked: <YYYY-MM-DD>` — bumped every /sop infra review even if no movement
- `Escalate by: <YYYY-MM-DD>` — default = creation + 6 months; at this date re-decide vendorize / fork / accept owned divergence / continue waiting
- `bd defer --until=<YYYY-MM-DD>` — default = creation + 30 days; surfaces the bead in `bd ready` near review date
- Code marker at every workaround site: `// UPSTREAM-WAITING(<repo>#<issue>)` + `// Bead: <id>` + `// Escalate by: <date>` (lint script `packages/km-infra/scripts/check-upstream-markers.sh` enforces two-way binding)

**Monthly review** (via /sop infra → upstream-waiting check):
1. Run `packages/km-infra/scripts/check-upstream-markers.sh` first — surfaces bead↔marker drift
2. `bd list --parent km-all.upstream-waiting --status open`
3. For each: fetch upstream URL, compare against bead's Status (4-state enum above)
4. Update Last checked: <today> regardless of movement
5. Check `Escalate by:` — if within 30 days, surface for re-decision
6. If Status reaches `adopted-locally`: run the bead's numbered Unwind steps, close with the version that fixed it
7. If `Escalate by` date passed and re-decision is "accept owned divergence": move bead to **@km/all/owned-divergence** (perpetual sibling registry)
8. If `Escalate by` date passed and re-decision is "continue waiting": bump the date with documented reason

**Sibling registry**: `km-all.owned-divergence` is the destination for items we no longer expect upstream to fix — workarounds we maintain forever. Items move HERE → THERE on escalation; rarely the reverse.

**Activation**: when a workaround lands in our code, the upstream.md skill triggers (CLAUDE.md triage table) and step 8 of that workflow files the bead here. Don't file beads here without going through that skill — the description template + unwind protocol prevent under-specified beads from rotting.

**Cross-refs**:
- Workflow: `.claude/skills/pm/workflows/upstream.md` §8 (canonical bead template + unwind protocol)
- Sibling registry: `km-all.owned-divergence` (escalation destination)
- Lint script: `packages/km-infra/scripts/check-upstream-markers.sh` (two-way bead↔marker binding, runs in `bun fix`)
- SOP: `.claude/skills/sop/SKILL.md` upstream-waiting check (monthly cadence)

/complete: never (perpetual registry).