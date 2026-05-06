---
mentions:
  - km
id: "@km/silvery/examples-import"
aliases:
  - km-silvery.examples-import
  - km-silvery-examples-import
created_by: Bjørn Stabell
created_at: 2026-04-11T22:51:32Z
closed_at: 2026-04-11T22:59:33Z
close_reason: All 40 examples now export main(), CLI uses dynamic import. Commit
  b0551013 in silvery, 39cad524b in km.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.examples-import
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-11T15:51:32Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Examples: switch from spawn to dynamic import @km/silvery #task #P0

blocks:: [[@km/silvery]]

Replace process.execPath spawn with dynamic import() in the examples CLI.

Currently 37 example files use `import.meta.main` guard — the CLI spawns a child process to run them. This is clunky (runtime detection, flags, child process overhead).

Better: export a `main()` function from each example, CLI does `await import(file)` then calls `main()`. Runs in-process, no spawn, no flags, works with any runtime.

## Tasks

- [ ] Add `export async function main()` to all 37 example files
- [ ] Move the `run()` + `waitUntilExit()` call into `main()`
- [ ] Keep `import.meta.main` guard calling `main()` for direct execution
- [ ] Update CLI to `const mod = await import(file); await mod.main()`
- [ ] Remove spawn logic entirely
- [ ] Test: bunx @silvery/examples counter
- [ ] Test: npx @silvery/examples counter

