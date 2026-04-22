# Exotic language IDs in fenced code blocks

Writers use obscure language hints to drive syntax highlighting in Obsidian,
Foam, Logseq, GitHub, etc. The parser must preserve the _exact_ info-string.

```mermaid
sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: hi
  B-->>A: hello
```

```typescript
import { parseMarkdownToNodes } from "@km/markdown"
const nodes = parseMarkdownToNodes("# hi", "test.md")
```

```dataview
TABLE file.mtime AS "Modified"
FROM #project
SORT file.mtime DESC
```

```dot
digraph G {
  A -> B;
  B -> C;
}
```

```plantuml
@startuml
Alice -> Bob: auth request
Bob --> Alice: auth response
@enduml
```
