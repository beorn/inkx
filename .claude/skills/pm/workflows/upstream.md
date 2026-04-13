---
description: Handle bugs in upstream dependencies - report, vendorize, fix
---

# Skill: Handle Upstream Package Bugs

**Keywords**: upstream bug, vendor, submodule, dependency bug, package bug, vendorize, file issue, report bug, github issue, bug report

When encountering a bug in an upstream dependency, follow this systematic workflow to investigate, report, and optionally fix the issue.

**Activation**: Use this skill whenever filing a bug against an external project. It MUST be loaded before running `gh issue create` on any repo you don't own.

## Workflow

### 0. Update Dependencies First

Before investigating, ensure you're on the latest version — the bug may already be fixed:

```bash
bun update <package>@latest
bun run test:fast   # verify nothing broke
# Try to reproduce — if fixed, you're done
```

### 1. Isolate and Confirm the Bug

Confirm the bug is in the upstream package, not your code:

```bash
mkdir /tmp/bug-repro && cd /tmp/bug-repro
# Create minimal package.json + repro script
bun install && bun run repro.tsx
```

### 2. Read the Source Code

Before theorizing about root cause, **read the actual source** to verify your hypothesis:

```bash
# Fetch the relevant source file from the project
WebFetch the raw source from GitHub (e.g. raw.githubusercontent.com/owner/repo/main/path/to/file.rs)
# Or clone locally and read
```

**Never file a bug report with an unverified root cause analysis.** If you claim "line X does Y", confirm it by reading line X.

### 3. Search for Existing Reports

```bash
gh search issues --repo <owner>/<repo> "<keywords>"
gh search issues --repo <owner>/<repo> "crash"
gh search issues --repo <owner>/<repo> "memory"
# Also try WebSearch for broader coverage
```

Check: open issues, recent releases/changelogs, discussions. Also check if the project has a parent/upstream repo (e.g., `coder/ghostty-web` wraps `ghostty-org/ghostty`) — the bug may need to be filed upstream of the upstream.

### 4. Assess the Project

Before filing, understand the project's health, culture, and responsiveness. This determines **whether**, **where**, and **how** to file — and whether to invest effort waiting for a response or just fix it yourself.

#### 4a. Project Profile

Who owns this? What's the business model? Is this the canonical repo or a wrapper/fork?

```bash
# Repo metadata
gh api repos/<owner>/<repo> --jq '{ stars: .stargazers_count, forks: .forks_count, open_issues: .open_issues_count, created: .created_at, pushed: .pushed_at, license: .license.spdx_id, description: .description }'

# Org profile
gh api orgs/<owner> --jq '{ name: .name, blog: .blog, description: .description }'
```

**Note**: The npm package name may differ from the GitHub repo (e.g., `ghostty-web` npm package lives at `coder/ghostty-web` on GitHub). Verify which repo is canonical.

#### 4b. Maintainer Activity

Recent commits, contributor distribution, release cadence:

```bash
gh api repos/<owner>/<repo>/commits --jq '.[0:5] | .[] | .commit.author.date + " " + (.commit.message | split("\n")[0])'
gh api repos/<owner>/<repo>/contributors --jq '.[0:5] | .[] | .login + " (" + (.contributions|tostring) + ")"'
gh release list --repo <owner>/<repo> --limit 5
```

Key questions: Is development active or stalled? Is it one person or a team? How often do they release?

#### 4c. Issue Responsiveness

The most important signal. Fetch recent issues and analyze patterns:

```bash
gh issue list --repo <owner>/<repo> --state all --limit 30 --json number,title,state,createdAt,comments,author
```

Evaluate:
- **Response time**: Hours? Days? Weeks? Never?
- **Response quality**: Thoughtful engagement or just label+close?
- **Trend**: Improving or declining? (compare oldest vs newest in the batch)
- **Community health**: Are users posting workarounds? Community forks? "Any updates?" comments?
- **PR merge rate**: Are external PRs being reviewed and merged?

#### 4d. Contribution Policies

Check before filing:
- **AI policy** (`AI_POLICY.md`, `AGENTS.md`, or in `CONTRIBUTING.md`). Some projects require full AI disclosure, human review of all AI-generated content, and may denounce contributors who submit AI slop. If a project bans AI-generated issues, provide findings to the user — they must write/file it themselves.
- **Issue templates** (`.github/ISSUE_TEMPLATE/`)
- **CLA requirements**
- **Preferred contact channels** — some projects prefer Discord/Slack over GitHub issues

```bash
# Check for AI policy
gh api repos/<owner>/<repo>/contents/AI_POLICY.md 2>/dev/null && echo "Has AI_POLICY.md"
gh api repos/<owner>/<repo>/contents/AGENTS.md 2>/dev/null && echo "Has AGENTS.md"
gh api repos/<owner>/<repo>/contents/CONTRIBUTING.md 2>/dev/null && echo "Has CONTRIBUTING.md"

# Check for issue templates
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE --jq '.[].name' 2>/dev/null || echo "No issue templates"
```

#### 4e. Decision Matrix

Based on the assessment:

| Signal | Action |
|--------|--------|
| Active maintainers, <1 week response | File confidently — expect engagement |
| Moderate activity, 1-4 week response | File — but apply workaround locally, don't wait |
| Low activity, >1 month response | File for the record — vendorize/fix yourself |
| Abandoned (no commits/responses in months) | Don't file — fork or find alternative |
| Active project but strict AI policy | Provide findings to user — they must write/file |
| Community forks more active than upstream | Consider filing on fork instead |

**Report assessment to user with recommendation before proceeding to file.**

### 5. If No Fix Exists — File Bug Report

**Important**: Always ask the user for permission before posting issues to external repositories.

#### 5a. Check the project's issue templates (CRITICAL)

**Every project has its own bug report format.** Using the wrong template causes friction and may get your issue closed or ignored.

```bash
# List available issue templates
gh api repos/<owner>/<repo>/contents/.github/ISSUE_TEMPLATE --jq '.[].name'

# Read the relevant template
WebFetch https://raw.githubusercontent.com/<owner>/<repo>/main/.github/ISSUE_TEMPLATE/<template-file>
```

Common patterns:
- **YAML templates** (`.yaml`/`.yml`): Structured forms with required fields. Match the field IDs exactly.
- **Markdown templates** (`.md`): Section headings to fill in. Follow the structure.
- **No templates**: Use the generic format below.
- **Multiple templates**: Pick the most specific one (e.g., `linter_bug_report.yaml` over `bug_report.md`).

**Also check for**:
- Required title prefixes (e.g., `linter: `, `bug: `)
- Required labels (you may not have permission to add them — that's OK, maintainers will triage)

#### 5b. Write the report matching their template

Adapt your content to their format. If they ask for "version", put the version where they want it. If they have a "reproduction" section, put repro steps there — not in a generic "description" blob.

**If no template exists**, use this structure:

```markdown
## Environment
- OS: <os> (<version>)
- Package: <package>@<version>

## Description
<What happens vs what should happen>

## Reproduction
<Minimal steps or code>

## Error Output
<Exact error, copy-pasted>

## Analysis
<Root cause — only if verified against source code>

## Workaround
<If you found one>

## Suggested Fix
<Optional: proposed approach with code>
```

#### 5c. Quality checklist before submitting

- [ ] AI policy checked — disclosure requirements met, human-reviewed content
- [ ] Title follows project conventions (check existing issues for style)
- [ ] Version number included
- [ ] Error output is exact copy-paste, not paraphrased
- [ ] Root cause claims are verified against actual source code
- [ ] Reproduction steps are minimal and self-contained
- [ ] Workarounds listed (helps others + shows you tried)
- [ ] Tone is respectful and factual — describe symptoms, not complaints

```bash
# Write body to temp file first (avoids heredoc backtick escaping issues)
cat > /tmp/issue-body.md << 'EOF'
<body matching their template>
EOF

gh issue create --repo <owner>/<repo> \
  --title "<prefix><concise description>" \
  --body-file /tmp/issue-body.md
```

**Note on labels**: You typically can't add labels to repos you don't own. Don't use `--add-label` — let maintainers triage.

### 6. Vendorize if Needed

If you need to fix it yourself (blocking issue, no upstream response):

```bash
git clone https://github.com/<owner>/<repo> vendor/<repo>
# Update package.json: "<package>": "file:./vendor/<package>"
# Make your fix in the vendored copy
```

### 7. Submit PR Upstream

**Important**: Always ask the user for permission before submitting PRs to external repositories.

```bash
cd vendor/<repo>
git checkout -b fix/<issue-description>
# Make changes, test
gh repo fork --clone=false
git remote add fork https://github.com/<your-user>/<repo>
git push fork fix/<issue-description>
gh pr create --repo <owner>/<repo> \
  --title "Fix: <description>" \
  --body "Fixes #<issue-number>"
```

## Examples

### oxlint stdout panic (oxc-project/oxc#20239)

1. Discovered oxlint crashes on large projects (~1300 files, ~365 warnings)
2. Read actual source (`service.rs`) via raw GitHub URL — confirmed `check_for_writer_error` handles `BrokenPipe`/`Interrupted` but not `WouldBlock`
3. Searched GitHub issues — no existing report
4. Checked issue templates — found `linter_bug_report.yaml` (initially used wrong generic template, had to edit)
5. Filed with correct format: version, command, config, what happened
6. Applied local workaround: `packages/km-infra/scripts/lint.sh` wrapper redirecting to temp file

**Lessons**:
- Always check issue templates BEFORE filing. Editing after the fact is messy.
- Use `--body-file` instead of `--body` with heredocs — heredocs can escape backticks, breaking markdown code blocks. Write the body to a temp file first.

### OpenTUI borderStyle segfault (anomalyco/opentui#543)

1. Isolated via binary search testing
2. Searched GitHub — no existing report
3. Created repro: `packages/km-tui-opentui/src/repro-crash.tsx`
4. Filed issue with reproduction
5. Applied workaround: `borderStyle="round"` → `borderStyle="single"`

### ghostty-web WASM memory corruption (coder/ghostty-web#141)

1. Discovered ghostty-web 0.4.0 crashes after freeing terminals that processed multi-codepoint grapheme clusters
2. Initial repro showed crash in test suite — initially thought it was specific ANSI sequences
3. **Bisection was key**: Tested each character type in isolated processes to find the pattern (multi-codepoint sequences corrupt WASM state on free, single-codepoint chars are fine)
4. **Project assessment** (Step 4 example):
   - **Owner**: Coder (coder.com) — VC-backed company, ghostty-web is a wrapper around ghostty-org/ghostty
   - **Activity**: Commits active through Feb 2026, but only 1 release (v0.4.0, Dec 2025), one dominant contributor (87 of ~100 commits)
   - **Responsiveness**: Fast in Dec 2025 (hours), slowed significantly by Feb 2026 (weeks-to-never for newer issues). Community forks appearing (slang25, rcarmo) with unmerged PRs
   - **AI policy**: ghostty-web has `AGENTS.md` (welcomes AI). Parent ghostty-org/ghostty has strict `AI_POLICY.md` — different policies, file on the right repo
   - **Decision**: File for the record, don't wait — workaround in place, expect slow/no response
5. Standalone 15-line repro using only `ghostty-web` npm package (no project dependencies)
6. Workaround: don't free terminals that processed grapheme clusters

**Lessons**:
- **Project assessment changes the approach**: Without assessment, you'd file and wait. With it, you know to file for the record but not block on a response.
- WASM bugs can be state-corrupting — one terminal's bug poisons ALL subsequent terminals in the process. Test each hypothesis in isolated processes (`bun run script.ts` per test) to avoid contamination.
- When a standalone repro doesn't crash but the test suite does, look for accumulated/shared state (module-level caches, WASM shared memory, singleton instances).
- Always check the project's parent/upstream — `coder/ghostty-web` wraps `ghostty-org/ghostty` which has very different contribution policies.
- npm package name may differ from GitHub repo — verify which repo to file on.

## Checklist

- [ ] Bug confirmed in upstream package (not your code)
- [ ] Source code read to verify root cause hypothesis
- [ ] Searched for existing reports
- [ ] **Project assessed** — profile, activity, responsiveness, AI policy, decision made
- [ ] Assessment reported to user with recommendation
- [ ] Checked project's issue templates and contributing guidelines
- [ ] Filed bug report matching their format (human-reviewed if AI policy requires)
- [ ] Applied workaround in your code
- [ ] (Optional) Vendorized and fixed
- [ ] (Optional) Submitted PR upstream
