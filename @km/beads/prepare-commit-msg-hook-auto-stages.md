---
id: "@km/beads/prepare-commit-msg-hook-auto-stages"
type: bug
priority: P3
created_at: 2026-05-06T23:18:00.000Z
parent: "@km/beads"
---

# [ ] bd prepare-commit-msg hook auto-stages files the user didn't stage #bug #P3

## Symptom

`.git/hooks/prepare-commit-msg` (managed by external `bd` binary, see `--- BEGIN BEADS INTEGRATION v1.0.0 ---` markers) sweeps files into commits that the user did not stage. Discovered 2026-05-06 during `@km/agent/sigil-boards` Phase 1.1 implementation:

```
agent ran: git add packages/km-markdown/src/ast2nodes.ts && git commit -m "..."
commit landed with: ast2nodes.ts + 13 unrelated files (@agent/0..9.md, @agent.md, .gitignore, two SKILL.md files)
```

The 13 files were untracked-but-present in the working tree from a concurrent tribe peer. The hook ran `git add` on them despite the user staging only one file.

## Reproduce

1. In a fresh main worktree, create new untracked files (don't stage them): `touch new-untracked.md`
2. Stage one specific file: `git add packages/km-markdown/src/parser.ts` after a deliberate edit
3. Commit: `git commit -m "..."`
4. Inspect: `git show --stat HEAD` → expected = 1 file; observed = 1 + auto-staged files

## Workaround

Use `git commit -o <file>` (only-this-file mode) to scope the commit explicitly:

```bash
git add packages/km-markdown/src/parser.ts
git commit -o packages/km-markdown/src/parser.ts -m "..."
```

This bypasses the hook's auto-staging (the hook can't add files outside the explicit pathspec).

## Root cause (suspected)

The `bd hooks run prepare-commit-msg` script runs `git add` on bd-managed files (`@<scope>/...`, etc.) to keep bead state in sync with the commit. When concurrent tribe peers leave bd-managed files untracked, the hook scoops them up regardless of the user's intent.

## Acceptance

- File a fix in `bd` upstream (the Go binary) OR — if `bd` is fully retired and only `km bd` runs — remove the legacy `--- BEGIN BEADS INTEGRATION ---` block from `.git/hooks/prepare-commit-msg` (we should be using only km bd hooks since 2026-04-29 cutover, per `.claude/skills/pm/SKILL.md`)
- Document the workaround in `.claude/skills/git/commit.md` (use `git commit -o` when concurrent agents are running)
- Verify `km bd hooks` doesn't replicate the same auto-stage behavior

## Context

- 2026-04-29 cutover: `km bd` is canonical, external `bd` binary retired (`packages/km-beads/CLAUDE.md`)
- Concurrent agents (tribe peers, `/max` parallel agents, worktree pool) regularly leave bd-managed files untracked between operations
- Reference incident: `33245818f feat(markdown): collectSigilLinks emits @mention and +project rows` accidentally absorbed `@agent/0..9.md`, `@agent.md`, `.gitignore`, `.claude/skills/{claim,do}/SKILL.md` from a tribe peer (myself, this session)
