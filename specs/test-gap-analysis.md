# Test Gap Analysis

## Current Test Inventory

| Package        | Test Lines | Files | Notes                                                              |
| -------------- | ---------- | ----- | ------------------------------------------------------------------ |
| km-core        | 177        | 1     | recurrence.test.ts                                                 |
| km-markdown    | 2,680      | 2     | roundtrip + markdown tests                                         |
| km-shared      | 551        | 1     | tree.test.ts                                                       |
| km-store       | 3,204      | 8     | path-utils, store, query, cas, node-crud, resolve, links, rebuild  |
| km-tui-core    | 1,961      | 5     | selectors, shellExecutor, commandParser, transformers, treeReducer |
| km-tui-opentui | 458        | 1     | TUI2 component tests                                               |
| km-watch       | 871        | 2     | ignore + sync                                                      |
| km-cli         | 6,382      | 12    | board, cli-unit, cli.slow, detail-pane, layout tests               |

**Total: ~16,000+ lines of test code**

## mdtest Integration Tests

13 mdtest files covering:

- `tests/km.test.md` - CLI happy path
- `apps/km-cli/tests/sh/*.test.md` - 11 files covering:
  - Navigation (j/k/h/l)
  - Key sequences
  - Views (list/columns/tabs)
  - Selection and multi-select
  - Modals (search, help, project picker)
  - Path navigation
  - View controls (fold, collapse, depth)
  - History
  - JSON mode
  - Command mode

## Test Coverage by Layer

| Layer                   | Coverage | Test Type   | Notes                                 |
| ----------------------- | -------- | ----------- | ------------------------------------- |
| Parser (km-markdown)    | High     | Unit        | roundtrip + parsing tests             |
| Store (km-store)        | High     | Integration | node CRUD, sync, rebuild              |
| Sync (km-watch)         | Medium   | Integration | ignore patterns, sync                 |
| State (km-tui-core)     | High     | Unit        | reducer, selectors, transformers      |
| Components (km-cli/tui) | Medium   | Integration | board, layout, detail-pane            |
| CLI                     | High     | mdtest      | comprehensive happy path + edge cases |

## Test Infrastructure

- **Concurrent by default**: bunfig.toml sets concurrent=true
- **Serial for shared state**: Tests with shared temp directories use describe.serial()
- **Fast iteration**: `bun run test:fast` (~4s) excludes slow tests
- **Full suite**: `bun run test:all` runs unit tests + mdtest

## Recommendations

1. **Completed**: mdtest infrastructure for km-sh testing
2. **Completed**: E2E visual testing with ttyd + Playwright
3. **Completed**: Concurrent test execution
4. **Future**: Add more mdtest files for remaining CLI commands
5. **Future**: Visual regression testing with pixelmatch

## Test Commands

```bash
bun run test:fast    # ~4s - fast iteration
bun test             # ~45s - all unit tests
bun run test:all     # ~2min - unit + mdtest
bun run test:mdtest  # Only mdtest files
```
