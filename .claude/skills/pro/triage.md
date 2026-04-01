# Finding Triage & Bead Creation

Processes review output into classified findings, creates tracking beads, and presents results.

## Classification

| Level | Meaning | Action |
|-------|---------|--------|
| P0 | Correctness bug — WILL cause wrong behavior | Create bug bead, fix immediately |
| P1 | Important — safety, resource leaks, significant quality | Create bug bead, recommend fixing |
| P2 | Medium — quality improvements, minor inconsistencies | Track in review bead notes |
| P3 | Style — naming, formatting (only if clearly better) | Track in review bead notes |

## Triage Process

### 1. Parse Findings

Read the review output file and extract each finding. The reviewer should have structured them with file, line range, classification, description, and suggested fix.

Group findings by classification level.

### 2. Create Per-Package Review Bead

```bash
# Format: km-<scope>.pro-review-<MMDD>
bd create --id km-<scope>.pro-review-<MMDD> --type task \
  --title "Pro Review: <package> (<date>)" \
  --description "GPT 5.4 Pro code review of <package>. N findings: X P0, Y P1, Z P2, W P3." \
  --priority 2
bd update km-<scope>.pro-review-<MMDD> --parent km-all.pro-review-<N>
```

**Scope mapping**:
- `packages/km-storage` → `km-storage`
- `packages/km-board` → `km-board`
- `apps/km-tui` → `km-tui`
- `vendor/silvery` → `km-silvery`
- `vendor/flexily` → `km-flexx`

### 3. Create Bug Beads (P0/P1 Only)

For each P0/P1 finding:

```bash
bd create --type bug \
  --title "<brief finding description>" \
  --description "Found by GPT 5.4 Pro review (<date>).

File: <file>:<line-range>
Classification: <P0|P1>

<finding description>

Suggested fix: <suggested fix>" \
  --priority <0 for P0, 1 for P1>
bd update <new-id> --parent km-<scope>.pro-review-<MMDD>
```

### 4. Update Tracking Bead

Update the tracking epic's description with cumulative dashboard:

```bash
bd update km-all.pro-review-<N> --description "Pro Review Round N: <date>

## Progress
| Package | Status | P0 | P1 | P2 | P3 | Cost |
|---------|--------|----|----|----|----|------|
| km-storage | done (all fixed) | 3 | 5 | 8 | 2 | $9.22 |
| km-commands | triaging | 1 | 3 | 4 | 1 | $5.80 |
| km-board | queued | - | - | - | - | ~$4 |

## Totals
- Packages: 2/5 complete
- Findings: 27 (4 P0, 8 P1, 12 P2, 3 P3)
- Fixed: 8/12 P0+P1
- Cost: \$15.02 / ~\$30 estimated"
```

### 5. Present to User

Show a findings summary:

```markdown
## Pro Review: <package> — N findings

### P0 — Correctness Bugs (X)
1. **<title>** (`file.ts:120-130`) — <description>
2. ...

### P1 — Important (Y)
1. **<title>** (`file.ts:45-50`) — <description>
2. ...

### P2 — Quality (Z)
1. **<title>** (`file.ts:200`) — <description>
2. ...

### P3 — Style (W)
[Listed briefly or just count]

**Beads created**: km-scope.pro-review-MMDD + X bug beads
```

### 6. Ask User

```
Fix P0/P1 now? (recommended — X bugs, ~Y agents needed)
Options: fix / track / skip
```

- **fix**: Launch `/max` with parallel agents, TDD enforced
- **track**: Keep beads, don't fix now
- **skip**: Close review bead, note "deferred"

## Fix Execution

When user chooses "fix":

1. Group P0/P1 findings by file to identify conflicts (2 findings in same file → same agent)
2. Launch parallel agents via `/max`:
   - Each agent gets: the finding, the file, the suggested fix, the review bead ID
   - Each agent must: write failing test → implement fix → verify test passes → close bug bead
3. After all agents complete: `bun fix && bun run test:fast`
4. Update review bead with fix status
