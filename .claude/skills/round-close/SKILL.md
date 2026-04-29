---
description: "Deprecated — folded into /complete. The 'trust origin/main, not local worktrees' rule and acceptance-grep replay now live there."
argument-hint: ""
allowed-tools: Read
---

# Round-Close — Deprecated

**Replaced 2026-04-29.** Folded into `/complete`.

`/round-close` was a lightweight verification gate for multi-bead integration rounds: re-run each closed bead's acceptance grep against `origin/main` to catch agents claiming-shipped without actually pushing. The unique value — the **"trust origin/main, not local worktrees"** Iron Rule — now lives in `/complete`'s preamble, where every full closure audit applies it.

## Why merged

- Zero invocations outside its own skill (no integrator hook, no other skill called it, never invoked manually).
- The user's workflow treats `/complete` as "complete everything since the last /complete" — already a per-round gate.
- `/complete` is more thorough and only runs at session ends anyway, so the "lighter, between-rounds" framing was never used.

## Migration

| Old call | Use instead |
|---|---|
| `/round-close <round-id>` | `/complete` (now includes the origin/main acceptance-grep replay as Iron Rule) |
| `/round-close --since <ref>` | `/complete` with manual scoping in the prompt |

See [`.claude/skills/complete/SKILL.md`](../complete/SKILL.md). The Iron Rule is now the first section.
