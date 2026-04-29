---
id: "@km/silvercode/wrap-unbreakable-audit"
aliases:
  - km-silvercode.wrap-unbreakable-audit
  - km-silvercode-wrap-unbreakable-audit
created_by: claude:cc081a9a
created_at: 2026-04-28T18:12:07Z
closed_at: 2026-04-28T19:20:21Z
close_reason: >-
  Audited all 12 <Text wrap="wrap"> sites in apps/silvercode/src/components/.
  Verdict: NOT REPRODUCIBLE — silvery's CSS-correct flex defaults (flexShrink:1
  + CSS §4.5 auto min-size with recursive intrinsic min-content) handle
  long-unbreakable tokens through wrap chains automatically. The historical
  Yoga-defaults hazard (long URL forces parent to expand past container) does
  not surface under silvery's current preset.


  Audit findings per site:

  - LinkifiedText.tsx:242,292 — wrap chain via <Prose>; CSS default sufficient

  - MarkdownView.tsx:29 — direct Text wrap; CSS default sufficient

  - ToolCall.tsx:92,104,111,305 — Text wrap inside columns; no flexShrink:0
  ancestors on chain

  - ToolCallError.tsx:72 — Text wrap inside Box; CSS default sufficient

  - AmbientEventRow.tsx:208,271 — Text wrap; CSS default sufficient

  - SessionUpdateList.tsx:263 — explicit flexShrink:1 minWidth:0
  (defense-in-depth, redundant under CSS but correct)

  - SidePanel.tsx:187,758,810 — explicit flexGrow:1 minWidth:0 escape hatch on
  the wrappable column; flexShrink:0 only on the fixed-width 2-col icon sibling
  (correct usage)

  - SyntaxHighlighter.tsx:96 — Text wrap; CSS default sufficient


  Regression test added:
  apps/silvercode/tests/wrap-unbreakable-overflow.test.tsx (6 tests, all green)
  covers:

  1. LinkifiedText with 200-char URL inside production-shape Shell
  (overflow:hidden chain)

  2. LinkifiedText with long path inside Prose

  3. MarkdownView with 200-char URL

  4. Plain <Text wrap="wrap"> inside Prose

  5. CONTRACT: plain Text wrap=wrap inside MinimalShell (no overflow:hidden, no
  explicit minWidth=0) — pinning the contract that CSS defaults alone are
  sufficient

  6. CONTRACT: LinkifiedText inside MinimalShell — same, locked into chat
  surface


  The contract tests are the load-bearing assertion: if silvery ever flips back
  to Yoga-style defaults, these tests will fail loudly rather than silently
  regressing chat content rendering.


  NOT a follow-up bead: separate-and-distinct concern is non-wrappable Text
  (wrap=truncate|clip|false) where min-content==max-content==naturalWidth — that
  case still needs explicit minWidth=0 per silvery's escape-hatch contract. Not
  in scope here.
started_at: 2026-04-28T19:12:36Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.wrap-unbreakable-audit
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T11:12:13Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Audit silvercode <Text wrap="wrap"> sites for long-unbreakable-token overflow @km/silvercode #task #P3 @claude:cc081a9a

blocks:: [[@km/silvercode]]

Per /pro review (2026-04-28, see @km/silvercode/pane-2d-horizontal-divider context), silvercode has ~12 <Text wrap="wrap"> sites that could overflow their parent flex containers when rendering long unbreakable tokens (URLs, SHAs, file paths, base64, error blobs). The PaneDivider fix only canonicalized the divider case.

Suspect surfaces (rg -n 'wrap=' apps/silvercode/src/components/):
- LinkifiedText.tsx:242,292 — chat user/agent messages (long URLs likely)
- MarkdownView.tsx:29 — markdown text (URLs, paths)
- ToolCallError.tsx:72 — error messages (stack frames, paths)
- ToolCall.tsx:92 — tool args/output rendering
- AmbientEventRow.tsx:208,271 — event bodies
- SidePanel.tsx:177,748,800 — info display
- SessionUpdateList.tsx:263 — session update text
- SyntaxHighlighter.tsx:96 — code blocks (long tokens)

Pattern (Gemini 3 Pro): "a single long URL spat out by the Claude agent could force a pane to expand, blowing out the binary-split pane grid."

/complete:
- Audit each site for parent container shape (does it have overflow="hidden", minWidth=0 on the inner Box, or a width pin?)
- For each unguarded site, write a regression test that feeds a 200-char unbreakable token (e.g. https://example.com/path-with-no-break-opportunities-x-x-x-x-x-x-x-x) and asserts it doesn't overflow
- Apply the canonical escape hatch (inner Box minWidth=0 minHeight=0 + Text minWidth=0)
- Or extract a <DividerFiller>-style primitive in silvery (Kimi K2.6 recommendation) that bakes the escape in

References:
- vendor/silvery/tests/features/divider-overflow-clear.test.tsx — canonical regression pattern
- /pro review at /var/folders/x6/.../llm-cc081a9a-review-the-recent-changes-qfrb.txt ($2.22, 4-leg, 2026-04-28)
- vendor/silvery/CLAUDE.md — "Containers narrower than the longest unbreakable word" rule