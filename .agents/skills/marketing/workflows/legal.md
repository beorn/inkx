---
description: "Legal audit for all public websites and npm packages — licenses, dependencies, privacy, terms, content"
argument-hint: "[full|licenses|deps|privacy|content]"
---

# Legal Audit Workflow

Systematic review of legal exposure across all public-facing properties: websites, npm packages, documentation, and data.

**Disclaimer**: This workflow is a checklist, not legal advice. For real legal questions, consult a lawyer.

## When to Run

- Before making a repo public
- Before a major launch / outreach campaign
- After adding new dependencies
- Quarterly maintenance (add to `/marketing audit`)

## Sub-Commands

| Command | Scope |
|---------|-------|
| `/marketing legal` | Full audit (all checks) |
| `/marketing legal licenses` | License files + package.json only |
| `/marketing legal deps` | Dependency license compatibility |
| `/marketing legal privacy` | Analytics, cookies, data collection |
| `/marketing legal content` | Copyright, attribution, third-party content |

## Phase 1: License Audit

### 1.1 Own Packages — LICENSE file + package.json

Every published package needs both a LICENSE file AND a `"license"` field in package.json.

```bash
# Check all vendor packages
for dir in vendor/*/; do
  name=$(basename "$dir")
  has_file=$([ -f "$dir/LICENSE" ] && echo "YES" || echo "NO")
  pkg_license=$(grep '"license"' "$dir/package.json" 2>/dev/null | head -1 | sed 's/.*: *"//' | sed 's/".*//' || echo "NONE")
  echo "$name | file=$has_file | pkg=$pkg_license"
done

# Check sub-packages in monorepos
for dir in vendor/*/packages/*/; do
  [ -f "$dir/package.json" ] || continue
  name=$(grep '"name"' "$dir/package.json" | head -1 | sed 's/.*: *"//' | sed 's/".*//')
  pkg_license=$(grep '"license"' "$dir/package.json" | head -1 | sed 's/.*: *"//' | sed 's/".*//')
  echo "  $name: $pkg_license"
done
```

**Expected**: MIT for code packages, CC BY 4.0 for data-only packages (terminfo.dev).

**Fix**: Missing LICENSE file → copy from repo root. Missing package.json field → add `"license": "MIT"`.

### 1.2 License Consistency

- LICENSE file text must match package.json `"license"` field
- Copyright year should be current or range (e.g., "2025-2026")
- Copyright holder should be consistent ("Bjorn Stabell" or "Beorn")
- Sub-packages in monorepos can inherit from root LICENSE but should have their own for npm

### 1.3 Comparison with Industry Standard

| Site Type | Standard License | Our Choice |
|-----------|-----------------|------------|
| Data/compatibility tables | CC BY 4.0 (caniuse, caniemail) | CC BY 4.0 for terminfo.dev |
| Code libraries/frameworks | MIT (React, Ink, Yoga) | MIT for silvery, termless, flexily, etc. |
| Documentation sites | Often unlicensed or CC BY | Same license as the code |

## Phase 2: Dependency License Compatibility

### 2.1 Direct Dependencies

Check that no dependency uses a license incompatible with MIT:

```bash
# For each vendor package
for dir in vendor/*/; do
  [ -f "$dir/package.json" ] || continue
  echo "=== $(basename $dir) ==="
  cd "$dir"
  npx license-checker --summary 2>/dev/null || bunx license-checker --summary 2>/dev/null
  cd -
done
```

**Problematic licenses to flag**:
- **GPL/AGPL** — viral, forces your code to be GPL too
- **SSPL** — Server Side Public License (MongoDB-style, restrictive)
- **BSL** — Business Source License (time-delayed open source)
- **UNLICENSED** — cannot legally use
- **CC BY-NC** — no commercial use
- **CC BY-SA** — share-alike (viral for data)

**Safe licenses**: MIT, BSD-2, BSD-3, ISC, Apache-2.0, CC0, CC BY 4.0, Unlicense, 0BSD

### 2.2 Transitive Dependencies

Deep audit for hidden GPL/AGPL in the dependency tree:

```bash
npx license-checker --production --excludePrivatePackages --failOn "GPL-2.0;GPL-3.0;AGPL-3.0;SSPL-1.0" 2>/dev/null
```

### 2.3 Native/WASM Dependencies

Special attention for termless backends that bundle native code:
- **@termless/ghostty** — Ghostty is MIT (OK)
- **@termless/kitty** — Kitty is GPL-3.0 (**must not distribute the binary, only build from source**)
- **@termless/libvterm** — libvterm is MIT (OK)
- **@termless/alacritty** — Alacritty is Apache-2.0 (OK)
- **@termless/wezterm** — WezTerm is MIT (OK)
- **@xterm/headless** — MIT (OK)

**Action**: Verify @termless/kitty is marked as "build from source, not distributed" in its README/package.json.

## Phase 3: Privacy & Data Collection

### 3.1 Analytics Scripts

Check all sites for analytics/tracking:

```bash
for dir in vendor/terminfo.dev vendor/silvery vendor/termless vendor/flexily vendor/loggily; do
  echo "=== $(basename $dir) ==="
  grep -r "analytics\|tracking\|beacon\|plausible\|gtag\|google-analytics\|GA_" "$dir/docs/" --include="*.ts" --include="*.md" --include="*.html" -l 2>/dev/null
done
```

**Check for**:
- Google Analytics → requires cookie consent banner in EU (GDPR)
- Cloudflare Web Analytics (beacon.min.js) → privacy-friendly, no cookies, no consent needed
- Plausible → privacy-friendly, no cookies, no consent needed
- Any other tracking scripts

### 3.2 Cookie Usage

- Do any sites set cookies? VitePress itself doesn't, but plugins might
- If cookies are used → need cookie consent banner for GDPR compliance
- Cloudflare beacon.min.js is cookie-free (safe)

### 3.3 User Data Collection

- **terminfo.dev test script** — collects terminal name, version, OS. No PII.
- **GitHub issue submission** — user's GitHub identity is visible. Standard for open source.
- **Search Console** — Google collects search analytics (aggregate, no PII to us)
- **No email collection, no accounts, no forms** that collect PII

### 3.4 Data Processing

If any user data is collected:
- Where is it stored? (GitHub issues → GitHub's servers)
- Who has access? (Public repo → everyone. Private repo → repo collaborators)
- Is there a privacy policy? (Not currently — add if collecting data beyond terminal type)

## Phase 4: Content & Attribution

### 4.1 Third-Party Content

Check for content that requires attribution:

- **Terminal logos/icons** — Do we use any? Check docs/public/ for images
- **Comparison articles** — Do we quote other projects? Fair use applies for short quotes
- **Benchmark data** — Is it our own or reproduced from elsewhere?
- **Documentation** — Any content copied from MDN, W3C specs, or other docs?

### 4.2 Trademark Usage

- Using terminal names (Ghostty, iTerm2, Kitty, etc.) is nominative fair use for compatibility tables
- Don't use logos without permission (unless explicitly allowed by the project)
- Comparison pages should be factual, not disparaging

### 4.3 AI-Generated Content

- Content generated by AI (Claude, GPT) has unclear copyright status in some jurisdictions
- Best practice: human-review all AI-generated content before publishing
- Don't claim AI-generated text as original human authorship
- Document that enrichment content was AI-assisted (optional but ethical)

## Phase 5: Terms of Service

### 5.1 Current State

- No Terms of Service on any site
- No Privacy Policy on any site
- For data-reference sites (terminfo.dev), this is standard — caniuse.com has none either

### 5.2 When You Need Them

- **Privacy Policy**: Required if collecting PII or using cookies (GDPR/CCPA). Currently NOT needed — Cloudflare beacon is cookie-free, no PII collected.
- **Terms of Service**: Optional for open data sites. Useful if you want to limit liability for data accuracy.
- **DMCA/Copyright**: GitHub handles this for repos. Sites don't need their own policy.

### 5.3 Recommended (not urgent)

Add a simple footer disclaimer to terminfo.dev:
```
Data provided as-is. Not legal advice. CC BY 4.0.
```

## Phase 6: Community Contributions

### 6.1 Contributor License Agreement (CLA)

For public repos accepting PRs:
- **Small projects** (terminfo.dev data corrections) → no CLA needed. The PR itself implies license grant under the repo's license.
- **Large projects** (silvery, termless) → consider a lightweight CLA or DCO (Developer Certificate of Origin). GitHub has built-in DCO enforcement via `dco` bot.
- **Current state**: No CLA on any repo. Standard for small open-source projects.

### 6.2 DMCA / Safe Harbor

If community members submit probe results:
- Results are factual data (not copyrightable) — no DMCA risk
- Terminal names are used for compatibility reporting (nominative fair use)
- GitHub provides DMCA safe harbor for hosted content

### 6.3 npm README License Badges

Every published npm package should have a license badge in README:
```markdown
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
```

Check all packages:
```bash
for dir in vendor/*/; do
  [ -f "$dir/README.md" ] || continue
  if grep -q "License" "$dir/README.md" 2>/dev/null; then
    echo "OK: $(basename $dir)"
  else
    echo "MISSING BADGE: $(basename $dir)"
  fi
done
```

## Remediation Checklist

After running the audit, fix issues in this order:

1. **Critical** — Missing licenses on published npm packages (blocks legal use)
2. **Critical** — GPL/AGPL dependencies in MIT-licensed code (license violation)
3. **High** — Missing LICENSE files (legal ambiguity)
4. **Medium** — Inconsistent copyright holders or years
5. **Medium** — Unlicensed third-party content (attribution needed)
6. **Low** — Missing privacy policy (not needed unless collecting PII)
7. **Low** — Missing terms of service (optional for data sites)

## Output

Present as a table:

```markdown
## Legal Audit — 2026-04-01

| Area | Status | Issues |
|------|--------|--------|
| Package licenses | 12/13 OK | terminfo.dev missing |
| Sub-package licenses | 30/30 OK | — |
| Dependency licenses | All safe | No GPL/AGPL in tree |
| Privacy/analytics | Clean | Cloudflare beacon only, no cookies |
| Content attribution | OK | All original content |
| Terms/privacy policy | Not needed | No PII collected |
| Community/CLA | OK | No CLA needed for small projects |
| License badges | 10/13 | 3 READMEs missing badges |

### Action Items
1. Add CC BY 4.0 to terminfo.dev (km-terminfo.cc-by-4)
```
