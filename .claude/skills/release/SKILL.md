---
description: "Release packages — audit, build, version bump, changelog, npm publish, smoke test. Handles single packages and coordinated monorepo releases."
argument-hint: "[--status|--audit|<package-path>|silvery|all] [--dry-run|patch|minor|major]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Skill
---

# Release

**Keywords**: release, publish, version, changelog, npm, tag, vendor release, status

## Usage

| Command | What happens |
|---------|-------------|
| `/release` | Assess all repos, fix issues, propose releases, ask to proceed |
| `/release --status` | Show release status only (read-only) |
| `/release --audit` | Run `bun infra/audit-packages.ts` (publishing readiness) |
| `/release silvery` | Release all @silvery/* packages (coordinated) |
| `/release vendor/loggily` | Release loggily |
| `/release vendor/loggily patch` | Release loggily as patch bump |
| `/release all` | Release every package with unreleased changes |
| `/release --dry-run silvery` | Preview only — don't publish |

## Target

**Argument**: $ARGUMENTS

## The Flow

Every `/release` invocation (except `--status` and `--audit`) follows this flow. One assessment, one confirmation, one execution.

### Step 1: Release Status

Gather data for every publishable package across all repos. For each package, determine:

- **npm version** — what's published (`npm view <name> version`)
- **local version** — what's in package.json
- **tag** — whether `v<version>` git tag exists
- **delta** — commits since last tag that touch this package

Present the full Release Status table to the user. Use this format:

```
Release Status

[silvery] CI=success  last tag=v0.17.0
  silvery                  v0.17.2   npm=0.17.2   NOTAG  3 new
  @silvery/examples        v0.5.6    npm=0.5.6    5 new
  ...

[loggily] CI=success  last tag=v0.6.0
  loggily                  v0.6.1    npm=0.6.1    NOTAG  6 new
```

Flag meanings:
- **(no flags)** — up to date, nothing to do
- **NOTAG** — published version has no git tag (will be auto-fixed)
- **DRIFT** — local version differs from npm (usually means a publish is in progress)
- **UNPUBLISHED** — never published to npm
- **N new** — N commits since last tag touch this package

#### How to gather this data

For each repo in `vendor/silvery vendor/loggily vendor/flexily vendor/bearly`:

```bash
cd <repo>
repo_last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
```

For each non-private package.json in the repo:

```bash
name=$(python3 -c "import json; print(json.load(open('$pkg_json'))['name'])")
version=$(python3 -c "import json; print(json.load(open('$pkg_json'))['version'])")
npm_ver=$(npm view "$name" version 2>/dev/null || echo "—")
```

Tag check: `git rev-parse "v${version}" >/dev/null 2>&1`

Delta count (commits since last tag touching this package's directory):
```bash
pkg_dir=$(dirname "$pkg_json")
git log "$repo_last_tag"..HEAD --oneline -- "$pkg_dir" | wc -l
```

For root packages, exclude sub-directories: `-- . ':!packages' ':!examples'`

**Shell notes**: use `setopt nullglob` in zsh; avoid variable name `status` (reserved); use `ci_result` not `ci_status`.

### Step 2: Plan

Based on the status, build a plan. The plan has up to three sections:

**Housekeeping** (automatic, no approval needed):
- Missing tags — create `v<version>` tags for packages where version matches npm but tag is missing
- Find the right commit: `git log --all --oneline -n1 --grep="v${version}" -- "$pkg_json"`, fallback to last commit touching that package.json

**Releases** (needs approval):
- Packages with new commits since their version tag
- For each: inferred bump type (patch/minor/major from conventional commits), changelog preview
- Coordinated silvery releases group all @silvery/* packages together

**Nothing to do**:
- If no missing tags AND no new commits → "Everything is up to date." Stop.

Present the plan with specific details:
```
Plan:
  Housekeeping:
    - Create tag v0.17.2 in silvery at <commit>
    - Create tag v0.6.1 in loggily at <commit>

  Releases:
    - silvery 0.17.2 → 0.17.3 (patch): 3 commits — examples import, READMEs
    - loggily 0.6.1 → 0.6.2 (patch): 4 commits — README rewrite, async context docs

  No changes:
    - flexily, alien-projections, alien-resources
```

### Step 3: Confirm

Ask once: "Proceed with this plan?"

If user says yes, execute everything. If user says to skip something, adjust.

### Step 4: Execute

Run in this order:

1. **Fix tags** — create missing tags, push tags to each repo
2. **For each release** (in dependency order):
   a. Pre-flight: clean working tree, audit passes
   b. Build: `npx tsdown`
   c. Changelog: generate from commits + closed beads, prepend to CHANGELOG.md
   d. Version bump: `npm version <type> --no-git-tag-version`
   e. Coordinated bump (silvery only): update all @silvery/* versions + cross-deps
   f. Commit: `git commit -m "chore(release): v<version>"`
   g. Tag: `git tag "v<version>"`
   h. Rebuild: `npx tsdown` (with new version embedded)
   i. Publish: `pnpm publish --no-git-checks --access public`
   j. Push: `git push && git push --tags`
   k. Update km root: `git add vendor/<name> && git commit`
3. **Smoke test** each published package
4. **Close beads** included in the release
5. **Push km root**

### Step 5: Report

Show the Release Status again. Everything should now show "up to date".

## Coordinated Silvery Release

All public @silvery/* packages + the silvery barrel share one version number. When releasing silvery:

1. Bump ALL public packages to the same new version
2. Update cross-dependencies (`@silvery/ansi: "0.3.5"` etc.)
3. Build all packages
4. Publish in dependency order:
   - Tier 0: color, headless (no @silvery deps)
   - Tier 1: ansi, theme, commander
   - Tier 2: create, test
   - Tier 3: silvery barrel
   - Tier 4: examples
5. One tag, one commit, one push

Version bump script for coordinated release:
```bash
python3 << PYEOF
import json, glob
for path in glob.glob("vendor/silvery/packages/*/package.json") + ["vendor/silvery/package.json", "vendor/silvery/examples/package.json"]:
    with open(path) as f:
        pkg = json.load(f)
    if pkg.get("private"): continue
    pkg["version"] = "$NEW_VERSION"
    for dep_key in ["dependencies", "peerDependencies"]:
        for dep, ver in pkg.get(dep_key, {}).items():
            if dep.startswith("@silvery/") or dep == "silvery":
                pkg[dep_key][dep] = "$NEW_VERSION"
    with open(path, "w") as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
        f.write("\n")
PYEOF
```

## Version Bump Rules

If user specified `patch`/`minor`/`major`, use that. Otherwise infer from commits:
- Only `fix:`/`chore:`/`docs:` → **patch**
- Any `feat:` → **minor**
- Any `BREAKING CHANGE:` → **major**

Minor and major bumps always require explicit user approval.

## Changelog Format

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- **Feature title** — description

### Fixed
- **Bug title** — description
```

Source: conventional commits (`feat:` → Added, `fix:` → Fixed, `perf:` → Performance, `refactor:` → Changed, `docs:` → Documentation). Omit `chore:`/`ci:`/`test:`. Beads take priority over commits describing the same change.

## Smoke Test

After publishing, verify from a clean directory:

```bash
mkdir -p /tmp/smoke-release && cd /tmp/smoke-release && npm init -y --quiet 2>/dev/null
npm install <package>@<version>
node -e "import('<package>').then(m => console.log('OK:', Object.keys(m).slice(0,5).join(', ')))"
```

For CLI packages: `npx <package>@<version> --help`

For silvery coordinated release, test at minimum:
- `node -e "import('silvery')"`
- `npx @silvery/examples --help`

## Publishing Rules

- **pnpm publish** — npm doesn't support `publishConfig.exports` overrides
- **tsdown** builds — config lives in `"tsdown"` field of package.json
- **Every publish gets a tag** — `v<version>`, pushed immediately
- **Private packages** (`"private": true`) are never published
- All @silvery/* + silvery share the same version number
- Versions follow [SemVer](https://semver.org/)

## Error Recovery

| Error | Fix |
|-------|-----|
| npm publish fails (auth) | `npm login` or check `.npmrc` |
| Version exists on npm | Bump again |
| Tag already exists | `git tag -d vX.Y.Z` and retry |
| Submodule push rejected | `cd vendor/<name> && git pull --rebase && git push` |
| publishConfig not applied | Use `pnpm publish`, NOT `npm publish` |
| Cross-dep version mismatch | Run coordinated bump script |
