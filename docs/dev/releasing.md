# Releasing

km uses [release-it](https://github.com/release-it/release-it) for GitHub releases.

## Versioning

The version is defined in **one place only**: `package.json`

At build time, `bun run build:info` generates `packages/km-core/src/build-info.gen.ts`:

```typescript
export const VERSION = "0.1.0"
export const GIT_COMMIT = "5197ef0"
export const GIT_BRANCH = "main"
export const GIT_DIRTY = false
export const BUILD_TIME = "2026-01-23T10:00:00.000Z"
```

This file is **gitignored** — regenerated on every build.

**Usage:**

```typescript
import { VERSION, BUILD_INFO } from "@km/core"
program.version(VERSION)
console.log(`km v${VERSION} (${BUILD_INFO.gitCommit})`)
```

---

## Quick Start

```bash
bun release              # Interactive (prompts for version type)
bun release patch        # Patch release: 0.1.0 → 0.1.1
bun release minor        # Minor release: 0.1.0 → 0.2.0
bun release major        # Major release: 0.1.0 → 1.0.0
bun release --dry-run    # Preview without making changes
```

## What Happens

When you run `bun release`, release-it:

1. **Validates** clean git tree and main branch
2. **Bumps** version in package.json
3. **Regenerates** build-info.gen.ts (via `after:bump` hook)
4. **Updates** CHANGELOG.md from conventional commits
5. **Commits** with message `chore(release): vX.Y.Z`
6. **Tags** with `vX.Y.Z`
7. **Creates** GitHub release with changelog excerpt
8. **Pushes** commits and tags

## Prerequisites

- Clean working directory (no uncommitted changes)
- On `main` branch
- GitHub CLI (`gh`) authenticated for GitHub releases

## Configuration

Config was previously in `.release-it.json` (now managed by the `/release` skill):

```json
{
  "git": {
    "commitMessage": "chore(release): v${version}",
    "tagName": "v${version}",
    "requireCleanWorkingDir": true,
    "requireBranch": "main"
  },
  "github": {
    "release": true,
    "releaseName": "v${version}"
  },
  "npm": {
    "publish": false
  },
  "plugins": {
    "@release-it/conventional-changelog": {
      "preset": "conventionalcommits",
      "infile": "CHANGELOG.md"
    }
  },
  "hooks": {
    "after:bump": "bun run build:info"
  }
}
```

## Changelog Format

release-it uses conventional commits to generate changelog entries:

| Commit Type        | Changelog Section |
| ------------------ | ----------------- |
| `feat:`            | Added             |
| `fix:`             | Fixed             |
| `refactor:`        | Changed           |
| `perf:`            | Performance       |
| `BREAKING CHANGE:` | Breaking Changes  |

## Manual Steps (if needed)

If you need to release without release-it:

```bash
# 1. Update version
vim package.json  # bump version field

# 2. Regenerate build info
bun run build:info

# 3. Update CHANGELOG.md
# Move [Unreleased] content to [X.Y.Z] - YYYY-MM-DD

# 4. Commit and tag
git add -A
git commit -m "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# 5. Create GitHub release
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."

# 6. Push
git push && git push --tags
```

## See Also

- [CHANGELOG.md](../../CHANGELOG.md) — Release history
- [release-it docs](https://github.com/release-it/release-it)
