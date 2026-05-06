---
mentions:
  - km
  - claude
id: "@km/silvercode/doctor"
aliases:
  - km-silvercode.doctor
  - km-silvercode-doctor
created_by: claude:2405c72e
created_at: 2026-04-25T16:16:28Z
closed_at: 2026-04-25T16:46:43Z
close_reason: Implemented `silvercode doctor` + `silvercode doctor autolinks`
  CLI subcommands. Sectioned ANSI output with severity icons (✓/⚠/✗); exit code
  reflects worst severity (0/1/2). Surfaces config presence + parse status,
  per-rule drop reasons, cascade introspection (WORKSPACE / VAULT / WS→VAULT
  override), dead resolves_to paths, shell.exec PATH check, fs.watch handle
  count, and mcp stub list. Added `parseSyntaxlinksYamlWithDiagnostics` peer of
  the production parser (non-invasive). 16 new tests passing; tsc 184 errors
  (within baseline). Slash-command path (/doctor in TUI) deferred — engine
  returns structured DoctorReport so future TUI integration can render without
  re-running checks. Commit d9ab32db0.
started_at: 2026-04-25T16:36:31Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.doctor
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T09:16:32Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] silvercode doctor: introspect autolinks config, environment, integrations @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode]]

Add a `silvercode doctor` (or `km doctor`?) command that surfaces config + integration health in one place. Modeled on `bd doctor`, `gh extension doctor`, `npm doctor`.

## Why

Today a user with a misconfigured `.km/config.yaml` autolinks rule sees nothing — malformed rules drop silently to a debug log nobody reads. Cascade introspection (which workspace rule got overridden by which vault rule) is invisible. Watcher leaks, stale TTL, dead resolves_to paths — all silent.

A doctor command surfaces these in one place.

## Initial scope: autolinks-focused

### Config issues

- Malformed YAML in `.km/config.yaml` (with line + reason)
- Missing fields per rule
- Invalid regex
- Unknown preview kinds
- Dropped rules with reasons

### Path issues

- `resolves_to` path doesn't exist (for file-backed previews)
- Git submodule not checked out
- Dead symlinks

### Cascade introspection

- Which workspace rules got overridden by which vault rules (printed as a tree)
- Which vault rules append (no workspace shadow)
- Tip: run `silvercode doctor cascade --explain <pattern>` to trace one rule

### Shell rules

- Warn on `command` strings that look risky (multi-statement, redirects, network ops)
- Lint suggested by argv form (post `km-silvercode.shell-preview-argv-security`)

### Watcher health

- Count of active fs.watch handles
- Recent eviction count (latent leak detector)
- Realpath dedup status (post-watcher-dedup landing)

### MCP rules

- List `mcp` rules currently stubbed-but-not-implemented (until resolver lands)

### Coverage (opt-in)

- Scan recent message history for matched-but-failed previews (resolved_to unreadable, command timed out, etc.)

### Unused rules (opt-in)

- Rules that haven't matched in the current session — stale config detector

## Future scope (cross-cutting checkers)

Beyond autolinks, doctor is the natural home for:

- claude CLI version + auth state (per account)
- agent-harness MCP server probes
- accountly auth state
- ripgrep / git / bd availability
- panel/pane state file readability
- silvery diagnostics (`SILVERY_STRICT` recommendations)
- tribe daemon health

## Output format

Sectioned ANSI-colored report (match `bd doctor`):

- ✓ green for healthy
- ⚠ yellow for warnings (config issues, dead paths)
- ✗ red for errors (malformed config, missing dependencies)

Exit code reflects severity:

- 0 — all healthy
- 1 — warnings present
- 2 — errors present

## Industry analogues

- `bd doctor` — beads health check (this codebase already)
- `gh extension doctor` — GitHub CLI extension diagnostics
- `npm doctor` — npm environment + cache + permissions
- `bun doctor` — Bun env diagnostics
- `docker info` / `docker system df` — daemon state
- WordPress "Site Health" plugin
- Atlassian "Application Links" admin health page

## Acceptance

- [ ] `silvercode doctor` command exists and runs without args (full report)
- [ ] `silvercode doctor autolinks` runs only autolinks checkers
- [ ] All autolinks initial-scope checkers implemented
- [ ] Sectioned ANSI output with ✓/⚠/✗
- [ ] Exit code reflects severity
- [ ] Tests covering each checker (config error, dead path, cascade explanation)
- [ ] Mention in user-facing docs
- [ ] Future cross-cutting checkers tracked as separate sub-beads

## References

- Parent: `km-silvercode.autolinks-config` (initial scope)
- Discussed in session 2026-04-25 alongside autolinks v2 work
- Related: `km-silvercode.autolinks-uri-pivot` (handler registry will be a future doctor checker)

