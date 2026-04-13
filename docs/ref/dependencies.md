# Dependency Inventory

Last updated: 2026-04-12
Regenerate: `bun tools/dep-inventory.ts`

86 total dependencies — 40 workspace (internal), 17 runtime (external), 29 dev (external).
~1,280 transitive packages in the lockfile.

Data source: [npms.io](https://npms.io) batch API + `bun audit` + `bun outdated`.

## Runtime Dependencies (17)

Core packages that ship with km. These matter most for security and stability.

| Package | Pinned | Latest | Score | Stars | Issues | DL/mo | CVEs | Notes |
|---------|--------|--------|-------|-------|--------|-------|------|-------|
| `@chenglou/pretext` | ^0.0.3 | 0.0.5 | — | — | — | — | HIGH (DoS) | Text measurement. 1 maintainer, 2 weeks old. **Update to 0.0.5 fixes CVE.** |
| `chokidar` | ^5.0.0 | 5.0.0 | 0.81 | 12K | 29 | 2.1B | — | File watching. Mature (2012). paulmillr solo maintains. |
| `chrono-node` | ^2.9.0 | 2.9.0 | 0.67 | 5.2K | 125 | 14M | — | NL date parsing. High issue count. |
| `commander` | ^14.0.3 | 14.0.3 | 0.97 | 28K | 10 | 4.8B | — | CLI framework. Exemplary maintenance. |
| `debug` | ^4.4.3 | 4.4.3 | 0.82 | 11K | 61 | 8.9B | — | Debug logging. Ubiquitous. |
| `entities` | ^8.0.0 | 8.0.0 | 0.88 | 378 | 1 | 1.5B | — | HTML entities. Very well maintained. |
| `hast-util-from-html` | ^2.0.3 | 2.0.3 | 0.65 | — | — | 53K | — | syntax-tree org. Niche but solid. |
| `hast-util-to-mdast` | ^10.1.2 | 10.1.2 | 0.70 | — | — | 2M | — | syntax-tree org. |
| `mdast-util-from-markdown` | ^2.0.3 | 2.0.3 | 0.80 | 280 | 3 | 145M | — | Core markdown parser. syntax-tree org. |
| `mdast-util-gfm` | ^3.1.0 | 3.1.0 | 0.76 | — | — | 26M | — | GFM extension. syntax-tree org. |
| `mdast-util-to-markdown` | ^2.1.2 | 2.1.2 | 0.78 | — | — | 136M | — | Markdown serializer. syntax-tree org. |
| `micromark-extension-gfm` | ^3.0.0 | 3.0.0 | 0.75 | 2.2K | 5 | 26M | — | GFM tokenizer. Last publish 2023-06. |
| `rehype-parse` | ^9.0.1 | 9.0.1 | 0.75 | 2.2K | 2 | 15M | — | HTML parser. rehypejs org. |
| `rrule` | ^2.8.1 | 2.8.1 | 0.68 | 3.7K | 182 | 14M | — | Recurrence rules. **182 open issues.** Last publish 2023-11. |
| `ulid` | ^3.0.2 | 3.0.2 | 0.61 | 3.4K | 6 | 19M | — | ID generation. Maint 0.50. |
| `zod` | ^4.3.6 | 4.3.6 | 0.83 | 42K | 177 | 41M | — | Schema validation. Zod 4 just shipped. |
| `@types/debug` | ^4.1.13 | 4.1.13 | — | — | — | — | — | DefinitelyTyped. |

## Dev Dependencies (29)

Build, test, and tooling packages. Never shipped to users.

| Package | Pinned | Latest | Score | Stars | Notes |
|---------|--------|--------|-------|-------|-------|
| `react` | ^19.2.5 | 19.2.5 | 0.93 | 200K | UI framework. Facebook. |
| `typescript` | ^5.9.3 | **6.0.2** | — | — | **Major available.** Microsoft. |
| `vitest` | ^4.1.4 | 4.1.4 | 0.68 | 7.5K | Test runner. |
| `@vitest/ui` | ^4.1.4 | 4.1.4 | 0.68 | 7.5K | Vitest dashboard. |
| `@playwright/test` | ^1.59.1 | 1.59.1 | 0.80 | 46.7K | E2E testing. Microsoft. |
| `playwright` | ^1.59.1 | 1.59.1 | 0.81 | 46.7K | Browser automation. |
| `oxlint` | ^1.59.0 | 1.59.0 | — | — | Linter. oxc-project. |
| `oxfmt` | ^0.38.0 | **0.44.0** | — | — | **Minor available.** oxc-project. |
| `oxlint-plugin-complexity` | ^2.1.1 | 2.1.1 | — | — | Complexity rules. |
| `oxlint-tsgolint` | ^0.16.0 | **0.20.0** | — | — | **Minor available.** |
| `knip` | ^5.88.1 | **6.4.1** | — | — | **Major available.** Dead code finder. |
| `ink` | ^7.0.0 | 7.0.0 | 0.65 | 18.7K | TUI framework (compat reference). |
| `pino` | ^10.3.1 | 10.3.1 | 0.88 | 10.6K | Logging. |
| `winston` | ^3.19.0 | 3.19.0 | 0.79 | 19.9K | Logging (legacy usage). |
| `ws` | ^8.20.0 | 8.20.0 | 0.97 | 19.3K | WebSocket. Exemplary. |
| `yaml` | ^2.8.3 | 2.8.3 | 0.87 | 802 | YAML parser. |
| `alien-signals` | ^3.1.2 | 3.1.2 | — | — | Reactive signals. johnsoncodehk. |
| `boxen` | ^8.0.1 | 8.0.1 | 0.84 | 1.3K | Box drawing. sindresorhus. |
| `@sinonjs/fake-timers` | ^15.3.2 | 15.3.2 | 0.86 | 723 | Timer mocking. |
| `@total-typescript/ts-reset` | ^0.6.1 | 0.6.1 | — | — | Type patches. Matt Pocock. |
| `type-coverage` | ^2.29.7 | 2.29.7 | 0.56 | 742 | Type coverage reporter. Maint 0.67. |
| `react-devtools-core` | ^7.0.1 | 7.0.1 | 0.86 | 199K | React DevTools. Facebook. |
| `yoga-wasm-web` | ^0.3.3 | 0.3.3 | 0.51 | 98 | Flexbox WASM. Last publish 2023-03. **Stale.** |
| `@types/bun` | ^1.3.12 | 1.3.12 | — | — | DefinitelyTyped. |
| `@types/jscodeshift` | ^17.3.0 | 17.3.0 | — | — | DefinitelyTyped. |
| `@types/mdast` | ^4.0.4 | 4.0.4 | — | — | DefinitelyTyped. |
| `@types/node` | ^25.6.0 | 25.6.0 | — | — | DefinitelyTyped. |
| `@types/react` | ^19.2.14 | 19.2.14 | — | — | DefinitelyTyped. |
| `@types/sinonjs__fake-timers` | ^15.0.1 | 15.0.1 | — | — | DefinitelyTyped. |

## CVE Status (12 remaining — all NEGLIGIBLE for us)

| Package | Advisory Severity | Chain | Our Exposure | Action |
|---------|-------------------|-------|-------------|--------|
| `@chenglou/pretext <=0.0.4` | HIGH | direct | LOW — own UI text only | **Bump to 0.0.5** |
| `vite <=6.4.1` | HIGH + MOD | vitepress/vitest → vite | NEGLIGIBLE — dev only | Wait for upstream |
| `lodash-es <=4.17.23` | HIGH + MOD | mermaid → lodash-es | NEGLIGIBLE — docs diagrams only | Wait for mermaid |
| `hono <4.12.12` | 5x MOD | MCP SDK → hono | NEGLIGIBLE — stdio, not HTTP | Wait for MCP SDK |
| `@hono/node-server <1.19.13` | MOD | MCP SDK → @hono/node-server | NEGLIGIBLE — stdio | Wait for MCP SDK |
| `esbuild <=0.24.2` | MOD | vitepress/vitest → esbuild | NEGLIGIBLE — dev only | Wait for upstream |

## Watch List

Packages to keep an eye on due to low maintenance scores, staleness, or high issue counts.

| Package | Concern | Risk |
|---------|---------|------|
| `yoga-wasm-web` | Last published 2023-03. Score 0.51. | Low — flexily has its own layout engine as fallback. |
| `rrule` | 127 open issues. Last published 2023-11. | Low — stable API, unlikely to need changes. |
| `chrono-node` | 110 open issues. Score 0.67. | Low — date parsing works fine for our use cases. |
| `ulid` | Maintenance score 0.50. | Low — simple API, spec-complete. |
| `@chenglou/pretext` | 1 maintainer, 2 weeks old, no ecosystem. | Medium — sole text measurement dep. Monitor. |

## Major Updates Available

| Package | Current | Latest | Migration Risk |
|---------|---------|--------|----------------|
| `typescript` | 5.9.3 | 6.0.2 | High — major version, needs changelog review |
| `knip` | 5.88.1 | 6.4.1 | Medium — dead code finder, config may change |
| `oxfmt` | 0.38.0 | 0.44.0 | Low — formatter, pre-1.0 but output-only |
| `oxlint-tsgolint` | 0.16.0 | 0.20.0 | Low — lint rules, pre-1.0 |

## Nix Dev Tools

| Package | Flake | nixpkgs Age | Status |
|---------|-------|-------------|--------|
| bun 1.3.11 | km | 1d | current |
| nodejs 22 | km | 1d | current |
| ripgrep | km | 1d | current |
| elixir, pnpm, yarn, gh, docker, awscli2 | workspace | 3d | current |
