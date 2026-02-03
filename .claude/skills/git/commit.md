---
description: Commit all changes across main repo and vendor submodules
allowed-tools: Bash, Read, Write
---

# Commit Command

Atomically commit all pending changes across the main repo and vendor submodules.

**CRITICAL: NEVER run multiple separate git commands.** Chain them with `&&`:
```bash
# WRONG - multiple tool calls
git add file1.ts
git commit -m "message"
git push

# CORRECT - one tool call with chained commands
git add file1.ts && git commit -m "message" && git push
```

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

Run this single command to capture complete repo state.

**Tip:** To see stats for specific files only (useful when working tree has unrelated changes):
```bash
git diff --stat -- path/to/file1 path/to/file2  # --stat BEFORE --, files AFTER
```

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
4. **Bead correlation** - See [Correlating Changes to Beads](#correlating-changes-to-beads) below
5. **Commit message** - Use conventional commits format with bead references

**IMPORTANT: If no changes detected** (empty "ALL CHANGES" and no "SUBMODULE CHANGES"), output a friendly message like "Nothing to commit, working tree is clean" and STOP. Do not generate or run a commit script.

### Correlating Changes to Beads

**Look hard to find which beads these changes relate to.** Check:

1. **In-progress beads** - Most likely candidates. Compare bead scope tokens with changed files:
   - `km-storage-*` → changes in `packages/km-storage/`
   - `km-tui-*` → changes in `apps/km-tui/` or `packages/km-tui/`
   - `beorn-inkx-*` → changes in `vendor/beorn-inkx/`
   - `km-board-*` → changes in `packages/km-board/`

2. **Bead descriptions** - Read the bead title/description. Does it match what changed?
   - "Fix cursor position after delete" + cursor-related code changes = match
   - "Add vim keybindings" + useInput changes = match

3. **Recently closed beads** - Maybe this is a follow-up fix?

4. **Recent activity log** - What was the agent working on?

**Confidence levels:**

| Confidence | Action |
|------------|--------|
| **High** - Scope token matches, description matches, in-progress | Reference with `Resolves:` or `Refs:` |
| **Medium** - Scope matches but description unclear | Reference with `Refs:` (not Resolves) |
| **Low** - Unsure which bead, or could be multiple | **Ask user** with AskUserQuestion |
| **None** - No related bead found | Commit without bead reference (OK for small fixes) |

**Bead reference syntax in commit messages:**

```
fix(storage): handle empty file gracefully

Resolves: km-storage-42          # Completes the bead (closes it)
Refs: km-storage-42              # Related but doesn't complete it
Part-of: km-tui-8                # Part of a larger epic/feature
```

### Single vs Multiple Commits

**Group by bead** when changes relate to different beads:

- Changes to `km-storage` for `km-storage-15` + changes to `km-tui` for `km-tui-8` = TWO commits
- Changes touching multiple packages but all for ONE bead = ONE commit
- Fix + test for that fix = ONE commit (same bead)

**Default to ONE commit** when:
- All changes relate to the same bead
- Changes are clearly part of one logical unit
- No beads involved (small standalone fix)

Then generate a SINGLE bash script (or multiple if grouping by bead). DO NOT run multiple separate commands.

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
- **Parallelism:** Git commands within the **same** repo must be sequential (`&&`). But git commands across **different** vendor directories can and should be parallelized using separate Bash tool calls in a single message — they have independent `.git` dirs and won't conflict.

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

**ASK** (use AskUserQuestion) if:

- **Bead assignment unclear** - Changes could relate to multiple beads, or you're ~70% confident but not sure
  - Example: "These changes touch storage. I see km-storage-15 (race condition fix) and km-storage-18 (performance). Which bead does this relate to?"
- **Changes are CLEARLY unrelated** - Multiple distinct changes that should be separate commits
- **Sensitive files detected** in changes
- **DETACHED HEAD** that shouldn't be

**DO NOT ASK** (just commit):

- Bead assignment is obvious (scope matches, description matches)
- Changes touch multiple packages but are part of one logical change (same bead)
- Fix + tests for that fix
- Refactor that naturally spans files
- No beads involved and it's a small standalone fix
- Following up on work the user explicitly requested

## Summary

1. **Bash call 1:** Gather command → read output (includes beads context)
2. **Think:**
   - Correlate changes to beads (scope tokens, descriptions, in-progress work)
   - If bead unclear (~70% confident), ask user
   - Group commits by bead if changes relate to different beads
   - Generate script with proper `Resolves:`/`Refs:` references
3. **Bash call 2:** Execute complete script → done

Total: 2 Bash tool calls (plus optional AskUserQuestion for bead clarification).
