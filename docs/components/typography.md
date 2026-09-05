# Typography

Semantic text hierarchy for TUIs. Since terminals can't vary font size, these presets use color + bold/dim/italic to create clear visual levels.

All components accept an optional `color` prop to override the default color.

```tsx
import {
  H1,
  H2,
  H3,
  P,
  Lead,
  Muted,
  Small,
  Strong,
  Em,
  Code,
  Kbd,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
} from "silvery"
```

## Headings

| Component | Default Style       | Use For                                  |
| --------- | ------------------- | ---------------------------------------- |
| `<H1>`    | `$fg-accent` + bold | Page title, maximum emphasis             |
| `<H2>`    | `$fg-accent` + bold | Section heading                          |
| `<H3>`    | bold (no color)     | Group heading, stands out without accent |

```tsx
<H1>Settings</H1>                    // $fg-accent + bold
<H2>General</H2>                      // $fg-accent + bold
<H3>Appearance</H3>                   // bold
<H1 color="$fg-success">Panel A</H1> // override color for differentiation
```

## Body Text

| Component | Default Style                         | Use For                         |
| --------- | ------------------------------------- | ------------------------------- |
| `<P>`     | plain text                            | Body text (semantic wrapper)    |
| `<Lead>`  | `$fg-muted` + italic                  | Introductory/lead text          |
| `<Muted>` | `$fg-muted`                           | Secondary/supporting text       |
| `<Small>` | `$fg-muted` (pre-dimmed at truecolor) | Fine print, captions, footnotes |

```tsx
<P>Use dark colors for the UI.</P>    // plain body text
<Lead>Welcome to the app</Lead>       // $fg-muted + italic
<Muted>Requires restart</Muted>       // $fg-muted
<Small>Last updated 2 hours ago</Small> // $fg-muted (pre-dimmed)
```

## Inline Emphasis

| Component  | Default Style | Use For                |
| ---------- | ------------- | ---------------------- |
| `<Strong>` | bold          | Inline strong emphasis |
| `<Em>`     | italic        | Inline emphasis        |

```tsx
<Text>
  This is <Strong>important</Strong> and <Em>emphasized</Em>.
</Text>
```

## Code & Keys

| Component     | Default Style                  | Use For                 |
| ------------- | ------------------------------ | ----------------------- |
| `<Code>`      | `$fg-info`, no chip or padding | Inline code             |
| `<Kbd>`       | `$bg-muted` + bold             | Keyboard shortcut badge |
| `<CodeBlock>` | `$bg-surface-subtle` padded surface | Multi-line code block   |

```tsx
<Code>npm install silvery</Code>      // inline code
<Kbd>Ctrl+C</Kbd>                      // keyboard shortcut
<CodeBlock>{"const x = 1\nconst y = 2"}</CodeBlock>
```

`<CodeBlock>` has two cells of horizontal padding and one blank row above and
below its content, with no border. It fills the available width without growing
vertically. `DocumentView` outdents the surface two cells into its gutters so
code text aligns with prose; the generic component does not assume those gutters.

Inline code and links may share a blue-family hue, but they remain distinct by
decoration: links use a dotted underline while code does not. This survives
theme retuning, dim terminals, and color-vision differences better than relying
on two nearby shades. An explicit `color` on `<Code>` still overrides
`$fg-info`; `<Kbd>` deliberately keeps its padded background badge.

## Block Elements

| Component      | Default Style                                            | Use For         |
| -------------- | -------------------------------------------------------- | --------------- |
| `<Blockquote>` | `$fg-muted` italic body, inset two cells | Quotations      |
| `<HR>`         | `$border-default` dashes                                 | Horizontal rule |

```tsx
<Blockquote>Less is more.</Blockquote>
<HR />
```

`<Blockquote>` has a two-cell left inset and no border or text prefix. Wrapped
rows keep the same inset, muted foreground, and italic styling.

## Lists

Lists support nesting via `UL`/`OL` containers.

| Component | Style                    | Use For        |
| --------- | ------------------------ | -------------- |
| `<UL>`    | container                | Unordered list |
| `<OL>`    | container (auto-numbers) | Ordered list   |
| `<LI>`    | bullet/number + indented | List item      |

```tsx
<UL>
  <LI>First item</LI>
  <LI>Second item
    <UL>
      <LI>Nested bullet</LI>
    </UL>
  </LI>
</UL>

<OL>
  <LI>Step one</LI>
  <LI>Step two</LI>
</OL>
```

Bullet styles vary by nesting depth: `•` `◦` `▸` `-`.

## Props

### TypographyProps

All typography components share this interface:

```typescript
interface TypographyProps {
  children?: ReactNode
  color?: string // Override the default color
}
```

The `color` prop overrides the default semantic color, useful for panel differentiation:

```tsx
<H1 color="$success">Success Panel</H1>
<H1 color="$warning">Warning Panel</H1>
```
