---
description: Create a GitHub release with version bump, changelog, and tag
allowed-tools: Bash, Read, Glob, Skill, AskUserQuestion
---

# Release Command

Create a GitHub release using release-it. Handles uncommitted changes automatically via `/commit`.

## Contents

- [Decision Flow](#decision-flow)
- [Step 1: Pre-flight Check](#step-1-pre-flight-check-single-command)
- [Step 2: Auto-Commit](#step-2-auto-commit-if-needed)
- [Step 3: Run Tests](#step-3-run-tests-optional)
- [Step 4: Preview Release](#step-4-preview-release)
- [Step 5: Confirm Release Type](#step-5-confirm-release-type)
- [Step 6: Execute Release](#step-6-execute-release)
- [Step 7: Verify Success](#step-7-verify-success)
- [When NOT to Release](#when-not-to-release)
- [Error Recovery](#error-recovery)

## Decision Flow

```
/release
    │
    ├─► Uncommitted changes? ──► Auto-run /commit
    │
    ├─► Not on main? ──► Abort with instructions
    │
    ├─► Tests pass? ──► (offer to run or skip)
    │
    ├─► Preview dry-run ──► Show version + changelog
    │
    ├─► User confirms type ──► patch/minor/major/cancel
    │
    └─► Execute + Verify
```

## Step 1: Pre-flight Check (Single Command)

```bash
{
  echo "=== Branch ==="
  branch=$(git branch --show-current)
  [ "$branch" = "main" ] && echo "✓ main" || echo "✗ $branch (must be main)"

  echo -e "\n=== Working Directory ==="
  if git diff --quiet HEAD 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "✓ Clean"
  else
    echo "⚠️  Has changes (will auto-commit):"
    git status --short | head -10
  fi

  echo -e "\n=== Current Version ==="
  version=$(grep -o '"version": "[^"]*"' package.json | head -1)
  echo "$version"

  echo -e "\n=== Commits Since Last Release ==="
  last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -n "$last_tag" ]; then
    count=$(git rev-list $last_tag..HEAD --count)
    echo "$count commits since $last_tag"
    git log $last_tag..HEAD --oneline --no-decorate | head -8
  else
    echo "No previous tags (first release)"
  fi

  echo -e "\n=== CHANGELOG [Unreleased] ==="
  awk '/## \[Unreleased\]/{found=1; next} /## \[[0-9]/{found=0} found' CHANGELOG.md | head -15

  echo -e "\n=== GitHub CLI ==="
  gh auth status 2>&1 | grep -q "Logged in" && echo "✓ Authenticated" || echo "✗ Not authenticated (run: gh auth login)"
}
```

**Decision point after Step 1:**

- If not on `main` → Abort: "Switch to main first: `git checkout main && git pull`"
- If has uncommitted changes → Continue to Step 2
- If clean → Skip to Step 3

## Step 2: Auto-Commit (if needed)

If there are uncommitted changes, invoke `/commit` automatically:

```
Invoke the Skill tool: skill="commit"
```

After commit completes, verify clean state:

```bash
git status --porcelain | wc -l | xargs test 0 -eq && echo "✓ Ready" || echo "✗ Still dirty"
```

## Step 3: Run Tests (Optional)

Ask user if tests should run:

```
AskUserQuestion:
  question: "Run tests before release?"
  header: "Tests"
  options:
    - label: "Run test:fast"
      description: "Quick validation (~25s)"
    - label: "Run test:all"
      description: "Full test suite (~2min)"
    - label: "Skip"
      description: "Tests recently passed, proceed to release"
```

If user chooses to run:

```bash
bun run test:fast   # or test:all
```

If tests fail → Abort release

## Step 4: Preview Release

```bash
bun release --dry-run 2>&1 | head -40
```

This shows:

- Current → New version
- Files that will be modified
- Changelog entries to be added

## Step 5: Confirm Release Type

```
AskUserQuestion:
  question: "What type of release?"
  header: "Version"
  options:
    - label: "Patch"
      description: "Bug fixes only (0.1.0 → 0.1.1)"
    - label: "Minor"
      description: "New features, backwards compatible (0.1.0 → 0.2.0)"
    - label: "Major"
      description: "Breaking changes (0.1.0 → 1.0.0)"
    - label: "Cancel"
      description: "Abort - not ready to release"
```

If "Cancel" → Stop here with message: "Release cancelled. Run `/release` when ready."

## Step 6: Execute Release

```bash
bun release [patch|minor|major]
```

release-it will:

1. ✓ Bump version in package.json
2. ✓ Run `bun run build:info` (hook)
3. ✓ Update CHANGELOG.md
4. ✓ Commit: `chore(release): vX.Y.Z`
5. ✓ Tag: `vX.Y.Z`
6. ✓ Create GitHub release
7. ✓ Push commits and tags

## Step 7: Verify Success

```bash
{
  echo "=== Release Complete ==="
  echo "Version: $(bun km -V 2>/dev/null || grep -o '"version": "[^"]*"' package.json)"
  echo "Tag: $(git describe --tags --abbrev=0)"
  echo ""
  echo "GitHub Release:"
  gh release view $(git describe --tags --abbrev=0) --json url -q .url 2>/dev/null || echo "https://github.com/beorn/km/releases"
}
```

## When NOT to Release

- Failing tests
- Incomplete features in [Unreleased]
- On a feature branch (must be main)
- Right before a breaking change you haven't finished
- If CHANGELOG [Unreleased] is empty (nothing to release)

## Quick Reference

```bash
bun release              # Interactive (release-it prompts)
bun release patch        # Bug fix release
bun release minor        # Feature release
bun release major        # Breaking change
bun release --dry-run    # Preview without changes
```

## Error Recovery

| Error                       | Fix                                                |
| --------------------------- | -------------------------------------------------- |
| "Working dir must be clean" | Should auto-handle; if not, run `/commit`          |
| "Not on main branch"        | `git checkout main && git pull`                    |
| "gh not authenticated"      | `gh auth login`                                    |
| "Tag already exists"        | Previous release attempt; check version            |
| "Push rejected"             | `git pull --rebase && git push && git push --tags` |

## Rollback

**Before push (tag created but not pushed):**

```bash
git tag -d vX.Y.Z && git reset --hard HEAD~1 && bun run build:info
```

**After push:**

```bash
git push --delete origin vX.Y.Z && gh release delete vX.Y.Z --yes
git tag -d vX.Y.Z && git reset --hard HEAD~1 && bun run build:info
git push --force-with-lease  # Careful!
```

## Note on Submodules

The `/commit` skill handles vendor submodules. If you have submodule changes, they'll be committed first when `/commit` runs automatically in Step 2.
