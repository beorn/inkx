# Search

Silvery has one search state machine: `search-overlay`. React applications use it through
`SearchProvider`; searchable views register their semantic data and reveal matches through their
own measured scroll surface. Search is therefore not limited to the currently painted terminal
buffer and works for virtualized or off-screen content.

## ListView

Wrap the searchable surface and `SearchBar` in one provider, then enable `ListView` search with a
plain-text projection:

```tsx
import { ListView, SearchBar, SearchProvider } from "@silvery/ag-react"

function Files({ files }) {
  return (
    <SearchProvider>
      <ListView
        items={files}
        search={{ getText: (file) => file.name }}
        renderItem={(file) => file.name}
      />
      <SearchBar />
    </SearchProvider>
  )
}
```

`Ctrl+F` opens search by default. While the bar is active, typing updates the query, `Enter` moves
to the next match, `Shift+Enter` moves to the previous match, and `Escape` closes the bar while
retaining results. Hosts with less/vim bindings can call `useSearch().open()`, `.next()`, and
`.prev()` from `/`, `n`, and `N`. Set `openOnCtrlF={false}` when the host reserves `Ctrl+F` for a
different command.

## DocumentView

`DocumentView` searches semantic blocks and reveals the matching block from measured layout
offsets:

```tsx
const controller = useScrollController()

<SearchProvider>
  <ScrollArea controller={controller}>
    <DocumentView
      blocks={blocks}
      search={{
        scrollController: controller,
        getText: (block) => plainTextFor(block),
      }}
    />
  </ScrollArea>
  <SearchBar />
</SearchProvider>
```

Adapters such as `KNodeDocumentView` provide the semantic text projection, so applications do not
need to parse rendered React children or terminal cells.

## SyntaxHighlighter

`SyntaxHighlighter` owns semantic source-line matching and measured reveal after hard wrapping.
Pass the same controller to its enclosing `ScrollArea` and its search config:

```tsx
const controller = useScrollController()

<SearchProvider>
  <ScrollArea controller={controller}>
    <SyntaxHighlighter
      language="typescript"
      code={source}
      search={{ id: path, scrollController: controller }}
    />
  </ScrollArea>
  <SearchBar />
</SearchProvider>
```

Without `search`, the component takes its original render path: no provider lookup, registration,
or per-line measurement.

## Custom searchable surfaces

Use `registerSearchable()` for a surface that is neither a `ListView` nor a `DocumentView`:

```tsx
const search = useSearch()

useEffect(
  () =>
    search.registerSearchable("timeline", {
      search(query) {
        return rows.flatMap((row, index) =>
          computeMatchRanges(row.text, query).map((range) => ({
            row: index,
            startCol: range.start,
            endCol: range.end,
          })),
        )
      },
      reveal(match) {
        scrollToRow(match.row)
      },
    }),
  [search.registerSearchable, rows],
)
```

Always use `computeMatchRanges` from `@silvery/ag-term/search-overlay`; it is the canonical
case-insensitive, overlap-preserving matcher shared by the provider integrations.

## See also

- [ListView](/components/list-view)
- [Scrolling](/guide/scrolling)
- [Text selection](/guide/text-selection)
