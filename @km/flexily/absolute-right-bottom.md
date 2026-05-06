---
mentions:
  - km
id: "@km/flexily/absolute-right-bottom"
aliases:
  - km-flexily.absolute-right-bottom
  - km-flexily-absolute-right-bottom
created_by: claude:3c24fe4a
created_at: 2026-03-17T21:33:15Z
owner: bjorn@stabell.org
---

# [ ] Support right/bottom positioning for absolute elements @km/flexily #feature #P2

Flexily absolute-positioned elements only support marginLeft/marginTop (like CSS left/top). Add support for right/bottom inset positioning so dialogs can be anchored declaratively.

**Current pain**: km dialogs thread termWidth through every component to compute marginLeft manually:

```tsx
// Current: manual offset calculation
<Box position="absolute" marginLeft={termWidth - dialogWidth} marginTop={1}>
```

**Goal**: Support right/bottom props on absolute Box elements:

```tsx
// Target: declarative anchoring
<Box position="absolute" right={0} marginTop={1}>
```

**Scope**:

1. Flexily: implement right/bottom inset props for position=absolute (CSS-compatible)
2. Silvery: expose right/bottom as Box props
3. km: update TopRightDialog and other manual offset patterns
4. Docs: update flexily CLAUDE.md, positioning docs
5. Showcase: highlight in silvery docs as a differentiator vs Yoga (which also lacks this)

