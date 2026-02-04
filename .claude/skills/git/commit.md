---
description: "Commit changes. STOP — read this file FIRST. Do NOT run git status, git diff, git log, or ANY Bash commands until you have read the procedure below."
allowed-tools: Bash, Read, Write, Task, AskUserQuestion
---

# Commit: Gather+Analyze → Execute

**Exactly 2 turns after reading this file. No investigation commands. No separate git commands.**

## Turn 1: Gather + Analyze (in parallel)

Send BOTH of these tool calls in a single message — they run concurrently:

### Tool call A: Bash (gather)

```bash
{
  echo "=== BRANCHES ==="
  echo "main: $(git branch --show-current)"
  for d in vendor/*/; do [ -e "$d.git" ] && echo "$d: $(cd "$d" && git branch --show-current 2>/dev/null || echo 'DETACHED')"; done

  echo -e "\n=== ALL CHANGES (main repo) ==="
  git status --porcelain

  echo -e "\n=== DIFF STATS (main repo) ==="
  git diff --stat

  echo -e "\n=== DIFFS (main repo, truncated) ==="
  git diff -U2 -- ':!vendor' | head -300

  echo -e "\n=== SUBMODULE CHANGES ==="
  for d in vendor/*/; do
    [ -e "$d.git" ] || continue
    pointer_diff=$(git diff -- "$d" 2>/dev/null | head -5)
    sub_status=$(cd "$d" && git status --porcelain 2>/dev/null)
    sub_log=$(cd "$d" && git log --oneline -3 2>/dev/null)
    sub_diff_stat=$(cd "$d" && git diff --stat 2>/dev/null)
    [ -z "$pointer_diff" ] && [ -z "$sub_status" ] && continue
    echo "--- $d ---"
    echo "pointer: ${pointer_diff:-(matches main repo)}"
    echo "status: ${sub_status:-(clean)}"
    echo "recent commits: $sub_log"
    echo "diff stat: ${sub_diff_stat:-(no uncommitted changes)}"
  done

  echo -e "\n=== BEADS CONTEXT ==="
  bd log --limit 10 2>/dev/null || echo "(no recent beads activity)"
  echo ""
  bd list --status in_progress 2>/dev/null | head -5 || echo "(none in progress)"
  echo ""
  bd list --status done --limit 5 2>/dev/null || echo "(none recently closed)"

  echo -e "\n=== RECENT COMMITS (style reference) ==="
  git log --oneline -3
}
```

### Tool call B: Task(haiku) — commit plan

Launch in parallel with the gather. Haiku runs its own git commands independently.

```
Task(haiku, subagent_type=general-purpose): "Produce a commit plan for the repo at /Users/beorn/Code/pim/km.

Run these commands yourself:
1. cd /Users/beorn/Code/pim/km && git status --porcelain
2. cd /Users/beorn/Code/pim/km && git diff -U2 -- ':!vendor'
3. For each vendor submodule with changes: cd /Users/beorn/Code/pim/km/vendor/X && git diff --stat && git log --oneline -3
4. cd /Users/beorn/Code/pim/km && bd list --status in_progress 2>/dev/null

Then categorize all changes into logical commit groups (group by bead when possible).
Use conventional commits: type(scope): message.
Match changes to in-progress beads by scope token (km-storage-* → packages/km-storage/).
Bead confidence: High → Resolves, Medium → Refs, Low → note as uncertain.

Return ONLY a commit plan in this format:
COMMIT 1:
  message: type(scope): description
  files: path/to/file1 path/to/file2
  bead: km-xxxx (Resolves/Refs/none)
  submodule: (if vendor/X needs internal commit first, show its commit message)
COMMIT 2: ...

No commentary. Just the plan."
```

## Turn 2: Execute

After both complete, combine the gather context (branches, beads) with haiku's commit plan. Convert directly into one execute script. **Do NOT run additional git commands to verify.**

Use `set -e`. Chain with `&&`. One script does everything.

**Template — Main repo only:**

```bash
#!/bin/bash
set -e
bd sync 2>/dev/null || true
git add packages/km-storage/src/file.ts packages/km-tui/src/other.ts && \
  git diff --cached --quiet && echo "Already committed by bd sync" || \
  git commit -m "fix(storage): description here

Resolves: km-xxxx

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push
git status --short && git log --oneline -1
```

**Template — With submodule(s):**

```bash
#!/bin/bash
set -e
(cd vendor/beorn-inkx && bun run lint --fix && git add -A && git commit -m "fix(inkx): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>")

bd sync 2>/dev/null || true
git add vendor/beorn-inkx packages/km-tui/src/file.ts && \
  git diff --cached --quiet && echo "Already committed by bd sync" || \
  git commit -m "fix(tui): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
(cd vendor/beorn-inkx && git push)
git push
git status --short && git log --oneline -1
```

**Template — Multiple commits:**

```bash
#!/bin/bash
set -e
# Commit 1: submodule
(cd vendor/beorn-inkx && bun run lint --fix && git add -A && git commit -m "type(scope): msg

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>")

# Commit 2: first group
bd sync 2>/dev/null || true
git add file1 file2 vendor/beorn-inkx && \
  git diff --cached --quiet && echo "Nothing to commit" || \
  git commit -m "type(scope): msg

Resolves: km-xxxx

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Commit 3: second group
git add file3 file4 && \
  git diff --cached --quiet && echo "Nothing to commit" || \
  git commit -m "type(scope): msg

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Push all
(cd vendor/beorn-inkx && git push)
git push
git status --short && git log --oneline -3
```

## Rules

- `set -e` at top
- `bun run lint --fix` on vendor repos with changes BEFORE committing (use `git add -A` after lint)
- List ALL files explicitly for main repo (never `-A`, `.`, `--all`)
- `bd sync` before first main-repo commit — `git diff --cached --quiet` guard handles bd sync creating its own commit
- End with `git status --short && git log --oneline -N`
- Same repo: sequential (`&&`). Different vendor dirs: parallel Bash calls OK.

## When to Ask User

**ASK** if: bead assignment unclear (~70% confidence), sensitive files, detached HEAD.

**DON'T ASK** about: commit grouping (haiku handles it), obvious bead matches, fix + test combos, work the user explicitly requested.

## Error Recovery

| Error | Fix |
|-------|-----|
| "detached HEAD" | Add `(cd vendor/X && git checkout main)` |
| "nothing to commit" | `git diff --cached --quiet` guard handles this |
| "push rejected" | `git pull --rebase && git push` |
| Pre-commit hook fails | Fix issue, run script again |

## Safety (mental checks, not Bash)

No `.env`/credentials, no binaries/artifacts, no `node_modules`/`dist`/`.gen.ts`, submodules on correct branches.
