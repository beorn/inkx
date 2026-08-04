# SyntaxHighlighter

Shiki-backed source-code presenter for Silvery React targets. It renders a
plain first frame immediately, then upgrades to structured syntax tokens when
the requested grammar is ready.

## Import

```tsx
import { SyntaxHighlighter } from "silvery"
```

## Props

| Prop              | Type                                  | Default         | Description                                      |
| ----------------- | ------------------------------------- | --------------- | ------------------------------------------------ |
| `language`        | `string`                              | **required**    | Shiki language name or alias                     |
| `code`            | `string`                              | **required**    | Source text                                      |
| `theme`           | `string`                              | `"github-dark"` | Shiki theme                                      |
| `bare`            | `boolean`                             | `false`         | Omit the framed surface and hover label          |
| `backgroundColor` | `string`                              | unset           | Background applied to every rendered token       |
| `bold`            | `boolean`                             | `false`         | Force bold in addition to token-level styles     |
| `onLineLayout`    | `(lineIndex: number, y: number) => void` | unset        | Report each source line's measured visual origin |

## Usage

```tsx
<SyntaxHighlighter language="typescript" code={source} />
```

Use `onLineLayout` when a surrounding viewport must reveal semantic source
lines after wrapping. The callback reports measured layout output; consumers
should pass the resulting offset to their existing scroll controller rather
than predicting wrapped row counts.

`SyntaxHighlighter` is for live React targets. For framework-neutral token
data, filename inference, or raw one-shot ANSI output, use `highlight`,
`languageForPath`, or `highlightToAnsi` from `@silvery/syntax`.

## See Also

- [Text](./Text.md) -- styled text primitive
- [CodeBlock](./typography.md) -- semantic prose code blocks
