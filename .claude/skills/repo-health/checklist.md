# Repo Health Checklist

Each item: what to check, why it matters, how to fix, common exceptions.

## Critical (blocks publishing/legal)

### LICENSE file exists
- **Check**: `test -f LICENSE` or `test -f LICENSE.md`
- **Why**: npm publish warns, GitHub shows "No license", legal ambiguity
- **Fix**: Copy MIT template from `templates.md`, set year from first commit (`git log --reverse --format=%ai | head -1 | cut -d- -f1`) and author from package.json
- **Exception**: Private packages that will never be published

### LICENSE matches package.json
- **Check**: `package.json` `license` field matches the LICENSE file header
- **Why**: Conflicting license info creates legal confusion
- **Fix**: Align both to the intended license (usually MIT)

### No tracked build artifacts
- **Check**: `git ls-files dist/ coverage/ *.tgz docs/.vitepress/dist docs/.vitepress/cache`
- **Why**: Bloats repo, causes merge conflicts, stale artifacts mislead
- **Fix**: `git rm -r --cached <path>`, add to .gitignore
- **Exception**: Vendored dependencies intentionally committed

### No tracked secrets
- **Check**: `git ls-files .env .env.local .env.production credentials.json *.pem *.key`
- **Why**: Security breach, credential exposure
- **Fix**: `git rm --cached <file>`, add to .gitignore, rotate compromised credentials
- **Exception**: `.env.example` files with placeholder values

### VitePress dist/cache not tracked
- **Check**: `git ls-files docs/.vitepress/dist docs/.vitepress/cache`
- **Why**: These are build outputs, should be in .gitignore
- **Fix**: `git rm -r --cached docs/.vitepress/{dist,cache}`, add to .gitignore

## Standard (professional quality)

### package.json completeness
- **Check**: All of these fields present and non-empty:
  - `name` — scoped if appropriate (`@beorn/pkgname`)
  - `description` — one-line summary
  - `keywords` — relevant search terms (3-8)
  - `homepage` — docs site or GitHub repo URL
  - `bugs` — `{ "url": "https://github.com/user/repo/issues" }`
  - `repository` — `{ "type": "git", "url": "git+https://github.com/user/repo.git" }`
  - `author` — name and email
  - `license` — SPDX identifier (e.g., "MIT")
- **Why**: npm registry display, discoverability, user trust
- **Fix**: Fill each missing field. Derive homepage from repository URL. Derive bugs from repository URL.
- **Exception**: Monorepo root package.json may omit some fields

### .gitignore completeness
- **Check**: Compare against template in `templates.md`. Must include:
  - `node_modules/`
  - `dist/`
  - `.DS_Store`
  - `coverage/`
  - `*.log`
  - `*.tgz`
  - `bun.lockb` (binary format — use text `bun.lock` instead)
  - `docs/.vitepress/dist` and `docs/.vitepress/cache` (if VitePress is used)
- **Why**: Prevents accidental commits of generated/temporary files
- **Fix**: Add missing entries from template, preserve existing custom entries

### README quality
- **Check**: README.md exists and contains:
  - Package name / tagline
  - Brief description / value proposition
  - Installation instructions
  - Quick start / basic usage example
  - Link to full docs (if docs site exists)
  - License section or badge
- **Why**: First impression, user onboarding, discoverability
- **Fix**: Add missing sections. Keep it concise.
- **Exception**: Internal/private packages may have minimal README

### Lockfile present
- **Check**: `bun.lock` exists (text format, not binary `bun.lockb`)
- **Why**: Reproducible installs, CI consistency
- **Fix**: `bun install` generates `bun.lock`. Delete `bun.lockb` if present, add it to .gitignore.
- **Exception**: Packages with zero dependencies

### Homepage URL accuracy
- **Check**: `package.json` homepage matches:
  - Actual deployed site URL
  - CNAME file contents (if GitHub Pages)
  - README links/badges
- **Why**: Dead links erode trust, confuse users
- **Fix**: Align all URLs. For GitHub Pages with custom domain, the pattern is `https://<domain>/<repo>/`

### GitHub Pages enabled
- **Check**: If `.github/workflows/deploy-docs.yml` exists, verify GitHub Pages is configured
- **Why**: Workflow runs but site isn't accessible without Pages enabled
- **Fix**: Enable Pages in repo settings → Pages → Source: GitHub Actions
- **Note**: Can verify via `gh api repos/{owner}/{repo}/pages` (404 = not enabled)

### npm badge accuracy
- **Check**: If README has npm badge, package name in badge URL matches `package.json` name
- **Why**: Badge shows wrong package or 404
- **Fix**: Update badge URL to use correct package name

### docs site links valid
- **Check**: All links in README and docs point to valid destinations
- **Why**: Dead links are unprofessional and confuse users
- **Fix**: Update or remove dead links

## Low (consistency)

### Author field consistent
- **Check**: `author` field matches across monorepo subpackages
- **Why**: Consistency, attribution
- **Fix**: Use same author object everywhere

### CHANGELOG.md present
- **Check**: `test -f CHANGELOG.md`
- **Why**: Release history, what changed between versions
- **Fix**: Create with initial version entry
- **Exception**: Very early-stage packages, packages that use GitHub Releases instead

### repository.url has .git suffix
- **Check**: `repository.url` ends with `.git`
- **Why**: Convention, some tools expect it
- **Fix**: Append `.git` if missing

### No hardcoded absolute paths
- **Check**: `grep -r '/Users/' --include='*.ts' --include='*.js' --include='*.json'` in tracked files
- **Why**: Breaks on other machines
- **Fix**: Use relative paths or environment variables
- **Exception**: Test fixtures with mocked paths
