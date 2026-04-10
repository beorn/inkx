---
description: "Release packages — version bump, changelog from git+beads, npm publish, GitHub release. Works for km root and vendor submodules."
argument-hint: "[<package-path>] [--status|--dry-run|patch|minor|major]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Skill
---

# Release

**Keywords**: release, publish, version, changelog, npm, tag, vendor release

Release any package in the km monorepo — the root `km` package or any `vendor/*` submodule.

## Quick Commands

| Command | Purpose |
|---------|---------|
| `/release --status` | Show all packages with unpublished changes |
| `/release vendor/silvery` | Release silvery (interactive — picks version) |
| `/release vendor/silvery patch` | Release silvery as patch |
| `/release` | Release km root |
| `/release --dry-run vendor/loggily` | Preview what would happen |

## Target

**Argument**: $ARGUMENTS

Default: km root. If a vendor path is given, release that package.

## Phase 1: Status Check

### For `--status` (no release, just report)

Check ALL publishable packages for unpublished changes:

```bash
cd /Users/beorn/Code/pim/km

for dir in . vendor/flexily vendor/loggily vendor/mdtest vendor/silvery vendor/termless vendor/vimonkey vendor/bearly vendor/watcher-chaos; do
  pkg="$dir/package.json"
  [ ! -f "$pkg" ] && continue

  name=$(python3 -c "import json; print(json.load(open('$pkg')).get('name','?'))")
  local_ver=$(python3 -c "import json; print(json.load(open('$pkg')).get('version','?'))")
  private=$(python3 -c "import json; print(json.load(open('$pkg')).get('private', False))")
  npm_ver=$(npm view "$name" version 2>/dev/null || echo "—")

  # Count commits since last tag
  if [ "$dir" = "." ]; then
    last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    commits=$([ -n "$last_tag" ] && git rev-list "$last_tag"..HEAD --count || echo "?")
  else
    last_tag=$(cd "$dir" && git describe --tags --abbrev=0 2>/dev/null || echo "")
    commits=$([ -n "$last_tag" ] && (cd "$dir" && git rev-list "$last_tag"..HEAD --count) || echo "?")
  fi

  # Determine status
  if [ "$private" = "True" ]; then
    status="private"
  elif [ "$local_ver" != "$npm_ver" ]; then
    status="VERSION DRIFT"
  elif [ "$commits" != "0" ] && [ "$commits" != "?" ]; then
    status="$commits commits"
  else
    status="up to date"
  fi

  printf "%-30s %-15s local=%-8s npm=%-8s %s\n" "$dir" "$name" "$local_ver" "$npm_ver" "$status"
done
```

### For a specific package release

Run pre-flight checks:

```bash
# In the package directory:
{
  echo "=== Package ==="
  name=$(python3 -c "import json; print(json.load(open('package.json')).get('name','?'))")
  version=$(python3 -c "import json; print(json.load(open('package.json')).get('version','?'))")
  echo "$name@$version"

  echo -e "\n=== Working Directory ==="
  git status --short | head -10
  [ -z "$(git status --porcelain)" ] && echo "✓ Clean" || echo "⚠️ Has uncommitted changes"

  echo -e "\n=== Commits Since Last Tag ==="
  last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -n "$last_tag" ]; then
    git log "$last_tag"..HEAD --oneline --no-decorate | head -15
  else
    echo "No previous tags"
    git log --oneline -10
  fi

  echo -e "\n=== npm Status ==="
  npm_ver=$(npm view "$name" version 2>/dev/null || echo "not published")
  echo "npm: $npm_ver"
}
```

**Decision points:**
- Uncommitted changes? → Ask to commit first (invoke `/commit`)
- No commits since last tag? → Nothing to release, abort
- Version drift (local ≠ npm but no tag)? → Warn, confirm

### Pre-flight: workspace:* dependency check (BLOCKING)

Before publishing, verify no `workspace:*` dependencies remain. These break npm consumers since Bun treats them as local workspace references that don't exist outside the monorepo.

```bash
# Check this package and all workspace packages for workspace:* deps
has_ws=0
for pkg in package.json packages/*/package.json; do
  [ ! -f "$pkg" ] && continue
  ws=$(python3 -c "
import json
d = json.load(open('$pkg'))
deps = {**d.get('dependencies',{}), **d.get('peerDependencies',{})}
bad = [f'  {k}: {v}' for k,v in deps.items() if 'workspace:' in str(v)]
print('\n'.join(bad))
" 2>/dev/null)
  if [ -n "$ws" ]; then
    echo "⚠️  $pkg has workspace:* deps:"
    echo "$ws"
    has_ws=1
  fi
done
[ "$has_ws" = "0" ] && echo "✓ No workspace:* dependencies"
```

If any `workspace:*` dependencies are found: **STOP**. Replace them with real npm version numbers before publishing. Bun workspaces will still resolve them locally when the version matches. See `vendor/CLAUDE.md` for the policy.

### Pre-flight: link check (soft warning, vendor packages with public sites only)

For vendor packages that ship a public docs site (silvery, termless, terminfo.dev, flexily, loggily, mdspec), run the cross-site link checker against the affected site as a final sanity check before publish:

```bash
scripts/check-site-links.sh https://<site>
```

This is a **soft warning** — broken links do NOT block the release. Surface the SUMMARY.md path and ask the user whether to proceed. The point is to catch dead third-party citations and stale cross-site references before they hit announce traffic, not to gate the release on issues that may pre-date this change.

If the package being released does not have a public site (e.g. internal libs), skip this step.

## Phase 2: Generate Changelog

Build changelog entries from two sources: **git log** and **closed beads**.

### Step 2a: Gather commits

```bash
last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$last_tag" ]; then
  git log "$last_tag"..HEAD --format="%H %s" --no-decorate
else
  git log --format="%H %s" --no-decorate
fi
```

Parse conventional commits into categories:
- `feat:` → **Added**
- `fix:` → **Fixed**
- `perf:` → **Performance**
- `refactor:` → **Changed**
- `docs:` → **Documentation**
- `chore:` / `ci:` / `test:` → omit from changelog (internal)

### Step 2b: Gather closed beads (km packages only)

For packages within the km repo (not standalone vendor repos):

```bash
# Find beads closed since last tag date
last_tag_date=$(git log -1 --format=%aI "$last_tag" 2>/dev/null)
bd list --status=closed | grep -i "$package_scope"
```

Match beads to the package by scope prefix (e.g., `km-silvery.*` for silvery, `km-tui.*` for km-tui).

### Step 2c: Merge and deduplicate

Beads take priority — if a bead and commit describe the same change, use the bead title (it's more user-facing). Commits without a matching bead are included as-is.

### Step 2d: Format changelog entry

Use Keep a Changelog format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- **Feature title** — description (bead: km-xyz.feat-name)

### Fixed
- **Bug title** — description (bead: km-xyz.bug-name)
- Fix from commit message without bead

### Changed
- Refactoring description
```

Present the draft to the user for review before writing.

## Phase 3: Version Bump

### Determine version

If the user specified `patch`/`minor`/`major`, use that. Otherwise, infer from changes:

| Changes include | Suggested bump |
|----------------|---------------|
| Only fixes/chores | patch |
| Any `feat:` or feature bead | minor |
| Any `BREAKING CHANGE:` or `!:` | major |

Ask the user to confirm:

```
AskUserQuestion:
  question: "Version bump?"
  options:
    - "Patch (X.Y.Z → X.Y.Z+1) — bug fixes only"
    - "Minor (X.Y.0 → X.Y+1.0) — new features"
    - "Major (X.0.0 → X+1.0.0) — breaking changes"
    - "Cancel"
```

### Apply version bump

```bash
# Update package.json version
npm version <patch|minor|major> --no-git-tag-version
```

## Phase 4: Write Changelog

Prepend the new entry to CHANGELOG.md (create if it doesn't exist).

If the file has an `[Unreleased]` section, replace it with the versioned section and add a fresh empty `[Unreleased]`.

## Phase 5: Commit, Tag, Publish

The same flow for all packages (km root and vendor submodules).

### For vendor submodules

```bash
# In the vendor directory:
git add CHANGELOG.md package.json
git commit -m "chore(release): v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push && git push --tags

# Publish to npm (if not private)
npm publish

# Back in km root — update the submodule ref:
cd /Users/beorn/Code/pim/km
git add vendor/<name>
git commit -m "chore(vendor): update <name> to v$NEW_VERSION"
```

### For km root

```bash
git add CHANGELOG.md package.json
git commit -m "chore(release): v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push && git push --tags

# Create GitHub release
gh release create "v$NEW_VERSION" --title "v$NEW_VERSION" --notes-file /tmp/release-notes.md
```

Write the changelog entry for this version to `/tmp/release-notes.md` before creating the GitHub release.

## Phase 6: Verify

```bash
{
  echo "=== Release Complete ==="
  echo "Package: $name"
  echo "Version: $NEW_VERSION"
  echo "Tag: v$NEW_VERSION"

  # Verify npm (if published)
  npm_ver=$(npm view "$name" version 2>/dev/null)
  if [ -n "$npm_ver" ]; then
    echo "npm: $npm_ver"
    [ "$npm_ver" = "$NEW_VERSION" ] && echo "✓ npm in sync" || echo "⚠️ npm version mismatch"
  fi
}
```

## Phase 7: Update beads

Close any remaining open beads that were included in this release. Add a note to each:

```bash
bd update <bead-id> --notes "Released in $name@$NEW_VERSION"
```

## Error Recovery

| Error | Fix |
|-------|-----|
| npm publish fails (auth) | `npm login` or check `.npmrc` |
| npm publish fails (version exists) | Version already published — bump again |
| Tag already exists | `git tag -d vX.Y.Z` and retry |
| Submodule push rejected | `cd vendor/<name> && git pull --rebase && git push` |

## Dry Run

With `--dry-run`, run phases 1-2 only:
- Show status + commits
- Generate changelog preview
- Show suggested version bump
- Do NOT write files, commit, tag, or publish

## Notes

- Vendor packages must NOT use `workspace:*` dependencies — they are standalone repos
- The km root `overrides` in package.json maps vendor deps to workspace copies for local dev
- Changelogs use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format
- Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- Conventional commits map to changelog sections: feat→Added, fix→Fixed, refactor→Changed
