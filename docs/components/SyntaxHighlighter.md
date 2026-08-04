# SyntaxHighlighter

Shiki-backed source-code presenter for Silvery React targets. It renders a
plain first frame immediately, then upgrades to structured syntax tokens when
the requested grammar is ready.

## Import

```tsx
import { SyntaxHighlighter } from "silvery"
```

## Props

| Prop              | Type                                                  | Default         | Description                                         |
| ----------------- | ----------------------------------------------------- | --------------- | --------------------------------------------------- |
| `language`        | `string`                                              | **required**    | Shiki language name or alias                        |
| `code`            | `string`                                              | **required**    | Source text                                         |
| `theme`           | `string`                                              | `"github-dark"` | Shiki theme                                         |
| `bare`            | `boolean`                                             | `false`         | Omit the framed surface and hover label             |
| `backgroundColor` | `string`                                              | unset           | Background applied to every rendered token          |
| `bold`            | `boolean`                                             | `false`         | Force bold in addition to token-level styles        |
| `search`          | `{ id?: string; scrollController: ScrollController }` | unset           | Register semantic source search and measured reveal |

## Usage

```tsx
<SyntaxHighlighter language="typescript" code={source} />
```

Pass `search` inside a `SearchProvider` when a surrounding `ScrollArea` should
search and reveal source lines. `SyntaxHighlighter` owns source matching and
measured wrapped-line origins; the host supplies only the existing scroll
controller and an optional routing id. When `search` is absent, no search hook,
registration, or line measurement is created.

```tsx
const controller = useScrollController()

<SearchProvider>
  <ScrollArea controller={controller}>
    <SyntaxHighlighter
      language="typescript"
      code={source}
      search={{ id: "source", scrollController: controller }}
    />
  </ScrollArea>
  <SearchBar />
</SearchProvider>
```

`SyntaxHighlighter` is for live React targets. For framework-neutral token
data, filename inference, or raw one-shot ANSI output, use `highlight`,
`languageForPath`, or `highlightToAnsi` from `@silvery/syntax`.

## See Also

- [Text](./Text.md) -- styled text primitive
- [CodeBlock](./typography.md) -- semantic prose code blocks
