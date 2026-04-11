---
description: "Release packages — audit, build, version bump, changelog, npm publish, smoke test. Handles single packages and coordinated monorepo releases."
argument-hint: "[--status|--audit|<package-path>|silvery|all] [--dry-run|patch|minor|major]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Skill
---

# Release

**Keywords**: release, publish, version, changelog, npm, tag, vendor release, status

Release any package in the km monorepo — single packages, the silvery monorepo (coordinated), or all packages at once.

## Quick Commands

| Command | Purpose |
|---------|---------|
| `/release --status` | Dashboard: all packages, versions, changes, CI status |
| `/release --audit` | Run publishing readiness audit |
| `/release vendor/loggily` | Release loggily (single package) |
| `/release vendor/loggily patch` | Release loggily as patch |
| `/release silvery` | Release all silvery packages (coordinated) |
| `/release all` | Release all packages with changes |
| `/release --dry-run vendor/silvery` | Preview what would happen |

## Target

**Argument**: $ARGUMENTS

## `/release --status` — Package Dashboard

Show all publishable packages grouped by repo, with version drift, changes, and CI status:

```bash
cd /Users/beorn/Code/pim/km

echo "=== Package Dashboard ==="
echo ""

for repo_dir in vendor/silvery vendor/loggily vendor/flexily vendor/bearly; do
  repo_name=$(basename "$repo_dir")
  
  # Repo-level info
  cd "/Users/beorn/Code/pim/km/$repo_dir"
  branch=$(git branch --show-current)
  last_push=$(git log -1 --format="%ar" origin/main 2>/dev/null || echo "?")
  ci_status=$(gh run list --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo "?")
  
  echo "[$repo_name] branch=$branch  last push=$last_push  CI=$ci_status"
  
  # Package-level info
  for pkg_json in package.json packages/*/package.json examples/package.json; do
    [ ! -f "$pkg_json" ] && continue
    name=$(python3 -c "import json; print(json.load(open('$pkg_json'))['name'])")
    version=$(python3 -c "import json; print(json.load(open('$pkg_json'))['version'])")
    private=$(python3 -c "import json; print(json.load(open('$pkg_json')).get('private', False))")
    [ "$private" = "True" ] && continue
    
    npm_ver=$(npm view "$name" version 2>/dev/null || echo "—")
    
    # Count commits since version tag
    pkg_dir=$(dirname "$pkg_json")
    if [ "$pkg_dir" = "." ]; then
      commits=$(git log "v${version}"..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
    else
      commits=$(git log "v${version}"..HEAD --oneline -- "$pkg_dir" 2>/dev/null | wc -l | tr -d ' ')
    fi
    
    status=""
    [ "$version" != "$npm_ver" ] && status="DRIFT"
    [ "$commits" -gt 0 ] 2>/dev/null && status="${commits} commits"
    [ -z "$status" ] && status="up to date"
    
    printf "  %-30s  local=%-8s  npm=%-8s  %s\n" "$name" "$version" "$npm_ver" "$status"
  done
  echo ""
  cd /Users/beorn/Code/pim/km
done
```

## `/release --audit` — Publishing Readiness

```bash
cd /Users/beorn/Code/pim/km && bun infra/audit-packages.ts
```

All errors must be zero before releasing.

## Phase 1: Pre-flight

### For single package release

```bash
cd <package-dir>

# Clean working directory?
[ -z "$(git status --porcelain)" ] && echo "✓ Clean" || echo "⚠ Uncommitted changes — commit first"

# Commits since last tag
last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
[ -n "$last_tag" ] && git log "$last_tag"..HEAD --oneline | head -15

# Publishing audit
cd /Users/beorn/Code/pim/km && bun infra/audit-packages.ts 2>&1 | grep -E "ERROR|$name"
```

### For coordinated silvery release

All @silvery/* public packages + silvery barrel share the same version. Check:
1. All packages build: `cd vendor/silvery && npx tsdown && for pkg in packages/*/; do cd "$pkg" && npx tsdown; cd ../..; done`
2. No cross-dep mismatches: `bun infra/audit-packages.ts`
3. Clean working tree in silvery submodule

## Phase 2: Build

**All packages use tsdown** with config in the `"tsdown"` field of package.json.

```bash
# Single package
cd <package-dir> && npx tsdown

# Silvery monorepo (all packages)
cd vendor/silvery
npx tsdown                           # barrel
for pkg in packages/*/; do
  [ -f "$pkg/package.json" ] && grep -q '"tsdown"' "$pkg/package.json" && (cd "$pkg" && npx tsdown)
done
cd examples && npx tsdown && cd ..

# All vendor packages
cd /Users/beorn/Code/pim/km
for dir in vendor/loggily vendor/flexily vendor/silvery vendor/silvery/packages/* vendor/silvery/examples vendor/bearly/packages/*; do
  [ -f "$dir/package.json" ] && grep -q '"tsdown"' "$dir/package.json" && (cd "$dir" && npx tsdown 2>&1 | grep -E "✔|ERROR")
done
```

## Phase 3: Generate Changelog

Build changelog entries from **git log** and **closed beads**.

### Gather commits

```bash
last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
[ -n "$last_tag" ] && git log "$last_tag"..HEAD --format="%H %s" --no-decorate
```

Parse conventional commits: `feat:` → Added, `fix:` → Fixed, `perf:` → Performance, `refactor:` → Changed, `docs:` → Documentation. Omit `chore:`/`ci:`/`test:`.

### Gather closed beads

```bash
last_tag_date=$(git log -1 --format=%aI "$last_tag" 2>/dev/null)
bd list --status=closed | grep -i "$package_scope"
```

Beads take priority over commits describing the same change.

### Format (Keep a Changelog)

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- **Feature title** — description (bead: km-xyz.feat-name)

### Fixed
- **Bug title** — description
```

Present draft for user review.

## Phase 4: Version Bump

### Single package

If user specified `patch`/`minor`/`major`, use that. Otherwise infer:
- Only fixes/chores → patch
- Any `feat:` → minor
- Any `BREAKING CHANGE:` → major

```bash
npm version <patch|minor|major> --no-git-tag-version
```

### Coordinated silvery release

All @silvery/* public packages bump to the SAME version:

```bash
cd /Users/beorn/Code/pim/km
NEW_VERSION="X.Y.Z"  # determined from bump type

python3 << PYEOF
import json, glob
for path in glob.glob("vendor/silvery/packages/*/package.json") + ["vendor/silvery/package.json", "vendor/silvery/examples/package.json"]:
    with open(path) as f:
        pkg = json.load(f)
    if pkg.get("private"): continue
    pkg["version"] = "$NEW_VERSION"
    # Update cross-deps
    for dep_key in ["dependencies", "peerDependencies"]:
        for dep, ver in pkg.get(dep_key, {}).items():
            if dep.startswith("@silvery/") or dep == "silvery":
                pkg[dep_key][dep] = "$NEW_VERSION"
    with open(path, "w") as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
        f.write("\n")
PYEOF
```

**IMPORTANT**: Version bump requires user approval for minor/major bumps.

## Phase 5: Write Changelog

Prepend new entry to CHANGELOG.md. Create if missing.

## Phase 6: Commit, Tag, Publish

### Publish with pnpm (NOT npm)

`pnpm publish` is required — it applies `publishConfig.exports` overrides.

```bash
# Single package
cd <package-dir>
git add CHANGELOG.md package.json
git commit -m "chore(release): v$NEW_VERSION"
git tag "v$NEW_VERSION"
npx tsdown  # rebuild with new version
pnpm publish --no-git-checks --access public
git push && git push --tags

# Back in km root
cd /Users/beorn/Code/pim/km
git add vendor/<name>
git commit -m "chore(vendor): <name> v$NEW_VERSION"
```

### Coordinated silvery release (publish in dependency order)

```bash
# Tier 0: no @silvery deps
for pkg in color headless; do cd packages/$pkg && pnpm publish --no-git-checks --access public && cd ../..; done

# Tier 1
for pkg in ansi theme commander; do cd packages/$pkg && pnpm publish --no-git-checks --access public && cd ../..; done

# Tier 2
for pkg in create test; do cd packages/$pkg && pnpm publish --no-git-checks --access public && cd ../..; done

# Tier 3: barrel
pnpm publish --no-git-checks --access public

# Tier 4: examples
cd examples && pnpm publish --no-git-checks --access public
```

## Phase 7: Smoke Test

After publishing, verify packages work from npm:

```bash
mkdir -p /tmp/smoke-release && cd /tmp/smoke-release
npm init -y --quiet 2>/dev/null

# Test import
npm install <package>@<version>
node -e "import('<package>').then(m => console.log('OK:', Object.keys(m).slice(0,5).join(', ')))"

# Test CLI (if applicable)
npx <package>@<version> --help

# Test in Bun
bun -e "import '<package>'; console.log('bun OK')"
```

For silvery coordinated release, test at minimum:
- `node -e "import('silvery')"`
- `npx @silvery/examples --help`
- `node -e "import('loggily')"`

## Phase 8: GitHub Release

```bash
gh release create "v$NEW_VERSION" --title "v$NEW_VERSION" --notes-file /tmp/release-notes.md
```

## Phase 9: Update Beads

Close remaining open beads included in this release:

```bash
bd update <bead-id> --notes "Released in $name@$NEW_VERSION"
bd close <bead-id> --reason "Released in v$NEW_VERSION"
```

## Error Recovery

| Error | Fix |
|-------|-----|
| npm publish fails (auth) | `npm login` or check `.npmrc` |
| Version exists on npm | Bump again |
| Tag already exists | `git tag -d vX.Y.Z` and retry |
| Submodule push rejected | `cd vendor/<name> && git pull --rebase && git push` |
| publishConfig not applied | Use `pnpm publish`, NOT `npm publish` |
| Cross-dep version mismatch | Run coordinated bump script (Phase 4) |

## Dry Run

With `--dry-run`: run phases 1-3 only (status, build, changelog preview). Do NOT write files, commit, tag, or publish.

## Notes

- **pnpm publish** required — npm doesn't support `publishConfig.exports` override
- **tsdown** builds from `"tsdown"` field in package.json (no config files)
- All @silvery/* + silvery share the same version number
- Private packages (`"private": true`) are skipped during publish
- Changelogs use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- Versions follow [SemVer](https://semver.org/)
- Conventional commits map to changelog sections
- Run `bun infra/audit-packages.ts` before any release
