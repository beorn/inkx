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
