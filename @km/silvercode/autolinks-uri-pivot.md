---
mentions:
  - km
  - claude
id: "@km/silvercode/autolinks-uri-pivot"
aliases:
  - km-silvercode.autolinks-uri-pivot
  - km-silvercode-autolinks-uri-pivot
created_by: claude:2405c72e
created_at: 2026-04-25T15:38:07Z
closed_at: 2026-04-25T22:56:48Z
close_reason: Implemented internal URI dispatch in d30140205. URI parsing of
  resolves_to (file/bd/https/shell/mcp scheme inference); handler registry
  (apps/silvercode/src/autolinks/handlers/) replaces switch in resolvePreview;
  plain URLs in messages flow through pipeline as virtual autolink detections;
  doctor introspects registered schemes + per-rule bindings. v1 user-facing
  schema unchanged (78+39 = 134 tests pass, baseline tsc 184 errors preserved).
  v2 [[handlers]] config block deferred.
started_at: 2026-04-25T22:36:31Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.autolinks-uri-pivot
    depends_on_id: km-silvercode.autolinks-config
    type: parent-child
    created_at: 2026-04-25T08:38:11Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.autolinks-config
---

# [x] Autolinks: URI-scheme pivot — pattern→URI linkifier + URI→preview handler dispatch @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode/autolinks-config]]

Two-stage architecture pivot for the autolinks system:

## Current shape (one-stage)

```yaml
autolinks:
  - pattern: "~repo"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: readme
```

Each rule combines (a) pattern → resolved-value with (b) how to preview the resolved-value. The link between resolves_to and preview kind is an implicit contract (e.g. `preview = readme` assumes resolves_to is a filesystem path).

## Proposed shape (two-stage)

Stage 1 — linkifier (text → URI):

```yaml
autolinks:
  - pattern: "~repo"
    resolves_to: "file:///Users/beorn/Code/pim/km"
  - pattern: "+km"
    resolves_to: "bd:///parents/km/active"
  - pattern: /JIRA-(\\d+)/
    resolves_to: "https://jira.example.com/browse/\${1}"
```

Stage 2 — handlers (URI → preview + action), keyed by URI scheme/host:

```yaml
handlers:
  - scheme: file
    preview: readme
    on_click: open-in-editor
  - scheme: bd
    preview: bd-active
    on_click: open-bead
  - scheme: https
    host: jira.example.com
    preview: jira-card
  - scheme: mcp
    preview: mcp
```

## Why

- **Composition that's free today is awkward:** plain URLs in messages don't get linkified. After this, ANY URL (typed by user, pasted by claude, returned by an MCP tool) flows through the handler pipeline.
- **MCP integration becomes a handler, not a preview kind:** `scheme: mcp` — the resolver bead's job. `scheme: https` with specific hosts — jira/linear/github cards.
- **OS pattern alignment:** macOS Launch Services, xdg-open, Android intent filters, browser scheme handlers — every system that's faced this lands on URL-scheme dispatch.
- **doctor surface:** registered handlers, scheme coverage, URIs without handlers — natural introspection.
- **Industry prior art:** GitHub repo autolinks (one-stage, simpler), JetBrains Issue Navigation (regex→URL), Obsidian wiki-links + URLs (semantic + URI), VS Code DocumentLinkProvider + UriHandler (two-stage), macOS NSDataDetector.

## Plan (incremental, no breaking change)

1. **Internal factor (no schema change):**
- Each rule's `resolves_to` parsed as URI. Infer scheme from value shape (path → `file:`, bead-id → `bd:`, URL → as-is) when not explicit.
- Handler registry keyed by scheme. `resolvePreview(rule, match)` becomes `resolveURI(rule.toURI(match))`. Dispatch by scheme.
- Hardcode v2 handlers: file, bd, https, shell, mcp. No `[[handlers]]` config block yet.
6. **Win immediately:** plain URLs in messages get linkified through the same pipeline (`https://github.com/foo/bar/pull/123` → webcard preview without any rule).
7. **Defer schema change:** `[[handlers]]` block stays unimplemented until first user wants to override defaults. Additive on top of the registry when added.
8. **doctor checker:** list registered handlers, scheme coverage of all rules, fallback-to-text URIs, dead handlers (registered but no rules use them).

## Supersession

This supersedes `km-silvercode.autolinks-mcp-resolver` (`mcp:` becomes a handler scheme, not a preview kind). The shell preview kind from `km-silvercode.autolinks-preview-extensions` becomes a `shell:` scheme handler — same logic, different seam.

## Format

Per user pref: schema in YAML (`.silvercode/links.yaml` once we migrate from TOML).

## Acceptance

- [ ] All current preview kinds (readme, first-paragraph, bd-active, shell, mcp) accessible via URI dispatch
- [ ] Plain URLs in messages get linkified through the same pipeline
- [ ] `silvercode doctor` lists registered handlers + coverage
- [ ] No breaking change to existing config; `resolves_to` accepts both URIs and shorthand values
- [ ] Documented in `vendor/silvery/docs/guide/` once silvery exposes the handler-registry primitive
- [ ] Supersedes mcp-resolver bead (close after this lands)

## References

- `apps/silvercode/src/autolinks/config.ts`, `previews.ts`, `match.ts`
- VS Code DocumentLinkProvider + UriHandler API
- Obsidian's wiki-link + URL handling
- macOS NSDataDetector for the rich-card UX bar

