# Content

`Content` provides responsive content lanes for documents, transcripts, and
other reading surfaces. It owns the geometry of centered prose, wider rich
content, full-width content, auto lane selection, and optional row asides.

```tsx
import { Content } from "silvery"
;<Content.Layout prose={80} wide={120}>
  <Content.Row>
    <Content.Body width="prose">Readable body content</Content.Body>
  </Content.Row>
</Content.Layout>
```

## Lanes

`Content.Body` accepts:

- `"prose"` (default) for readable text
- `"wide"` for code and tables
- `"full"` for content that needs the available width
- `"auto"` to select the smallest fitting lane

`Content.Layout` defaults to centered 96-unit prose and 120-unit wide lanes.
Use percentage widths when a contained surface should use its own full width:

```tsx
<Content.Layout fill={false} prose="100%" wide="100%" align="start">
  {children}
</Content.Layout>
```

`Content.Row`, `Content.Body`, and `Content.Aside` compose one row. The row
reserves symmetric side slots without changing the middle lane. `PaneSize`
provides an authoritative available width; `Content.MeasuredPaneScope`
narrows that declaration to a measured descendant when a host subdivides a
pane.

The hooks `useContentLayout`, `useContentRowWidth`,
`useHasContentLayout`, and `useResponsiveContent` expose resolved lane state
without duplicating its calculations.

## Ownership

Content owns lane geometry. Consumers choose a semantic lane; they should not
recreate centering, gutters, side-slot budgets, or auto-lane selection around
it. [`DocumentView`](./DocumentView.md) uses Content for semantic documents.
