---
description: Commit all changes across main repo and vendor submodules
allowed-tools: Bash, Read, Glob
---

# Commit Command

Atomically commit all pending changes across the main repo and vendor submodules.

## Overview

This command handles the complexity of git submodules by:
1. Gathering all state in ONE shell command
2. Making ONE decision about commit message/grouping
3. Executing all commits in ONE batched shell command
4. Pushing all repos in ONE batched shell command

## Step 1: Gather Everything

Run this single command to capture complete repo state:

```bash
{
  echo "=== BRANCHES ==="
  echo "main: $(git branch --show-current)"
  for d in vendor/*/; do [ -e "$d.git" ] && echo "$d: $(cd "$d" && git branch --show-current 2>/dev/null || echo 'DETACHED')"; done

  echo -e "\n=== STAGED ==="
  git diff --cached --name-status

  echo -e "\n=== UNSTAGED ==="
  git diff --name-status

  echo -e "\n=== UNTRACKED ==="
  git ls-files --others --exclude-standard | head -20

  echo -e "\n=== SUBMODULE STATUS (main repo view) ==="
  git status --porcelain | grep "vendor/" || echo "(none)"

  echo -e "\n=== SUBMODULE CHANGES (inside each) ==="
  for d in vendor/*/; do
    [ -e "$d.git" ] || continue
    changes=$(cd "$d" && git status --porcelain 2>/dev/null)
    [ -z "$changes" ] && continue
    echo "--- $d ---"
    echo "$changes"
    (cd "$d" && git diff --stat HEAD 2>/dev/null | tail -3)
  done

  echo -e "\n=== RECENT COMMITS (style reference) ==="
  git log --oneline -5
}
```

## Step 2: Analyze (One Decision)

From the output, answer these questions:

1. **Any submodules need commits?** Look at "=== SUBMODULE CHANGES ===" section
2. **Submodule status in main repo?** Look for:
   - `(new commits)` → submodule was committed, main needs to update pointer
   - `(untracked content)` → submodule has untracked files (likely needs .gitignore)
   - `(modified content)` → submodule has uncommitted changes
3. **What's the primary change?** Look at file paths to identify the scope
4. **Single commit or multiple?**
   - Same logical change → single message for all
   - Unrelated changes → consider separate commits (ask user)
5. **Any DETACHED branches?** Must fix before committing

**Untracked content in submodules:** If you see `??` lines like `node_modules/`, `dist/`, `*.log` - add a `.gitignore` to that submodule first, commit it, then continue.

**Decision template:**
- Commit type: `fix`, `feat`, `refactor`, `chore`, `docs`
- Scope: `storage`, `cli`, `tui`, `inkx`, `core`, `board`, etc.
- Message: 50 char summary, optional body

## Step 3: Execute Commits (One Batched Command)

Build and run a SINGLE command that does everything. The pattern is:

```bash
# 1. Fix detached heads if any
(cd vendor/X && git checkout main) && \

# 2. Commit each submodule that has changes (inner to outer)
(cd vendor/beorn-inkx && git add FILE1 FILE2 && git commit -m "$(cat <<'EOF'
type(scope): message

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)") && \

# 3. Stage and commit main repo (includes submodule pointers)
git add vendor/beorn-inkx path/to/file1.ts path/to/file2.ts && \
git commit -m "$(cat <<'EOF'
type(scope): message

- Bullet point if helpful
- Another point

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Rules:**
- Chain with `&&` (stops on failure)
- List files explicitly (no `-A` or `.`)
- Quote paths with spaces
- HEREDOC for messages (handles quotes/newlines)
- Submodule commits use same or consistent message

## Step 4: Sync Beads & Push All

```bash
# Sync beads (required by pre-push hook), push submodules, then main
bd sync && \
(cd vendor/beorn-inkx && git push) && \
(cd vendor/beorn-inkx-ui && git push) && \
git push && \
echo "✓ All pushed successfully"
```

- `bd sync` commits any beads changes and syncs with remote (required by pre-push hook)
- Only include submodule push commands for those committed in Step 3

## Step 5: Verify

```bash
git status && echo "---" && git log --oneline -1
```

## Quick Reference: Common Patterns

**Only main repo changed (no submodules):**
```bash
git add path/to/files.ts && \
git commit -m "type(scope): message

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" && \
bd sync && git push
```

**One submodule + main:**
```bash
(cd vendor/beorn-inkx && git add src/file.ts && git commit -m "...") && \
git add vendor/beorn-inkx packages/file.ts && git commit -m "..." && \
bd sync && (cd vendor/beorn-inkx && git push) && git push
```

**Multiple submodules + main:**
```bash
(cd vendor/beorn-inkx && git add src/changed-file.ts && git commit -m "...") && \
(cd vendor/beorn-inkx-ui && git add src/other-file.ts && git commit -m "...") && \
git add vendor/beorn-inkx vendor/beorn-inkx-ui packages/changed.ts && git commit -m "..." && \
bd sync && (cd vendor/beorn-inkx && git push) && (cd vendor/beorn-inkx-ui && git push) && git push
```

## Safety Checks

Before committing, verify:
- [ ] No sensitive files (.env, credentials, API keys)
- [ ] No large binaries (use git-lfs if needed)
- [ ] No build artifacts (node_modules, dist, .gen.ts if gitignored)
- [ ] Submodules on correct branch (not detached)

## Error Recovery

| Error | Fix |
|-------|-----|
| "detached HEAD" | `cd vendor/X && git checkout main` |
| "nothing to commit" | Check if already committed or changes are in submodule |
| "push rejected" | `git pull --rebase` then push again |
| "submodule not on branch" | `cd vendor/X && git checkout main && git pull` |
| "Uncommitted changes detected" (pre-push) | Run `bd sync` before pushing |
| "(untracked content)" in submodule | Add `.gitignore` to submodule, commit, then continue |

## When to Ask User

Use AskUserQuestion if:
- Changes span multiple unrelated features (should be separate commits?)
- Untracked files that might be intentional additions vs accidentally created
- Pre-commit hooks fail and `--no-verify` might be needed

Do NOT ask if:
- Changes are clearly related (just commit them)
- Only modified files, no untracked (clear what to stage)
- Following up on work the user explicitly requested

## Execute

1. Run Step 1 gather command
2. Make single decision on commit message
3. Build and run Step 3 commit command
4. Run Step 4 push command
5. Verify with Step 5
