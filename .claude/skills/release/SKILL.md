---
description: "Release packages — audit, build, version bump, changelog, npm publish, smoke test. Handles single packages and coordinated monorepo releases."
argument-hint: "[--status|--audit|<package-path>|silvery|all] [--dry-run|patch|minor|major]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Skill
---

# Release

**Keywords**: release, publish, version, changelog, npm, tag, vendor release, status

## CLI Tool

The release tool lives at `.claude/skills/release/release.ts`. Run via `bun release` (script in root package.json).

```bash
bun release                  # Default: show status
bun release status           # Release status table
bun release status -v        # Status with commit messages (what changed)
bun release plan             # Status + plan (what would happen)
bun release plan -v          # Plan with commit details
bun release plan silvery     # Plan filtered to silvery packages
bun release fix-tags         # Create missing tags for published versions
bun release execute          # Fix tags + prepare releases
bun release execute silvery  # Execute filtered to silvery
```

**When running as `/release`**, always use `-v` so the user sees what changed, not just "N new".

## Usage

| Command | What happens |
|---------|-------------|
| `/release` | Run `bun release plan`, present results, confirm, execute |
| `/release --status` | Run `bun release status` (read-only) |
| `/release --audit` | Run `bun infra/audit-packages.ts` |
| `/release silvery` | Run `bun release plan silvery`, confirm, execute |
| `/release vendor/loggily` | Release a single package |
| `/release all` | Release every package with unreleased changes |
| `/release --dry-run silvery` | Run `bun release plan silvery` only (no execution) |

## Target

**Argument**: $ARGUMENTS

## Repos

Scan all vendor repos that contain publishable packages:

| Repo | Packages | Tag scheme |
|------|----------|------------|
| `vendor/silvery` | silvery, @silvery/ansi, @silvery/color, @silvery/commander, @silvery/examples | `v<version>` (coordinated) |
| `vendor/loggily` | loggily | `v<version>` |
| `vendor/flexily` | flexily | `v<version>` |
| `vendor/bearly` | @bearly/tribe, @bearly/github, alien-projections, alien-resources, vitepress-enrich, vitest-silvery-dots | `<name>-v<version>` (per-package) |
| `vendor/termless` | @termless/core, @termless/cli, @termless/test, + backends | `v<version>` |
| `vendor/vterm` | vt100.js, vt220.js, vterm.js | `v<version>` |
| `vendor/vimonkey` | vimonkey | `v<version>` |
| `vendor/watcher-chaos` | @beorn/watcher-chaos | `v<version>` |

Discovery: for each `vendor/*/package.json`, check `private !== true`. Also check `packages/*/package.json` and `examples/package.json` inside monorepos.

## The Flow

Every `/release` (except `--status`, `--audit`) follows five steps. One assessment, one confirmation, one execution.

### Step 1: Release Status

For every publishable package across all repos, gather:
- **npm version**: `npm view <name> version`
- **local version**: from package.json
- **tag exists**: `git rev-parse "v<version>"` (or `<name>-v<version>` for bearly)
- **delta**: commits since the version tag that touch this package

Present the full table:

```
Release Status

[silvery] CI=success  last tag=v0.17.2
  silvery                  v0.17.2   npm=0.17.2   2 new
  @silvery/ansi            v0.3.4    npm=0.3.4    up to date
  @silvery/color           v0.1.2    npm=0.1.2    up to date
  @silvery/commander       v0.8.2    npm=0.8.2    up to date
  @silvery/examples        v0.5.6    npm=0.5.6    3 new

[loggily] CI=success  last tag=v0.6.1
  loggily                  v0.6.1    npm=0.6.1    4 new

[flexily] CI=success  last tag=v0.5.2
  flexily                  v0.5.2    npm=0.5.2    up to date
```

Flags: **NOTAG** (published but no git tag), **DRIFT** (local != npm), **UNPUBLISHED** (not on npm), **N new** (N commits since tag).

**Shell notes**: `setopt nullglob` in zsh; never use variable name `status` (reserved in zsh); for root packages in monorepos exclude subdirs with `-- . ':!packages' ':!examples'`.

### Step 2: Fix Tag Hygiene

Before planning, silently fix missing tags. For any package where version matches npm but tag is missing:

1. Find the commit that set this version: `git log --all --oneline -n1 --grep="v<version>" -- <pkg_json>`
2. Fallback: last commit touching that package.json
3. Create tag: `git tag "v<version>" <commit>`
4. Push tags: `git push --tags`

Report what was tagged but don't ask for confirmation — this is housekeeping, not a release.

Then **re-gather deltas** using the new tags. The "N new" counts will now reflect only truly unreleased changes.

### Step 3: Plan

With accurate tag-based deltas, build the plan:

**Releases** — packages with new commits since their version tag:
- For each: inferred bump type, one-line changelog summary
- Coordinated silvery releases group all @silvery/* together
- Show the commit list for each package so the user can judge

**No changes** — packages where everything is tagged and up to date.

```
Plan:
  Release:
    silvery 0.17.2 → 0.17.3 (patch)
      - feat(examples): switch from spawn to dynamic import+main()
      - docs: add READMEs for @silvery/color and @silvery/ansi

    loggily 0.6.1 → 0.6.2 (patch)
      - docs: README rewrite, async context propagation

  Up to date:
    flexily, @silvery/commander, alien-projections, alien-resources
```

If nothing to release: **"Everything is up to date."** Stop.

With `--dry-run`: show the plan and stop. Don't execute.

### Step 4: Confirm

Ask once: **"Proceed?"**

The user can approve all, skip specific packages, or abort.

### Step 5: Execute

For each release, in dependency order:

1. **Pre-flight**: clean working tree, `bun infra/audit-packages.ts` passes
2. **Changelog**: generate from commits + closed beads, prepend to CHANGELOG.md, show draft
3. **Version bump**: `npm version <type> --no-git-tag-version` (coordinated bump for silvery)
4. **Build**: `npx tsdown` (rebuilds with new version)
5. **Commit + tag**: `git commit -m "chore(release): v<version>"` then `git tag "v<version>"`
6. **Publish**: `pnpm publish --no-git-checks --access public` (dependency order for silvery)
7. **Push**: `git push && git push --tags`
8. **Smoke test**: verify import works from npm in a clean /tmp directory
9. **GitHub Release**: `gh release create "v<version>"` with changelog as notes
10. **Update km root**: `git add vendor/<name> && git commit -m "chore(vendor): <name> v<version>"`
11. **Close beads**: any beads included in this release

After all releases: push km root, show final Release Status (should be all "up to date").

## Coordinated Silvery Release

All public @silvery/* packages share one version. Currently published:

| Tier | Packages | Why this order |
|------|----------|---------------|
| 0 | @silvery/color | Zero @silvery deps |
| 1 | @silvery/ansi, @silvery/commander | Depends on color |
| 2 | silvery (barrel) | Re-exports everything |
| 3 | @silvery/examples | Depends on silvery |

Private packages (@silvery/ag, ag-react, ag-term, create, headless, test, theme, etc.) are bundled into the silvery barrel — they don't publish separately but their versions and cross-deps are still bumped for internal consistency.

Coordinated version bump script:
```bash
python3 << 'PYEOF'
import json, glob
NEW_VERSION = "$NEW_VERSION"
for path in glob.glob("vendor/silvery/packages/*/package.json") + \
            ["vendor/silvery/package.json", "vendor/silvery/examples/package.json"]:
    with open(path) as f:
        pkg = json.load(f)
    pkg["version"] = NEW_VERSION
    for dep_key in ["dependencies", "peerDependencies"]:
        for dep in list(pkg.get(dep_key, {})):
            if dep.startswith("@silvery/") or dep == "silvery":
                pkg[dep_key][dep] = NEW_VERSION
    with open(path, "w") as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
        f.write("\n")
PYEOF
```

This bumps ALL packages (public + private) so cross-deps stay consistent.

## Reference

### Version Bump Rules

User-specified `patch`/`minor`/`major` takes precedence. Otherwise infer:
- Only `fix:`/`chore:`/`docs:` → **patch**
- Any `feat:` → **minor**
- Any `BREAKING CHANGE:` → **major**

Minor and major bumps require explicit user approval.

### Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Source: conventional commits (`feat:` → Added, `fix:` → Fixed, `perf:` → Performance, `refactor:` → Changed, `docs:` → Documentation). Omit `chore:`/`ci:`/`test:`. Beads take priority over commits for the same change.

### Publishing Rules

- **pnpm publish** required — npm doesn't support `publishConfig.exports`
- **tsdown** builds from `"tsdown"` field in package.json
- **Every publish gets a tag** — pushed immediately
- All @silvery/* share the same version number
- [SemVer](https://semver.org/) versioning

### Smoke Test

```bash
mkdir -p /tmp/smoke-release && cd /tmp/smoke-release && npm init -y --quiet 2>/dev/null
npm install <package>@<version>
node -e "import('<package>').then(m => console.log('OK:', Object.keys(m).slice(0,5).join(', ')))"
```

For CLIs: `npx <package>@<version> --help`
For silvery: also test `npx @silvery/examples --help`

### Error Recovery

| Error | Fix |
|-------|-----|
| npm publish fails (auth) | `npm login` or check `.npmrc` |
| Version exists on npm | Bump again |
| Tag already exists | `git tag -d vX.Y.Z` and retry |
| Submodule push rejected | `cd vendor/<name> && git pull --rebase && git push` |
| publishConfig not applied | Use `pnpm publish`, NOT `npm publish` |
| Cross-dep version mismatch | Run coordinated bump script |
