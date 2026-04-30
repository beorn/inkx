---
description: "Deprecated — split into /merge (reduce WIP) and /daily (cadence routines). This skill redirects."
argument-hint: ""
allowed-tools: Read
---

# Sync — Deprecated

**Keywords**: sync, merge, daily, deprecated

**Replaced 2026-04-29.** The "daily rhythm" framing conflated two orthogonal axes: WIP reduction and cadence-based maintenance. They're now separate skills.

| Old `/sync` flag | Use instead |
|---|---|
| `/sync --end` (force decision per retained-work row) | `/merge` (reduce WIP — converge worktrees, branches, stashes, claimed-stale beads, submodule drift back to origin/main) |
| `/sync --start` (orient + SOP scan + bd ready) | `/daily` (run today's due cadence routines, prompt before weekly/monthly/quarterly, surface carry-over, recommend next bead) |
| `/sync --report` | `/merge --dry-run` (WIP) or `/daily --report` (cadence) |
| `/sync --leave` (carry-over with bead note) | `/merge --leave <surface>` (still notes the bead) |

## Why the split

`/merge` and `/daily` answer different questions:

- `/merge` → "How much in-flight work do I have? Reduce it."
- `/daily` → "What scheduled routines are due? Run them."

You can run them independently, in any order, any time. No more start-vs-end auto-detect.

## Migration

1. **Morning ritual**: `/daily` (was `/sync --start`)
2. **Pre-stop**: `/merge` (was `/sync --end`)
3. **Sunday clean-up**: `/daily --deep` then `/merge`

See [`.claude/skills/merge/SKILL.md`](../merge/SKILL.md) and [`.claude/skills/daily/SKILL.md`](../daily/SKILL.md).
