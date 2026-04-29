---
id: "@km/silvercode/url-host-handlers"
aliases:
  - km-silvercode.url-host-handlers
  - km-silvercode-url-host-handlers
created_by: claude:2405c72e
created_at: 2026-04-26T01:45:39Z
closed_at: 2026-04-26T01:50:14Z
close_reason: Implemented in a38aae82d. github.com (repo, PR, issue, file),
  gist.github.com, JIRA (atlassian.net + self-hosted via /jira/ regex +
  /browse/KEY-n path), linear.app (with/without slug). Pattern-only — no HTTP
  fetching (separate bead). Generic webcard fallback for unmatched hosts.
---

# [x] Per-host autolinks handlers — pattern-only (no HTTP fetching) @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode/autolinks-config]]

Follow-up to URL-via-handlers migration (commit 33ae7d53c). Today the https handler is a generic webcard placeholder. Many useful URLs (GitHub PRs/issues, JIRA issues, Linear issues, gists) have predictable URL shapes that can be parsed into structured popovers WITHOUT any HTTP fetching.

## Scope: pattern-only, no fetching

This bead implements URL-pattern parsing only. HTTP fetching (which would need a fetch dep, response cache, auth/privacy review) is a separate v2 follow-up.

## Hosts to support

- **GitHub** (`github.com`):
  - Repo: `/<owner>/<repo>` → "GitHub repo: <owner>/<repo>"
  - PR: `/<owner>/<repo>/pull/<n>` → "GitHub PR #<n> in <owner>/<repo>"
  - Issue: `/<owner>/<repo>/issues/<n>` → "GitHub issue #<n> in <owner>/<repo>"
  - File: `/<owner>/<repo>/blob/<branch>/<path>` → "GitHub file: <path>@<branch> in <owner>/<repo>"
  - Discussion / wiki / actions / etc — out of scope v1
- **GitHub Gists** (`gist.github.com`):
  - Gist: `/<user>/<id>` → "GitHub Gist by <user>"
- **JIRA** (any host matching `/jira/` or `atlassian.net`):
  - Issue: `/browse/<KEY>-<n>` → "JIRA <KEY>-<n>"
- **Linear** (`linear.app`):
  - Issue: `/<workspace>/issue/<id>/<slug>` → "Linear <id> — <slug>"

## Handler shape

Extend `apps/silvercode/src/autolinks/handlers/https.ts` to dispatch by host:

```ts
const hostHandlers: Record<string, (url: URL) => PreviewResult> = {
  'github.com': renderGithub,
  'gist.github.com': renderGithubGist,
  'linear.app': renderLinear,
  // JIRA matches by hostname pattern, not exact match — handled separately
}
```

JIRA needs a regex-based hostname matcher (`/jira/i`, `/atlassian\.net$/`, etc.) since JIRA can be self-hosted on any domain. Generic JIRA matcher: if path matches `/browse/[A-Z]+-\d+`.

## Acceptance

- [ ] Per-host handlers for GitHub repo/PR/issue/file/gist
- [ ] Linear issue parser
- [ ] JIRA generic parser (hostname regex + path pattern)
- [ ] Each renders a structured Box with title (bold), kind label, and the parsed URL parts
- [ ] Falls back to existing webcard placeholder for unmatched hosts
- [ ] Tests for each handler with at least 3 URL variants per host
- [ ] No HTTP fetching anywhere
- [ ] Existing plain-URL test still passes (generic webcard for unknown hosts)

## What this is NOT

- HTTP fetching of issue/PR titles/bodies (separate bead — needs auth, privacy, cache)
- Markdown rendering of fetched content (depends on fetching)
- Per-host action handlers (open in browser, copy link) — those are click-side, separate

## Future

Once HTTP fetching lands (separate bead), each host's pattern parser can call the API to enrich the popover with title/description.

## References

- URL migration: 33ae7d53c
- Generic https handler: `apps/silvercode/src/autolinks/handlers/https.ts`
- Pattern reference: VS Code "GitHub Pull Requests" extension is the de-facto reference for URL parsing logic