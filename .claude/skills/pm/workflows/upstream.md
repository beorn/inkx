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
# Also try WebSearch for broader coverage
```

Check: open issues, recent releases/changelogs, discussions.

### 4. If No Fix Exists — File Bug Report

**Important**: Always ask the user for permission before posting issues to external repositories.

#### 4a. Check the project's issue templates (CRITICAL)

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
- Contributing guidelines (`CONTRIBUTING.md`)

#### 4b. Write the report matching their template

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

#### 4c. Quality checklist before submitting

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

### 5. Vendorize if Needed

If you need to fix it yourself (blocking issue, no upstream response):

```bash
git clone https://github.com/<owner>/<repo> vendor/<repo>
# Update package.json: "<package>": "file:./vendor/<package>"
# Make your fix in the vendored copy
```

### 6. Submit PR Upstream

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
6. Applied local workaround: `infra/lint.sh` wrapper redirecting to temp file

**Lessons**:
- Always check issue templates BEFORE filing. Editing after the fact is messy.
- Use `--body-file` instead of `--body` with heredocs — heredocs can escape backticks, breaking markdown code blocks. Write the body to a temp file first.

### OpenTUI borderStyle segfault (anomalyco/opentui#543)

1. Isolated via binary search testing
2. Searched GitHub — no existing report
3. Created repro: `packages/km-tui-opentui/src/repro-crash.tsx`
4. Filed issue with reproduction
5. Applied workaround: `borderStyle="round"` → `borderStyle="single"`

## Checklist

- [ ] Bug confirmed in upstream package (not your code)
- [ ] Source code read to verify root cause hypothesis
- [ ] Searched for existing reports
- [ ] Checked project's issue templates and contributing guidelines
- [ ] Filed bug report matching their format
- [ ] Applied workaround in your code
- [ ] (Optional) Vendorized and fixed
- [ ] (Optional) Submitted PR upstream
