---
id: "@km/infra/legacy-broken-publishes"
aliases:
  - km-infra.legacy-broken-publishes
  - km-infra-legacy-broken-publishes
created_by: Bjørn Stabell
created_at: 2026-04-12T04:11:26Z
closed_at: 2026-04-12T06:04:35Z
close_reason: >-
  All 21 packages converted to tsdown+dist pattern across 4 submodules:

  - termless (15 packages, commit 260d364): @termless/core + test + cli + 12
  backends. Core has 4 subpath exports (registry/svg/png), test has 3
  (matchers/fixture), cli has publishConfig.bin.

  - vterm (3 packages, commit 8edcf67): vt100.js/vt220.js/vterm.js. Zero subpath
  exports.

  - watcher-chaos (commit df5b02ac2): @beorn/watcher-chaos. Single entry.

  - bearly (commit 50f3d22): vitepress-enrich (added access:public),
  claude-tty-mcp (full conversion with publishConfig.bin).

  km root commit b996ec605 updates all 4 submodule pointers. Version bumps +
  actual publishing deferred to /release run.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.legacy-broken-publishes
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T21:11:27Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Legacy broken publishes — termless, vterm, watcher-chaos, vitepress-enrich ship raw .ts @km/infra #bug #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

bun release verify found systemic broken publishes from BEFORE this session — packages that shipped raw .ts source and break on Node.js (no type stripping in node_modules):

## Broken in Node.js (works in Bun)
- All 15 @termless/* packages (core, cli, test, peekaboo, alacritty, vt220, ghostty-native, wezterm, xtermjs, vt100, kitty, vt100-rust, vterm, ghostty, libvterm)
- vt100.js, vt220.js, vterm.js
- @beorn/watcher-chaos
- vitepress-enrich (subpath exports broken — ./seo, ./validate, ./terminal-glossary point to non-existent dist files)
- claude-tty-mcp (install crash)

## Why these are broken
They ship raw .ts source via files: ['src'] without tsdown build. Node.js can't strip TypeScript types in node_modules (only in user code with --experimental-transform-types). So 'import termless from "@termless/core"' fails on any Node.js install.

## Fix pattern
Each package needs:
1. tsdown config in package.json
2. files: ['dist']
3. publishConfig.exports → dist/*.mjs
4. Bump version, build, publish, verify

## How to do this
For each repo, run 'bun release verify <pkg>' to confirm it's broken.
Convert package.json to tsdown pattern (see vendor/loggily/package.json or vendor/vimonkey/package.json after this session's hotfix).
Build, publish, verify.

## Reference
- Found by: bun release verify (added in this session)
- Fix pattern: vimonkey 0.2.3 (commit 1424194 in vendor/vimonkey)
- Why these existed: 'tsdown was added to silvery first, before being rolled out to other vendor packages' — most legacy packages still ship .ts source.