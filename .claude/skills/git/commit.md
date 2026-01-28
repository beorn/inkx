---
description: Commit all changes across main repo and vendor submodules
allowed-tools: Bash, Read, Write
---

# Commit Command

Atomically commit all pending changes across the main repo and vendor submodules.

**PERFORMANCE CRITICAL:** This command MUST complete in exactly 2 Bash calls:

1. **Gather** - One command that collects ALL state
2. **Execute** - One script that does ALL operations

## Contents

- [Step 1: Gather Everything](#step-1-gather-everything-one-bash-call)
- [Step 2: Analyze & Generate Script](#step-2-analyze--generate-script-no-bash---just-thinking)
- [Step 3: Execute Everything](#step-3-execute-everything-one-bash-call)
- [Quick Templates](#quick-templates)
- [Safety Checks](#safety-checks-mental-not-bash)
- [Error Recovery](#error-recovery)
- [When to Ask User](#when-to-ask-user)

## Step 1: Gather Everything (ONE Bash Call)

Run this single command to capture complete repo state:

```bash
{
  echo "=== BRANCHES ==="
  echo "main: $(git branch --show-current)"
  for d in vendor/*/; do [ -e "$d.git" ] && echo "$d: $(cd "$d" && git branch --show-current 2>/dev/null || echo 'DETACHED')"; done

  echo -e "\n=== ALL CHANGES (main repo) ==="
  git status --porcelain

  echo -e "\n=== SUBMODULE CHANGES ==="
  for d in vendor/*/; do
    [ -e "$d.git" ] || continue
    changes=$(cd "$d" && git status --porcelain 2>/dev/null)
    [ -z "$changes" ] && continue
    echo "--- $d ---"
    echo "$changes"
  done

  echo -e "\n=== BEADS CONTEXT ==="
  echo "Recent activity (for commit context):"
  bd log --limit 10 2>/dev/null || echo "(no recent beads activity)"
  echo ""
  echo "In-progress work:"
  bd list --status in_progress 2>/dev/null | head -5 || echo "(none in progress)"
  echo ""
  echo "Recently closed:"
  bd list --status done --limit 5 2>/dev/null || echo "(none recently closed)"

  echo -e "\n=== RECENT COMMITS (style reference) ==="
  git log --oneline -3
}
```

## Step 2: Analyze & Generate Script (NO BASH - Just Thinking)

From the gathered output, determine:

1. **Which submodules have changes?** Lines under "--- vendor/X ---"
2. **What files in main repo?** Lines under "=== ALL CHANGES ==="
3. **Any DETACHED branches?** Must fix first
4. **Beads context** - What beads were being worked on? Use for commit message context
5. **Commit message** - Use conventional commits format, reference beads if relevant

**IMPORTANT: If no changes detected** (empty "ALL CHANGES" and no "SUBMODULE CHANGES"), output a friendly message like "Nothing to commit, working tree is clean" and STOP. Do not generate or run a commit script.

**Single vs multiple commits:** Default to ONE commit unless changes are CLEARLY unrelated:

- Different packages touched? Usually ONE commit (refactors often touch multiple)
- Fix + test for that fix? ONE commit
- Feature + unrelated style fix? Consider asking, but lean toward ONE unless obvious

Then generate a SINGLE bash script. DO NOT run multiple commands.

## Step 3: Execute Everything (ONE Bash Call)

Write and execute a single script that does ALL of the following in order:

```bash
#!/bin/bash
set -e  # Stop on first error

# Fix detached heads (if any)
# (cd vendor/X && git checkout main)

# Run lint fixes on vendor repos with changes (BEFORE committing)
# (cd vendor/beorn-inkx && bun run lint --fix)

# Commit submodules (innermost first)
# (cd vendor/beorn-inkx && \
#   git add file1.ts file2.ts && \
#   git commit -m "type(scope): message
#
# Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>")

# Sync beads (before main commit so changes are included)
bd sync 2>/dev/null || true

# Commit main repo (include submodule pointers)
git add path/to/file1.ts path/to/file2.ts vendor/beorn-inkx
git commit -m "type(scope): message

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Push everything
# (cd vendor/beorn-inkx && git push)
git push

# Verify
echo "=== RESULT ==="
git status --short
git log --oneline -1
```

**Script Rules:**

- `set -e` at top (stop on any error)
- **Run `bun run lint --fix` on vendor repos with changes BEFORE committing** (prevents CI failures)
- For vendor repos, use `git add -A` after lint fix (lint may change files)
- List ALL files explicitly for main repo (never use `-A`, `.`, or `--all`)
- Use inline commit messages (no HEREDOC needed for simple messages)
- Include `bd sync` before main commit
- Only include submodule sections if that submodule has changes
- Chain submodule pushes only for repos that were committed
- End with status + log for verification

## Quick Templates

**Main repo only (most common):**

```bash
#!/bin/bash
set -e
bd sync 2>/dev/null || true
git add packages/km-storage/src/file.ts packages/km-tui/src/other.ts
git commit -m "fix(storage): description here

Resolves: km-xxxx

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push
git status --short && git log --oneline -1
```

**One submodule + main:**

```bash
#!/bin/bash
set -e
# Lint fix vendor repo BEFORE committing
(cd vendor/beorn-inkx && bun run lint --fix && git add -A && git commit -m "fix(inkx): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>")
bd sync 2>/dev/null || true
git add vendor/beorn-inkx packages/km-tui/src/file.ts
git commit -m "fix(tui): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
(cd vendor/beorn-inkx && git push)
git push
git status --short && git log --oneline -1
```

**Multiple submodules + main:**

```bash
#!/bin/bash
set -e
# Lint fix vendor repos BEFORE committing
(cd vendor/beorn-inkx && bun run lint --fix && git add -A && git commit -m "refactor(inkx): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>")
(cd vendor/beorn-inkx-ui && bun run lint --fix && git add -A && git commit -m "refactor(inkx-ui): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>")
bd sync 2>/dev/null || true
git add vendor/beorn-inkx vendor/beorn-inkx-ui packages/file.ts
git commit -m "refactor(tui): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
(cd vendor/beorn-inkx && git push)
(cd vendor/beorn-inkx-ui && git push)
git push
git status --short && git log --oneline -1
```

## Safety Checks (Mental, Not Bash)

Before generating script, verify in gathered output:

- No sensitive files (.env, credentials, API keys) in changes
- No large binaries or build artifacts
- No node_modules, dist, or .gen.ts files
- Submodules on correct branches

## Error Recovery

If the script fails partway through:

| Error                               | Fix                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| "detached HEAD"                     | Add `(cd vendor/X && git checkout main)` to script                            |
| "nothing to commit" (after gather)  | This should be caught in Step 2 - don't generate a script if no changes exist |
| "nothing to commit" (during script) | Remove that repo's section from script                                        |
| "push rejected"                     | Run `git pull --rebase && git push` manually                                  |
| Pre-commit hook fails               | Fix issue, run script again (idempotent)                                      |
| "Uncommitted changes" (pre-push)    | `bd sync` should be in script already                                         |

## When to Ask User

**ASK** (use AskUserQuestion) ONLY if:

- Changes are CLEARLY unrelated (e.g., "storage refactor" + "unrelated docs fix" + "CLI feature")
- Sensitive files detected in changes
- DETACHED HEAD that shouldn't be

**DO NOT ASK** (just commit):

- Changes touch multiple packages but are part of one logical change
- Fix + tests for that fix
- Refactor that naturally spans files
- Following up on work the user explicitly requested
- When in doubt, default to ONE commit - users can always ask for separate commits

## Summary

1. **Bash call 1:** Gather command → read output (includes beads context)
2. **Think:** Analyze changes + beads context, determine message, generate script
3. **Bash call 2:** Execute complete script → done

Total: 2 Bash tool calls. No more.
