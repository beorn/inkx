---
mentions:
  - km
projects:
  - click
id: "@km/silvercode/claude-code-transcript-parity/osc8-hyperlinks"
aliases:
  - "@km/silvercode/osc8-hyperlinks"
  - km-silvercode.osc8-hyperlinks
  - km-silvercode-osc8-hyperlinks
created_by: claude:2405c72e
created_at: 2026-04-28T19:36:00Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.osc8-hyperlinks
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:35:59Z
    created_by: claude:2405c72e
    metadata: "{}"
props: {}
propsRaw: {}
---

# [ ] OSC 8 hyperlinks for file paths in chat — Cmd+click opens in editor @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

WHAT'S ALREADY THERE (audit before coding):

- silvery exports <Link href onClick> at vendor/silvery/packages/ag-react/src/components/Link.tsx — emits OSC 8 + handles click/hover/modifier-key armed states
- silvercode's MarkdownView wraps markdown links via <Link> (apps/silvercode/src/components/MarkdownView.tsx:57)
- silvercode's LinkifiedText auto-detects URLs/paths in prose and wraps them via <Link> (apps/silvercode/src/components/LinkifiedText.tsx:277)
- silvercode's formatPathForDisplay (apps/silvercode/src/utils/format-path.ts, commit e044b2662) shortens absolute paths to ~vault/, ~km/, ~/...
- silvery emits a 'link:open' event consumed by @km/tui for internal navigation (vendor/silvery/packages/ag-react/src/context.ts:205)

WHAT'S MISSING (the actual scope of this bead):
ToolCall.tsx renders path tokens via plain Text (lines ~219, 248-250) — they're tilde-shortened for display but NOT wrapped in <Link>. So Cmd+click on a path INSIDE a tool-call title or location list does nothing.

Fix: in ToolCall.tsx, wherever a path token is rendered (renderLocations + the title path-shortening path), wrap it in silvery's existing <Link href={file://...}>. Use formatPathForDisplay() for the visible label, the absolute path for href.

DO NOT build a new osc8 emitter, a new Link component, a new url-detector, or a new modifier-key tracker. Use what silvery + silvercode already ship.

Files: apps/silvercode/src/components/ToolCall.tsx (only).

Acceptance:

- ToolCall renderLocations wraps each path in <Link href={'file://' + loc.path}>
- shortenTitlePath substitution wraps the matched path span in <Link>
- LinkifiedText untouched (already correct)
- termless test: cell at path span has hyperlink URL set (frame.cell.hyperlink === 'file:///Users/...')
- bun fix clean, tsc not regressed

