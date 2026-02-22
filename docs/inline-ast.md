# Inline AST

The inline AST represents the parsed structure of inline markdown content. It provides a typed tree of nodes that can be rendered to JSX via `<InlineText>` or to plain text via `parseToPlainText()`.

## Node Types

### PlainText

Raw text content with no formatting.

- **Syntax**: Any text not matched by other patterns
- **Properties**: `text: string`
- **Rendering**: Rendered as-is

### Bold

Strong emphasis.

- **Syntax**: `**text**`
- **Properties**: `children: InlineNode[]`
- **Rendering**: `<Text bold>` in rich mode, stripped markers in plain mode

### Italic

Emphasis, supporting both asterisk and underscore delimiters.

- **Syntax**: `*text*` or `_text_`
- **Properties**: `children: InlineNode[]`
- **Rendering**: `<Text italic>` in rich mode, stripped markers in plain mode

### Strikethrough

Struck-through text.

- **Syntax**: `~~text~~`
- **Properties**: `children: InlineNode[]`
- **Rendering**: `<Text dim strikethrough>` in rich mode, stripped markers in plain mode

### Code

Inline code span.

- **Syntax**: `` `code` ``
- **Properties**: `code: string`
- **Rendering**: `<Text color="cyan">` in rich mode, stripped backticks in plain mode. Content is not parsed for nested inline formatting.

### Link

Standard markdown link.

- **Syntax**: `[text](url)`
- **Properties**: `text: string`, `url: string`
- **Rendering**: `<Text color="cyan" underline>` with OSC 8 hyperlink wrapping in rich mode, text only in plain mode

### WikiLink

Internal wiki-style link, optionally with embed prefix.

- **Syntax**: `[[target]]`, `[[target|alias]]`, `![[embed]]`
- **Properties**: `target: string`, `alias: string | undefined`, `isEmbed: boolean`
- **Rendering**: `<Text color="green" underline>` showing alias or resolved title in rich mode, display text in plain mode. Resolved via `resolveWikiLink` callback.

### Mention

Person reference using `@` sigil.

- **Syntax**: `@person-name` (Unicode letters, digits, underscore, hyphen)
- **Properties**: `name: string` (without `@` prefix)
- **Rendering**: Colored by sigil color map when resolved, plain text when unresolved. Can be shortened via `personShortNames` or stripped via options.

### Tag

Tag reference using `#` sigil.

- **Syntax**: `#tag-name` (Unicode letters, digits, underscore, hyphen)
- **Properties**: `name: string` (without `#` prefix)
- **Rendering**: Colored by sigil color map when resolved, plain text when unresolved. Can be stripped via `stripTagsAndProjects`.

### Project

Project reference using `+` sigil.

- **Syntax**: `+project-name` (Unicode letters, digits, underscore, hyphen, slash, dot)
- **Properties**: `name: string` (without `+` prefix)
- **Rendering**: Colored by sigil color map when resolved, plain text when unresolved. Can be stripped via `stripTagsAndProjects`.

### InlineField

Key-value metadata field in bracket syntax.

- **Syntax**: `[key:: value]`
- **Properties**: `key: string`, `value: string`
- **Rendering**: In rich mode: dim cyan key, dim `::`, value colored by type (green for dates, yellow for numbers, white otherwise). Stripped entirely in plain mode.

### BlockRef

Block reference identifier, used for Asana-style cross-references.

- **Syntax**: `^1234567890` (10+ digit numeric ID), `[[^id]]`, or `-> ^id`
- **Properties**: `id: string`
- **Rendering**: Stripped in display (metadata only).

### AutoLink

CommonMark autolink using angle brackets.

- **Syntax**: `<https://example.com>`
- **Properties**: `url: string`
- **Rendering**: Same as BareURL after angle bracket stripping.

### BareURL

Unlinked URL appearing in text.

- **Syntax**: `https://example.com/path` or `http://...`
- **Properties**: `url: string`
- **Rendering**: Protocol/www stripped for display, `<Text color="cyan" dim underline>` with OSC 8 hyperlink in rich mode.

## Parse Order

The parser processes inline content in precedence order to avoid ambiguity:

1. **InlineField** `[key:: value]` - must be matched before Link syntax
2. **Code** `` `code` `` - content inside backticks is opaque (no nested parsing)
3. **WikiLink** `[[target]]` - must be matched before Link
4. **Link** `[text](url)` - standard markdown link
5. **AutoLink** `<url>` - CommonMark autolink (converted to BareURL)
6. **BareURL** `https://...` - unlinked URLs
7. **Bold** `**text**` - must be matched before Italic `*`
8. **Strikethrough** `~~text~~`
9. **Italic** `*text*` or `_text_`
10. **Sigils** `@mention`, `#tag`, `+project`
11. **BlockRef** `^id` patterns
12. **PlainText** - everything else

## Pipeline Options

The AST rendering phase accepts the same options as `TextPipelineOptions`:

| Option | Effect |
|---|---|
| `mode` | `"rich"` (JSX with styling), `"plain"` (text only), `"stripped"` (text, no metadata) |
| `excludeSigils` | Remove specific sigils from output (e.g., `["@issue"]`) |
| `sigilColors` | Map of sigil string to color name |
| `resolveSigilColor` | Dynamic color resolver for sigils |
| `shortenMentions` | Replace @mentions with short names |
| `personShortNames` | Map of person name to abbreviation |
| `stripRefs` | Remove all @mentions, #tags, +projects |
| `stripTagsAndProjects` | Remove #tags and +projects, keep @mentions |
| `stripKnownMentions` | Remove known person @mentions |
| `resolveWikiLink` | Resolve wiki link targets to display titles |
