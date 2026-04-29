---
id: "@km/tui/nocolor-dry"
aliases:
  - km-tui.nocolor-dry
  - km-tui-nocolor-dry
created_by: claude:e7c823b8
created_at: 2026-02-26T17:01:17Z
closed_at: 2026-02-26T17:48:57Z
owner: bjorn@stabell.org
---

# [x] Replace noColor with <StripColor> wrapper component @km/tui #task #P3

Replace noColor threading with a `<StripColor>` wrapper component (or inkx Box prop `stripColor`).

Current: 15+ components check `ctx.noColor ? undefined : "\$token"`.

Better: Components ALWAYS set their natural color (`color="\$link"`, `color="\$control"`). When the parent card is selected/highlighted, wrap content in `<StripColor>` — this neutralizes all descendant color props so everything uses the inherited fg (e.g. \$selectedfg).

```tsx
// Selected card:
<Box backgroundColor="\$selected" color="\$selectedfg">
  <StripColor>
    <InlineText text={content} />   {/* links, code, sigils all render as \$selectedfg */}
  </StripColor>
</Box>

// Normal card:
<Box>
  <InlineText text={content} />     {/* links=\$link, code=\$control, etc. */}
</Box>
```

Implementation options:
1. **React context**: StripColor sets a context flag, useTheme/resolveThemeColor returns undefined for all tokens when flag is set
2. **inkx Box prop**: `stripColor` on Box tells the renderer to ignore descendant color props
3. **Transform**: A Transform-like component that strips ANSI color codes from rendered output

Option 1 is simplest — just a context provider that short-circuits theme color resolution.