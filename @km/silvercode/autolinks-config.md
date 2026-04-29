---
id: "@km/silvercode/autolinks-config"
aliases:
  - km-silvercode.autolinks-config
  - km-silvercode-autolinks-config
created_by: claude:2405c72e
created_at: 2026-04-25T07:24:20Z
closed_at: 2026-04-25T10:13:28Z
close_reason: "Shipped: km main 8e92ba275. TOML config at
  <cwd>/.silvercode/links.toml + literal/regex pattern matcher + 3 preview kinds
  (readme, first-paragraph, bd-active) + DetectionText integration via
  AutolinksContext. 42/42 tests pass (29 unit, 3 visual via renderScenario).
  Follow-ups (P3) parented to this bead: autolinks-cascade,
  autolinks-preview-extensions (shell+mcp kinds), autolinks-mcp-resolver,
  autolinks-cache-invalidation. GOTCHA: built-in tilde-path file detection
  shadows ~repo-style patterns — documented in tests; +km/AGENTS.md/ref/foo work
  cleanly. UX hover popover not visually verified (createRenderer doesn't drive
  mouse dwell) — needs live bun km pass to close that loop."
started_at: 2026-04-25T09:59:48Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.autolinks-config
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T00:24:20Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Configurable autolinks: resolve + popover preview for ~repo, +km, AGENTS.md, ref/ etc. @km/silvercode #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

## Goal

silvercode currently detects a fixed set of patterns (URLs, file paths, bead IDs) in assistant text and renders them as clickable popovers. Make this configurable per-vault / per-workspace so users can register their own link shortcuts:

- \`~repo\` → resolve to a git repo path on disk, popover shows README + recent commits
- \`+km\` → resolve to a workspace, popover shows project description + active beads
- \`AGENTS.md\` → resolve to a known doc, popover shows ToC + first paragraph
- \`ref/<name>\` → resolve to a referenced doc, popover shows the resolved file
- ... and any user-defined pattern

## Why

User text contains lots of inline references to "things they care about": projects, vaults, docs, repos. Today silvercode hard-codes which patterns it recognises (in \`apps/silvercode/src/components/DetectionText.tsx\` via \`detectReferences\`). Anything not in the built-in set is plain text.

A configurable autolinks system would let the user (or a per-project config) declare:

\`\`\`toml
# silvercode.config.toml or .silvercode/links.toml
[[autolinks]]
pattern = "~repo"
resolves_to = "github.com/beorn/km"
preview = "readme"

[[autolinks]]
pattern = "AGENTS\\.md"
resolves_to = "/Users/beorn/AGENTS.md"
preview = "first-paragraph"

[[autolinks]]
pattern = "\\+km"
resolves_to = "/Users/beorn/Code/pim/km"
preview = "bd-active"
\`\`\`

Detection runs the user's patterns alongside the built-ins. Popovers render based on the \`preview\` kind.

## What to build

1. **Config schema** — TOML or JSON config at \`<vault>/.silvercode/links.toml\` or workspace-level \`silvercode.config.toml\`. Pattern + resolves_to + preview kind.
2. **Pattern detector** — extend \`detectReferences\` in \`apps/silvercode/src/components/DetectionText.tsx\` to load user patterns at startup and match them.
3. **Preview renderers** — pluggable: \`readme\` (file), \`first-paragraph\` (file head), \`bd-active\` (bd list output), \`shell\` (custom command), \`mcp\` (call an MCP tool with the resolved value).
4. **Caching** — preview content is cached per-resolved-target with a TTL; popover hover triggers re-fetch on miss.
5. **UI** — popover tooltip pane already exists for built-in detections; reuse for autolinks.
6. **Tests** — visual regression: paste a paragraph with \`~repo\` and an autolinks config, assert hover shows the expected preview.

## References

- \`apps/silvercode/src/components/DetectionText.tsx\` — existing detection + popover rendering
- \`apps/silvercode/src/components/SidePanel.tsx\` (PopoverProvider) — popover machinery
- \`apps/silvercode/src/components/MarkdownView.tsx\` — invokes DetectionText
- Built-in detections to model after: URL, file path, bead ID

## Open questions

- Config format: TOML (matches existing silvercode config) or JSON?
- Pattern syntax: regex (powerful but harder to author) or simpler glob/literal?
- Per-vault vs workspace vs both? Likely both (cascade).
- Preview kinds extensible: how to register new ones from MCP / plugins?
- Lifecycle: are autolinks evaluated at every render, or memoized per session boot?

## Acceptance

- [ ] Config loaded at silvercode startup; merge cascade (workspace ⊕ vault) documented
- [ ] At least 3 preview kinds shipped (\`readme\`, \`first-paragraph\`, \`bd-active\`)
- [ ] Built-in detections still work alongside user patterns
- [ ] Visual regression test driving a paste with autolinks config
- [ ] Doc at \`apps/silvercode/docs/autolinks.md\` covering config schema + examples