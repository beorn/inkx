# Autolinks

**Autolinks** is the umbrella term for systems in the km ecosystem that automatically turn matched text into navigable links. The pattern is widespread but the km ecosystem has two distinct kinds:

| Kind | What it matches | When | Where it lives | Output |
|---|---|---|---|---|
| **Syntax linker** | Patterns (regex / literal) in *displayed text* — chat history, knode bodies, prose in any view | Run-time, on render + hover | `apps/silvercode/src/autolinks/` (silvercode's syntax linker) | Hover popover + click action |
| **Term linker** | Glossary-defined terms in static published content | Build-time, during HTML generation | website build pipeline (km.dev / silvery.dev) | Anchor tag with tooltip |

Both are autolinks; they differ in *what* they match (text patterns vs glossary terms), *when* they run (run-time vs build-time), and *what they produce* (interactive popover vs anchor element).

## Distinguishing autolinks from canonical links

A third concept — **links** (canonical) — is unrelated despite the name:

| Concept | Layer | Persistent? |
|---|---|---|
| Autolinks (syntax / term linker) | Display / build-time | No — derived from text or glossary |
| Links (canonical `Link` type) | Storage | Yes — persistent edges between knodes |

If a feature manipulates a regex matched against user-displayed text and renders a popover → it's the **syntax linker**. If a feature builds a static glossary of terms and substitutes anchor tags into pages at build time → it's the **term linker**. If a feature creates a row in a links table or follows a `target_id` from one knode to another → it's a **link**. See [docs/design/model/klink.md](model/klink.md) for canonical links.

## Industry analogues

| System | Closest km kind |
|---|---|
| GitHub repo autolinks (admin → autolink references) | syntax linker (one-stage, simpler) |
| JetBrains Issue Navigation | syntax linker (regex → URL) |
| VS Code DocumentLinkProvider + UriHandler | syntax linker (two-stage, plugin API) |
| Apple NSDataDetector / Smart Links | syntax linker (system-level pattern detection) |
| Obsidian wiki-links (`[[note]]`) | syntax linker (semantic shorthand) |
| Sphinx `:ref:`, MkDocs glossary plugin | term linker |
| Hugo / Jekyll term-cross-reference plugins | term linker |
| Wikipedia inter-article auto-linking | term linker |

## Syntax linker (silvercode)

silvercode's syntax linker reads its rules from `.km/config.yaml` (per-vault) with cascade onto `~/.km/config.yaml` (workspace defaults). Rules under the top-level `syntaxlinks:` key:

```yaml
# .km/config.yaml

syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: readme

  - pattern: "/\\+\\w+/"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: bd-active

  - pattern: "AGENTS.md"
    resolves_to: "/Users/beorn/Code/pim/km/AGENTS.md"
    preview: first-paragraph

# Future km-ecosystem sections in the same file:
# theme: ...
# keybindings: ...
```

`.km/` is the canonical km-ecosystem configuration root. Other km tooling (silvercode auth, tribe bus, pane state) also lives under `.km/`, e.g. `~/.km/accounts/<name>/`, `<cwd>/.km/panes.json`, `~/.km/tribe-bus.jsonl`. `~/.km/config.yaml` is the workspace-level user config (cascade target).

### Cascade

Workspace rules in `~/.km/config.yaml` are loaded first; per-vault rules in `<cwd>/.km/config.yaml` cascade on top:

- A vault rule with a **new** `pattern` is appended.
- A vault rule with the **same** `pattern` as a workspace rule REPLACES the workspace rule at the workspace rule's original index — relative ordering is preserved across the merge.

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
| `shell` | spawns `command.exec` with `command.args` (per-arg `${resolves_to}` substitution); 5s timeout, 4KB cap; output sanitized of ANSI/control sequences before render | 30s TTL |
| `mcp` | calls an MCP tool with `args`; **stub** — rules dropped at config load until `km-silvercode.autolinks-mcp-resolver` lands (will be superseded by URI pivot) | n/a |

### Validation

Malformed rules are dropped silently (with a debug-log warning) — startup never blocks on user-config typos. Common drops:

- Missing `pattern` / `resolves_to` / `preview`
- Invalid regex (e.g. `"/[unclosed/"`)
- Unknown preview kind
- `shell` rules without a `command` object (must be `{exec, args}`, not a string)
- `shell` rules whose `exec` is a relative path with separators (e.g. `"./bin/x"` is rejected; bare names resolve via PATH, absolute paths are allowed)
- `shell` rules whose `command.args` isn't a list of strings
- `mcp` rules — always dropped (stub)

### Shell preview security model

The `shell` preview kind uses a **structured argv form**, not a shell command string, to remove all shell-injection surface:

```yaml
syntaxlinks:
  - pattern: "~repo"
    preview: shell
    command:
      exec: git
      args: ["-C", "${resolves_to}", "log", "-5", "--oneline"]
```

Properties:

- `command.exec` is the program — bare name resolved via `PATH`, or an absolute path. Relative paths with separators are rejected (paste-error guard).
- Each `command.args[i]` has the literal substring `${resolves_to}` replaced with the rule's resolved value AT TOKEN LEVEL. The arg stays a single argv token. A `resolves_to` of `"; rm -rf /"` becomes a single argument value, never a new shell command.
- We spawn directly via `Bun.spawn` with the argv array — no `sh -c`.
- Env is minimized: only `PATH`, `HOME`, `LANG` are inherited; `TERM` is forced to `dumb` so commands don't emit ANSI by default.
- 5-second wall-clock timeout with `SIGKILL` on overrun.
- Output passes through a sanitizer (`sanitizeShellOutput`) that strips ANSI escape sequences (CSI, OSC, DCS, PM, APC, SOS), C0 control characters, and DEL — defending against terminal-injection in popover render even from tools that ignore `TERM=dumb`.

### Cache invalidation

The preview cache uses two strategies:

- **File-backed previews** (`readme`, `first-paragraph`): register `fs.watch` on the resolved path with a 200ms debounce. Modify the file → next hover gets a fresh read.
- **Shell-out previews** (`bd-active`, `shell`): 30s TTL. No watcher (the source of truth isn't a single file).

Watchers are torn down on session dispose via `useScopeEffect` on `AutolinksContext`.

### URI dispatch (internal)

The implementation factors preview resolution into URI-scheme dispatch — the same shape every OS and editor uses for handler registration (VS Code's `DocumentLinkProvider` + `UriHandler` are the canonical analogue):

- **Stage 1 — linkifier** (`apps/silvercode/src/autolinks/match.ts`): pattern → URI. The matcher emits autolink detections and a separate virtual-detection pass picks up plain `https?://...` tokens that aren't covered by a configured rule.
- **Stage 2 — handlers** (`apps/silvercode/src/autolinks/handlers/`): URI → preview + action, keyed by URI scheme.

The user-facing schema in `.km/config.yaml` is unchanged — rules still carry `pattern` / `resolves_to` / `preview`. The `resolves_to` value is parsed by `parseResolvesTo` into a URI on the way to dispatch:

| `resolves_to` value          | Inferred scheme | Notes |
|------------------------------|-----------------|-------|
| `/Users/beorn/Code`          | `file:`         | Absolute path |
| `~/Documents`                | `file:`         | `~` expanded to `$HOME` |
| `km-foo.bar` / `foo.bar`     | `bd:`           | Looks like a bd parent id |
| `https://github.com/...`     | `https:`        | Explicit scheme passes through |
| `bd://km-foo`                | `bd:`           | Explicit scheme passes through |
| `mcp:rfc.lookup`             | `mcp:`          | Explicit scheme passes through |

The handler registry (`apps/silvercode/src/autolinks/handlers/index.ts`) is hardcoded in v1 with five schemes: `file`, `bd`, `shell`, `https`, `mcp`. Each handler exports a `Handler { scheme, resolve(uri, ctx) }` and is responsible for its own resolve logic; cache + watcher lifecycle stays in `previews.ts`.

Plain URLs in displayed text flow through the same pipeline. `detectAutolinks` emits a *virtual* autolink detection for any URL-shaped token not already covered by a configured rule; the registry routes it to the `https:` handler (a webcard placeholder in v1). No rule is needed.

Doctor introspection (`silvercode doctor autolinks`) lists registered schemes and shows the per-rule handler binding so users can see which scheme each rule's `resolves_to` resolves to and flag rules whose scheme has no handler.

Future direction:
- v2 will expose `[[handlers]]` in `.km/config.yaml` for user-defined handlers (additive — v1 user-facing schema unchanged).
- `mcp` will become a fully implemented handler scheme (currently a stub at `apps/silvercode/src/autolinks/handlers/mcp.ts`); see `km-silvercode.autolinks-mcp-resolver`.
- The `https:` handler will gain a real webcard fetcher (OG metadata + sandboxed fetch).

Tracking: `km-silvercode.autolinks-uri-pivot` (URI dispatch landed); `km-silvercode.autolinks-mcp-resolver` (mcp handler implementation, deferred).

## Term linker (website)

The term linker substitutes glossary-defined terms into anchor tags during static-site generation. Build-time, no runtime cost on rendered pages. Source of terms: a glossary file (e.g., `docs/glossary.md`); each entry maps `term → URL` and the build pipeline rewrites matching plain-text occurrences in published HTML.

Status: planning. Lives in the website build pipeline (km.dev / silvery.dev), not in the silvercode app. Documentation will be added once the implementation arrives.

## Syntax linker vs canonical links — when to use which

A common confusion: "should I add a row to the links table or define a syntax-linker rule?"

**Use canonical links** ([docs/design/model/klink.md](model/klink.md)) when:
- The connection is **persistent** — survives across sessions.
- It connects two km objects (knode → knode, knode → external resource) with a typed `rel`.
- The data is structural — followable by graph queries, indexed.

**Use the syntax linker** when:
- The connection is **inferred from text** — you read text, found a pattern, want to render a popover.
- The "target" is shorthand the user types in chat or notes.
- The interaction is ephemeral (session-scoped); preview is rendered, not stored.

A pattern can graduate from syntax-linker to canonical link: if a user keeps typing `~repo` and wants navigation across sessions, the right move is to add a `Link` row, not refine the syntax-linker rule.

## Future sharing

Today the syntax linker lives in `apps/silvercode/`. As the system matures it will likely extract to a shared package consumed by silvercode + km-tui (knode body view) + future km surfaces. The term linker is owned by the website build pipeline. Tracking: `km-all.autolinks-extraction`.

## References

- Implementation: `apps/silvercode/src/autolinks/` (config, match, previews)
- Tests: `apps/silvercode/tests/autolinks/`, `apps/silvercode/tests/visual/autolinks*`
- Beads:
  - `km-silvercode.autolinks-config` (parent — v1 ships)
  - `km-silvercode.autolinks-uri-pivot` (URI dispatch refactor)
  - `km-silvercode.autolinks-mcp-resolver` (mcp scheme — superseded by URI pivot)
  - `km-all.autolinks-extraction` (cross-app sharing)
