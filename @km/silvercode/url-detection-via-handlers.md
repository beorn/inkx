---
mentions:
  - km
  - claude
id: "@km/silvercode/url-detection-via-handlers"
aliases:
  - km-silvercode.url-detection-via-handlers
  - km-silvercode-url-detection-via-handlers
created_by: claude:2405c72e
created_at: 2026-04-25T23:50:41Z
closed_at: 2026-04-25T23:58:38Z
close_reason: "Implemented in 33ae7d53c. Removed kind: 'url' builtin from
  detection.ts (URL_RE replaced with URL_EXCLUDE_RE that only masks ranges so
  file detector skips inside-URL paths). Plain URLs now flow through virtual
  autolink-detection (autolinks/match.ts:virtualUrlDetections) → handler
  registry (https handler) → DetectionText autolink renderer. DetectionKind no
  longer includes 'url'. Bead/file/code-ref/km-node builtins unchanged. Updated
  3 existing tests (detection.test.ts, autolinks/match.test.ts,
  autolinks/handlers/plain-url.test.ts) and added 1 visual regression test
  (visual/url-via-handlers.test.tsx) that distinguishes new renderer from legacy
  by asserting kind=autolink + virtual=1 + absence of payload.url. 142
  autolinks/doctor/detection tests pass; tsc errors unchanged at 184."
started_at: 2026-04-25T23:51:42Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.url-detection-via-handlers
    depends_on_id: km-silvercode.autolinks-config
    type: parent-child
    created_at: 2026-04-25T16:50:58Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.autolinks-config
---

# [x] Migrate URL detection to flow through autolinks handler registry @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode/autolinks-config]]

Follow-up identified by the autolinks-uri-pivot agent (commit d30140205). Today `apps/silvercode/src/detection.ts` has a builtin `kind: "url"` detection that takes priority over the new virtual autolink-detections in `mergeDetections`. So plain URLs in messages still go through the legacy URL popover renderer instead of the new handler registry.

## Why migrate

The URI pivot wired up plain URLs to flow through the handler registry (https handler, mcp handler, etc.) but the migration is gated by which renderer wins. Today the builtin URL detection wins, so the registry is bypassed for plain URLs in messages.

After this migration:

- Plain URLs hit the same handler pipeline as configured rules
- Per-host handlers become viable (jira-card for jira.example.com, github-card for github.com URLs, etc.)
- One renderer surface to maintain instead of two

## What to change

Two options:

### Option A: drop `kind: "url"` from builtins

Remove the URL detection from `detectReferences` in `detection.ts`. The autolinks virtual-detection path (already in `match.ts:virtualUrlDetections`) takes over.

Pros: cleanest. Cons: any code that branched on `kind === "url"` needs to look at `kind === "autolink"` with a `payload.virtual === "1"` flag instead.

### Option B: invert priority in `mergeDetections`

Keep builtins, but make autolink-virtual win over builtin-url specifically.

Pros: less churn. Cons: weird precedence rules, builtin URL renderer stays maintained.

Recommend Option A.

## Acceptance

- [ ] Plain `https://github.com/foo/bar` in a message renders through https handler (webcard placeholder, not legacy URL popover)
- [ ] No regression in bead/file/code-ref/@km/node detections (those are unrelated)
- [ ] Existing visual tests for URL popovers updated to expect the new renderer (or kept if the new renderer is a superset)
- [ ] `apps/silvercode/tests/visual/autolinks*` and `tests/autolinks/handlers/plain-url.test.ts` pass without the today-pinned limitation comment

## References

- URI pivot commit: d30140205
- Plain URL pipeline test: `apps/silvercode/tests/autolinks/handlers/plain-url.test.ts` (currently documents the limitation)
- Detection module: `apps/silvercode/src/detection.ts:56` (URL_RE)
- Merge logic: `apps/silvercode/src/autolinks/match.ts:mergeDetections`

