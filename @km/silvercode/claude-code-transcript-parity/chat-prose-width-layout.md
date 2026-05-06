---
id: "@km/silvercode/claude-code-transcript-parity/chat-prose-width-layout"
aliases:
  - "@km/silvercode/chat-prose-width-layout"
  - km-silvercode.chat-prose-width-layout
  - km-silvercode-chat-prose-width-layout
created_at: 2026-04-30T20:02:39.035Z
type: feature
priority: P0
closeReason: "Completed: transcript rows now express readable/prose/wide/full
  intent through Content.* and Chat.* primitives; prose markdown, code blocks,
  blockquotes, prompt bubbles, metadata dividers, and activity rows are covered
  by the current layout tests. Verification: Silvercode transcript/layout slice
  passed 12 files, 187 tests; f33ab87c5 fixes the final divider gutter case
  discovered during closure."
---

# [x] Constrain prose width while preserving wide tool output

## Problem

The central chat panel currently treats prose, tool output, tables, diffs, and command output as if they should all use the same available width. That makes assistant/user prose hard to read on wide terminals because line length grows too long, while tool output and tabular data still need the full canvas.

This is the same general pattern used by document editors:

- Typography calls the readable prose width the text "measure" or line length.
- WordPress/Gutenberg exposes block-level width/alignment states such as default, wide, and full width (`alignwide` / `alignfull`).
- Notion exposes a page-level "Full width" setting, and keeps the default page width narrower for document reading.

Silvercode should use the document-editor model at the block level: readable prose by default, wide/full-width blocks for structured output.

## Recommendation

Use a two-lane chat layout rather than one max-width for the whole session.

This should be designed as a typography/layout feature first, not as a one-off chat hack. Silvery already has `<Prose>` as a typography-intent wrapper and typography presets such as `<P>`, `<Muted>`, `<Code>`, and headings. The missing piece is a clear "measure-limited prose" convention or primitive.

The user-message "yellow or red" investigation exposed a deeper requirement: rich text layout must measure the same structure it renders. Do not solve this with chat-local bubble heuristics, a second ad hoc `prettyWrap` mode, or by asking `snug-content` to infer a rendered Markdown tree from flattened text.

Ideal Silvery direction:

- Treat rich text as a structured layout input: paragraphs, headings, list markers, hanging indents, inline spans, code blocks, tables, and asides are layout facts, not post-render decorations.
- Pretext should operate on prepared text runs and block metadata, with line-breaking decisions made from the real available inline width after markers, padding, borders, and hanging indents.
- Shrinkwrap should be block-aware: the measured width of a rich text box is the maximum rendered visual line width for the same block tree, not the width of a flattened source string.
- Markdown user prompts should preserve author intent, but the renderer must distinguish prose paragraphs from lists. A leading `-` in a prompt is a list marker and therefore consumes marker/hanging-indent width; if the product wants "plain prompt text with markdown inline emphasis", that is a separate rendering policy, not a text-wrap algorithm tweak.
- `wrap="even"` should remain a line-breaking algorithm over a known text run. If Silvery adds prettier paragraph composition later, it should be a principled algorithm with explicit tests and metrics, not a one-off final-line orphan patch.
- `snug-content` for rich text needs a first-class measurement path that uses the same block layout pipeline as paint. If that is too expensive for every frame, cache by text tree identity, width constraints, theme/font width table, and block layout options.

Acceptance for the rich-text part:

- A Markdown list in a user bubble measures with its marker and hanging indent included.
- A plain paragraph with inline spans measures and paints from one continuous text run; links/bold/code do not split wrapping.
- A rich text bubble with `width="snug-content"` shrinks to the rendered line widths without adding avoidable extra lines.
- A regression fixture for the screenshot prompt records whether it is intended to render as a Markdown list or as plain prose; the expected wrapping follows that explicit policy.
- No exported API references a missing wrap algorithm; deleting or renaming a wrap mode fails in typecheck/tests before runtime.

Recommended split:

- Silvery owns the generic concept: prose measure, wide/full block alignment, and the primitive names.
- Silvercode owns the content policy: which normalized chat entries are prose-width versus wide-width.

Do not bury this in Codex/Claude renderer branches.

Prose lane:

- User messages, assistant markdown paragraphs, normal thinking deltas, and short summaries render in a readable column.
- Target a maximum measure around 78-88 terminal columns.
- On narrow panes, the prose lane collapses to the available width with no clipping.
- The prose lane should be aligned consistently with the chat content, not centered so far that it visually disconnects from adjacent wide output.

Wide lane:

- Tool calls, command output, code blocks, diffs, tables, permission prompts, and expanded activity details can use the full central panel width.
- Wide blocks must not inherit the prose max width.
- Wide content should use existing scroll/bounds behavior where needed rather than forcing the whole chat to become unreadably wide.

Activity summary:

- The summary sentence can use the prose lane.
- The current/featured tool row and any expanded output should use the wide lane.
- Thinking deltas below the summary remain prose-width unless they contain structured output.

## Implementation Notes

Introduce shared layout primitives in the normalized chat UI layer, not in the Claude/Codex adapters:

- `ChatProseBlock` / `ReadableBlock`: applies the readable max measure, ideally backed by a silvery typography primitive if one exists.
- `ChatWideBlock`: uses full available panel width.
- A small content-kind decision point in `SessionUpdateList` or nearby row components chooses the block frame.

If silvery grows the primitive, possible API shapes:

- Extend `<Prose>` with a `measure` / `maxMeasure` prop, e.g. `<Prose measure={88}>`.
- Add a named wrapper such as `<Readable>` / `<Measure>` for max-line-length layout.
- Add block alignment primitives that mirror editor terms: default/readable, wide, full.

Silvercode can start with local `ChatProseBlock` / `ChatWideBlock` wrappers and migrate them onto silvery once the generic API is settled.

Potential silvery component family:

- `<Content.Layout measure={88} wide="100%">`: parent that provides layout context and default widths.
- `<Content.Row>`: full-width row for prose plus anchored asides.
- `<Content.Prose>` / `<Content.Measure>`: readable lane placement.
- `<Content.Wide>` / `<Content.Full>`: wide/full block wrappers.
- `<Content.Aside>`: anchored side metadata/actions.
- `<MarkdownProse components={...}>`: block-aware markdown renderer that maps paragraphs/headings/lists to content width and tables/code/pre/diffs to wide width.

Example:

```tsx
<Content.Layout measure={88} wide="100%">
  <Content.Prose>
    <Prose>Normal assistant prose wraps at a readable measure.</Prose>
  </Content.Prose>
  <Content.Wide>
    <ToolCallOutput />
  </Content.Wide>
  <MarkdownProse source={message} />
</Content.Layout>
```

The parent matters because it gives the whole surface one shared definition of "content" and "wide" instead of scattering magic numbers through row components. This mirrors WordPress's `contentSize` / `wideSize` model while staying natural for React component composition.

Responsive model:

Use silvery's existing responsive system instead of adding a parallel one. `useResponsiveValue` already defines mobile-first terminal-column breakpoints:

- `xs`: 30 columns.
- `sm`: 60 columns.
- `md`: 90 columns.
- `lg`: 120 columns.
- `xl`: 150 columns.

The content layout API should accept the same responsive value shape:

```tsx
<Content.Layout
  measure={{ base: "100%", md: 72, lg: 88, xl: 96 }}
  wide={{ base: "100%", lg: "100%" }}
  align={{ base: "stretch", md: "start" }}
>
  <Content.Prose>
    <Prose>Readable content</Prose>
  </Content.Prose>
  <Content.Wide>
    <ToolCallOutput />
  </Content.Wide>
</Content.Layout>
```

`Content.Layout` needs container-scoped responsive resolution from its own measured parent box (`useBoxRect()`), so split panes behave correctly. A half-width pane in a 220-column terminal should use its own measured width, not global `xl`. App chrome still needs viewport-scoped responsive resolution from the terminal/window size.

Use two equal, explicit hooks:

```ts
const contentSize = useResponsiveContent({ default: "100%", md: 76, lg: 88 })
const sidePanelMode = useResponsiveViewport({ default: "hidden", md: "compact", lg: "full" })
```

Recommended responsive API:

- `resolveResponsiveValue(values, width, options?)`: pure helper.
- `useResponsiveContent(values, options?)`: resolves against the nearest `Content.Layout` content width; falls back to viewport width only when no content provider exists.
- `useResponsiveViewport(values, options?)`: resolves against the terminal/window viewport width.

Do not add stringly target options like `target: "container"`. Do not keep `useResponsiveValue` as a compatibility/deprecated surface after the migration. At the end of the work, run a batch refactor that removes `useResponsiveValue` and migrates every caller to either `useResponsiveContent` or `useResponsiveViewport`.

Component family after `/pro` review:

Use `Content`, not `Page`. The system is a page-like reading surface inside an app pane, not the route/page shell and not app chrome.

Recommended namespace:

- `<Content.Layout>`: measures and provides content layout width.
- `<Content.Row>`: full-width row anchored around the readable lane.
- `<Content.Prose>`: readable lane placement.
- `<Content.Wide>`: wide structured output, bounded by the pane.
- `<Content.Full>`: full available content box for tool-like surfaces.
- `<Content.Aside>`: secondary content adjacent to/anchored to the readable lane.

`Content.Prose` and `Prose` are intentionally separate:

- `Content.Prose` is layout placement: this block belongs in the readable content lane and gets its max width from `Content.Layout`.
- `Prose` is typography semantics: text flow, wrapping behavior, paragraphs, inline spans, and markdown-ish rhythm.

Typical use:

```tsx
<Content.Prose>
  <Prose>
    <MarkdownView source={message} />
  </Prose>
</Content.Prose>
```

Aside model:

Use `Content.Aside`, not `Note`, `Margin`, or `Float`. `Aside` is web-native, broad enough for timestamps/actions/badges/annotations, and does not imply a specific content type.

Prefer `side + offset` over mutually-exclusive `left`/`right` props:

```tsx
<Content.Row>
  <Content.Aside side="left" offset={2} align="first-line">
    10:42
  </Content.Aside>

  <Content.Prose>
    <Prose>{message}</Prose>
  </Content.Prose>

  <Content.Aside>
    edited
  </Content.Aside>
</Content.Row>
```

Recommended v1 props:

```ts
type ContentAsideProps = {
  side?: "left" | "right"
  offset?: Responsive<number>        // + outside the prose edge, - inward/overlapping
  width?: Responsive<number | "auto">
  minWidth?: Responsive<number>
  maxWidth?: Responsive<number>
  align?: "block-start" | "first-line" | "center" | "block-end"
  wrap?: "none" | "around"           // around reserved for future runaround
  show?: Responsive<boolean> | "auto"
  fallback?: "hide" | "inline" | "below"
}
```

Defaults should make this look good without configuration:

```tsx
<Content.Aside>edited</Content.Aside>
```

Default semantics:

- `side="right"`
- `offset={2}`
- `width="auto"`
- `align="first-line"`
- `wrap="none"`
- `show="auto"`
- `fallback="hide"`

`show="auto"` should only show the aside when it fits cleanly in available side space. Optional asides should hide rather than shrink readable prose. Important asides can opt into `fallback="inline"` or `fallback="below"`.

Future text wrap/runaround:

- v1 can implement outside/overlay positioning only.
- `wrap="around"` should be treated as a reserved/future PageMaker/InDesign-style runaround mode unless the text engine actually supports exclusions.
- When runaround lands, prose rendering should accept exclusion rectangles and shape lines around the aside box.
- Asides need margin/padding/gap controls so prose is never pushed directly against metadata or overlay chrome.

Docs requirement:

Add a full silvery documentation page for the content layout system. It should explain the component family, the distinction between content and viewport responsive hooks, how the readable-lane component differs from typography `Prose`, and the migration away from `useResponsiveValue`.

The docs page should include:

- A conceptual overview: readable content lane, wide lane, full lane.
- API reference for `Content.Layout`, `Content.Row`, `Content.Prose`, `Content.Wide`, `Content.Full`, `Content.Aside`, `useResponsiveContent`, and `useResponsiveViewport`.
- Responsive examples for terminal/app chrome versus pane/content layout.
- Markdown/chat examples showing prose-width text next to wide tool output.
- Migration guidance: how to choose between `useResponsiveContent` and `useResponsiveViewport`.
- Anti-patterns: global viewport breakpoints inside split panes, stringly target options, and wrapping all chat content in one max-width container.

Behavioral rules:

- `contentSize` is a maximum, never a forced width. If the pane is narrower, content uses available width.
- `wideSize` is also bounded by available width.
- `full` means the full parent content box.
- `align="start"` is better than hard centering for chat because wide tool rows and narrow prose should still feel connected.

Markdown rendering should eventually become block-aware so paragraphs use the prose lane while markdown tables and fenced code blocks use the wide lane. If that is too large for the first cut, constrain normal message rows first and track block-aware markdown as a follow-up.

## Acceptance Criteria

- At a wide terminal size, normal assistant/user prose wraps at roughly document-reading width instead of spanning the full central panel.
- Tool output, command output, code blocks, diffs, tables, and permission prompts can use the full central panel width.
- Markdown tables and fenced code blocks are not trapped inside a narrow prose column.
- The behavior is backend-neutral and applies to normalized chat content from Codex, Claude, and future adapters.
- Visual tests cover a wide viewport and a narrow viewport.
- Regression tests cover at least one wide structured block next to normal prose.
- `rg "useResponsiveValue" vendor/silvery apps packages --glob '!node_modules' --glob '!dist'` returns 0 after the final batch refactor.
- Callers that depend on app/terminal chrome width use `useResponsiveViewport`; callers inside content layout use `useResponsiveContent`.
- Silvery docs include a dedicated content layout/responsive typography page covering the component family, hooks, examples, migration guidance, and anti-patterns.
