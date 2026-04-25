# Smart Links

A **smart link** is a pattern in displayed text that, on hover, opens a popover preview and (someday) acts on click. silvercode uses smart links to turn shorthand like `~repo`, `+km`, or `AGENTS.md` into rich, navigable references inside chat history.

## Terminology

The km ecosystem has three related-but-distinct link concepts. Use these names consistently to avoid confusion.

| Concept | What it does | Where it lives | Doc |
|---|---|---|---|
| **Smart links** | Pattern → URI → popover/action. Display-layer detection in user-visible text (chat, knode bodies). | `apps/silvercode/src/autolinks/` (will rename to `smartlinks/` per `km-silvercode.autolinks-uri-pivot`) | this doc |
| **Glossary linker** (a.k.a. term enrichment) | Build-time substitution of glossary terms into `<a>` elements in static content. | TBD — website build pipeline (`silvery.dev` / `km.dev`) | website docs |
| **Links** (canonical) | Storage-level link between knodes. Persisted relations with rel taxonomy. | km storage layer; `Link` type | `docs/design/model/klink.md` |

In short:

- **Smart links** is interaction (hover/click on patterns in text).
- **Glossary linker** is content production (rewrite published HTML).
- **Links** is data (persistent edges between knodes).

If a feature manipulates a regex that matches user-displayed text and renders a popover → it's smart links. If a feature builds a static glossary of terms and substitutes anchor tags into pages at build time → it's glossary linker. If a feature creates a row in a links table or follows a `target_id` from one knode to another → it's links.

## Industry analogues (for orientation)

| System | Closest km concept |
|---|---|
| GitHub repo autolinks (admin → autolink references) | smart links (one-stage, simpler — URL templates) |
| JetBrains Issue Navigation | smart links (regex → URL) |
| VS Code DocumentLinkProvider + UriHandler | smart links (two-stage, plugin API) |
| Apple NSDataDetector / Smart Links | smart links (system-level pattern detection) |
| Obsidian wikilinks (`[[note]]`) | smart links (semantic intent) + links (data) |
| Sphinx `:ref:`, MkDocs glossary plugin | glossary linker |
| Hugo / Jekyll term-cross-reference plugins | glossary linker |
| Neo4j / RDF triples | links (data model) |

## Config — `.km/config.yaml`

silvercode reads its config from `.km/config.yaml` (per-vault) with cascade onto `~/.km/config.yaml` (workspace defaults). YAML is preferred over TOML across the km ecosystem.

`.km/` is the canonical km configuration root, distinct from `.git/` (version control), `.silvercode/` (auth state — different concern, see [accounts](#)), and `~/.km/` (workspace defaults).

The file is sectioned; smart links live under `smartlinks:`. Other sections reserved for future use (theme, keybindings, etc.):

```yaml
# .km/config.yaml

smartlinks:
  - pattern: "~repo"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: readme

  - pattern: "/\\+\\w+/"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: bd-active

  - pattern: "AGENTS.md"
    resolves_to: "/Users/beorn/Code/pim/km/AGENTS.md"
    preview: first-paragraph

# Future sections:
# theme: ...
# keybindings: ...
```

### Cascade

Workspace rules in `~/.km/config.yaml` are loaded first; per-vault rules in `<cwd>/.km/config.yaml` cascade on top. Behavior:

- A vault rule with a **new** `pattern` is appended.
- A vault rule with the **same** `pattern` as a workspace rule REPLACES the workspace rule at the workspace rule's original index — so relative ordering is preserved across the merge.

Order matters because `mergeDetections` resolves rule overlaps by rule index. A workspace rule that's not shadowed appears earlier in the merged list (higher priority).

### Pattern syntax

Two forms:

- **Literal** — `"~repo"`. The string is regex-escaped and matched verbatim. Use this for shorthand prefixes, file names, project nicknames.
- **Regex** — `"/\\+\\w+/"`. The leading `/` flags it as a regex; the body is JS RegExp source; the trailing `/` is optional. The `g` flag is always added.

```yaml
# Literal: matches the exact substring "~repo"
- pattern: "~repo"

# Regex: matches +km, +pam, +anything-word-shaped
- pattern: "/\\+\\w+/"

# Regex (no trailing slash, body extends to end)
- pattern: "/AGENTS\\.md"
```

### Preview kinds

| Kind | Source | Cache |
|---|---|---|
| `readme` | reads `resolves_to` (or its `README.md` if a directory); rendered via MarkdownView (rich) | `fs.watch` |
| `first-paragraph` | reads `resolves_to`, shows the first non-blank paragraph; rendered via MarkdownView | `fs.watch` |
| `bd-active` | runs `bd list --parent <resolves_to> --status open --limit 5` | 30s TTL |
| `shell` | runs `command` field with `${resolves_to}` substitution; 5s timeout, 4KB cap; rendered as plain text | 30s TTL |
| `mcp` | calls an MCP tool with `args`; **stub** — rules dropped at config load until `km-silvercode.autolinks-mcp-resolver` lands (will be superseded by URI pivot) | n/a |

### Validation

Malformed rules are dropped silently (with a debug-log warning) — startup never blocks on user-config typos. Common drops:

- Missing `pattern` / `resolves_to` / `preview`
- Invalid regex (e.g. `"/[unclosed/"`)
- Unknown preview kind
- `shell` rules without a `command` field
- `shell` rules whose command starts with a shell metacharacter (`|`, `&`, `;`, `>`, `<`, `` ` ``) — paste-error guard
- `mcp` rules — always dropped (stub)

## Cache invalidation

The preview cache uses two strategies:

- **File-backed previews** (`readme`, `first-paragraph`): register `fs.watch` on the resolved path with a 200ms debounce. Modify the file → next hover gets a fresh read.
- **Shell-out previews** (`bd-active`, `shell`): 30s TTL. No watcher (the source of truth isn't a single file).

Watchers are torn down on session dispose via `useScopeEffect` on `AutolinksContext`.

## Future direction — URI pivot

The current shape combines two concerns (text → resolved value AND resolved value → preview) in a single rule. A planned pivot factors the implementation into URI-scheme dispatch:

- Stage 1 (linkifier): `pattern → URI` (where `resolves_to` is parsed as a URI)
- Stage 2 (handlers): `URI → preview + action`, keyed by URI scheme

After this lands:
- ANY URL in chat (typed by user, returned by an MCP tool, pasted) flows through the same handler pipeline — no rule needed for plain URLs.
- `mcp` becomes a handler scheme (not a preview kind).
- `shell` becomes a handler scheme.
- The user-facing schema stays the same in v1; an additive `[[handlers]]` block exposes the registry to advanced users in v2.

Tracking: `km-silvercode.autolinks-uri-pivot`.

## Smart links vs Links — when to use which

A common confusion: "should I add a row to the links table or define a smart link?"

**Use links** (`docs/design/model/klink.md`) when:
- The connection is **persistent** — survives across sessions.
- It connects two km objects (knode → knode, knode → external resource) with a typed `rel`.
- The data is structural — followable by graph queries, indexed.

**Use smart links** when:
- The connection is **inferred from text** — you read text, found a pattern, want to render a popover.
- The "target" is shorthand the user types in chat.
- The interaction is ephemeral (session-scoped); preview is rendered, not stored.

A pattern can graduate from smart link to link: if a user keeps typing `~repo` and want navigation across sessions, the right move is to add a `Link` row, not refine the smart-link rule.

## Future sharing

Today smart links live in `apps/silvercode/`. As the system matures it will likely extract to a shared package consumed by silvercode + km-tui (knode body view) + future km surfaces. Tracking: `km-all.smartlinks-extraction`.

## References

- Implementation: `apps/silvercode/src/autolinks/` (config, match, previews)
- Tests: `apps/silvercode/tests/autolinks/`, `apps/silvercode/tests/visual/autolinks*`
- Beads:
  - `km-silvercode.autolinks-config` (parent — v1 ships)
  - `km-silvercode.autolinks-uri-pivot` (URI dispatch refactor)
  - `km-silvercode.autolinks-mcp-resolver` (mcp scheme — superseded by URI pivot)
  - `km-all.smartlinks-extraction` (cross-app sharing)
