---
description: "Commit changes to git. Use when ready to commit staged or unstaged changes."
argument-hint: "[message]"
allowed-tools: Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git pull:*), Bash(bd dolt push:*), Bash(cd vendor/*), Bash(bun run lint:*), Bash(rm -f .git/index.lock:*), AskUserQuestion
---

# Commit

## Context

- Branch: !`git branch --show-current`
- Status: !`git status --porcelain`
- Diff stats: !`git diff --stat`
- Diffs (excluding vendor): !`git diff -U2 -- ':!vendor' | head -300`
- Submodules: !`{ for d in vendor/*/; do [ -e "$d.git" ] || continue; pd=$(git diff -- "$d" 2>/dev/null | head -5); ss=$(cd "$d" && git status --porcelain 2>/dev/null); sl=$(cd "$d" && git log --oneline -3 2>/dev/null); sd=$(cd "$d" && git diff --stat 2>/dev/null); [ -z "$pd" ] && [ -z "$ss" ] && continue; echo "--- $d ---"; echo "pointer: ${pd:-(clean)}"; echo "status: ${ss:-(clean)}"; echo "log: $sl"; echo "diff: ${sd:-(none)}"; done; }`
- Beads: !`bd list --status in_progress 2>/dev/null | head -5 || echo "(none)"`
- Recent commits: !`git log --oneline -5`

## Instructions

**ALL git state is above. Do NOT investigate further.** No git diff, git status, git log, Read, or Task tools — write the commit message from the context above and execute immediately. If diffs are truncated, use the diff stats + file names to infer the change.

1. **Analyze** the context above:
   - What changed (diffs are above; if truncated, use Read on files, NOT git diff)
   - Submodule state (pointer, status, log are above)
   - Bead correlation: match scope tokens to beads. High → `Resolves:`. Medium → `Refs:`.
   - Only commit changes from this session. When in doubt, ask user.

2. **Execute** in ONE Bash call — `set -e`, explicit file lists, never `git add -A` on main repo:

### Template — Main repo only:

```bash
set -e
bd dolt push 2>/dev/null || true
git add file1.ts file2.ts && \
  git diff --cached --quiet && echo "Nothing to commit" || \
  git commit -m "fix(scope): description

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
```

### Template — With submodule:

```bash
set -e
(cd vendor/silvery && bun run lint --fix && git add -A && git commit -m "fix(silvery): msg

Co-Authored-By: Claude <noreply@anthropic.com>")

bd dolt push 2>/dev/null || true
git add vendor/silvery file1.ts && \
  git diff --cached --quiet && echo "Nothing to commit" || \
  git commit -m "fix(tui): msg

Co-Authored-By: Claude <noreply@anthropic.com>"
(cd vendor/silvery && git push)
git push
```

### Many changes (>10 files):

Group by scope from the diff stats above. One commit per scope, executed sequentially in a single Bash call.

## Rules
- `set -e`, `bun run lint --fix` on vendor before commit
- `git diff --cached --quiet` guard after `git add`
- Conventional commit: `type(scope): message`
- Co-author line: `Co-Authored-By: Claude <noreply@anthropic.com>`

## When to Ask User

**ASK:** bead unclear, sensitive files, detached HEAD.
**DON'T ASK:** grouping, obvious beads, fix+test, user-requested work.

## Error Recovery

| Error | Fix |
|-------|-----|
| "detached HEAD" | `(cd vendor/X && git checkout main)` |
| "nothing to commit" | `git diff --cached --quiet` guard handles this |
| "push rejected" | `git pull --rebase && git push` |
| "index.lock" | `rm -f .git/index.lock` then retry |

## Conventional Commit Types

| Type       | Use                          |
| ---------- | ---------------------------- |
| `feat`     | New feature                  |
| `fix`      | Bug fix                      |
| `refactor` | Code change (no feature/fix) |
| `docs`     | Documentation                |
| `test`     | Adding tests                 |
| `chore`    | Maintenance                  |

## Worktrees

Manages git worktrees for parallel development. Handles submodules, dependencies, and direnv automatically.

**Use `bun worktree` (not bare `git worktree`)** -- it handles submodule cloning, dependency install, hooks, and direnv.

### Native vs Custom Worktrees

Claude Code 2.1.50+ supports `isolation: "worktree"` on the Task tool -- agents get automatic temporary worktrees that auto-clean. The `WorktreeCreate` hook in `settings.json` handles submodule/dependency setup.

- **Native isolation**: parallel agent edits on the same files (automatic, temporary)
- **`bun worktree`**: persistent development branches, merge workflow, manual parallel work

### CRITICAL: Worktree Agents MUST Commit

**Uncommitted work in worktrees is lost forever.** When a worktree is cleaned up, any uncommitted changes are destroyed.

Rules:
1. Commit early and often -- after each logical step, not just at the end
2. Every worktree agent prompt must end with explicit commit instructions
3. Agent completion messages must include the commit SHA as proof
4. If an agent finishes without a commit SHA, assume its work was lost

### Quick Reference

```bash
bun worktree                              # Show status and help
bun worktree create <name> [branch]       # Create worktree
bun worktree merge <name>                 # Merge into main, run tests, clean up
bun worktree remove <name>                # Remove worktree
bun worktree list                         # Detailed status
```

Worktrees are created at `../<repo>-<name>` (e.g., `../km-my-feature/`).

### How Worktrees Are Created

Worktrees are created from your **COMMITTED state**, not your working tree. Before creating, the tool validates:
1. No uncommitted changes in main repo
2. No uncommitted changes in any submodule
3. All submodule commits are pushed to remote

Each worktree gets **independent submodule clones** (not symlinks). Post-create: `git submodule update --init --recursive`, `bun install`, `direnv allow`, `bun run prepare`.

### Merging Back

`bun worktree merge <name>` -- validates, merges `--no-ff`, runs `bun run test:fast`, removes worktree, deletes branch.

### When to Use Worktrees

- Work on multiple features without stashing
- Test changes in isolation
- Run long tests while continuing development
- Parallel agents on foundational code (silvery, flexily, storage, test infra)

### Multi-Agent Awareness

Multiple sessions may operate concurrently. Worktrees prevent git index lock conflicts, partial edits visible mid-change, test failures from incomplete changes, and submodule pointer drift.

### Common Issues

- **"uncommitted changes detected"** -- commit, stash, or use `--allow-dirty`
- **"unpushed submodule commits"** -- push submodule changes first
- **Beads conflicts** -- `export BEADS_NO_DAEMON=1` in worktrees

**Tool location**: `vendor/bearly/tools/worktree.ts`
