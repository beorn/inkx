# km-markdown

Markdown parsing and serialization — bidirectional conversion between `.md` files on disk and km-ast (km's internal node tree). Built on mdast + micromark.

See the repo root [CLAUDE.md](../../CLAUDE.md) and [docs/architecture.md](../../docs/architecture.md) for the Parser layer's role.

## Before working in km-markdown

**Read first, in this order:**

1. [`docs/design/data-model.md`](../../docs/design/data-model.md) — the km-ast shape this package must produce
2. [`src/kmast/`](src/kmast) — the km-ast types and what gets mapped to/from mdast; [`src/ast2nodes.ts`](src/ast2nodes.ts) and [`src/nodes2md.ts`](src/nodes2md.ts) are the two conversion directions
3. [mdast spec](https://github.com/syntax-tree/mdast) — the external AST this package converts from/to
4. [micromark docs](https://github.com/micromark/micromark) and [unifiedjs.com](https://unifiedjs.com) — tokenizer and unified pipeline

**Do NOT reimplement:**

- A hand-rolled markdown tokenizer — always go through micromark. If a syntax extension is missing, write a micromark extension, don't parse strings yourself.
- `mdast` node types — extend via the standard mdast extension mechanism, don't shadow them.
- Serialization logic that already exists in `mdast-util-to-markdown` — add serializers via its handler map.

**The markdown ↔ km-ast contract (round-trip invariant):**

- `parse(serialize(kmast)) === kmast` for every km-ast shape we support — any change that breaks this must ship with an updated fixture, an explanation, and a migration plan. Round-trip fuzz tests are the gate.
- Unknown mdast nodes must pass through unchanged, not be dropped. km-markdown is lossless by default.
- Whitespace inside content is preserved; structural whitespace (between blocks) is normalized.

**Anti-patterns specific to km-markdown:**

- Regex-based markdown parsing — always use the mdast tree
- Dropping fields we don't recognize — preserve them in a pass-through slot
- Leaking mdast types out of this package — `@km/core` and `@km/storage` only ever see km-ast
- Silently "fixing" malformed markdown — surface it so the user sees what changed
