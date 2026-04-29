---
id: "@km/cli/segfault-memory-mode"
aliases:
  - km-cli.segfault-memory-mode
  - km-cli-segfault-memory-mode
created_by: claude:8b5b9e1c
created_at: 2026-04-20T17:38:31Z
owner: bjorn@stabell.org
---

# [ ] km view segfaults on non-vault cwd (memory mode) @km/cli #bug #P2

Running 'km view' with no args from a non-vault directory (e.g., the km codebase itself at ~/Code/pim/km) enters memory mode on cwd, walks ~thousands of files, hits 4.68GB RSS, then Bun segfaults after 62s with repeating-pattern memory addr (0x23CB23CA23C923C8). Current behavior: program.ts:240-241 warns but proceeds. Fix: error out cleanly when no explicit --repo/KM_ROOT AND no .km/ detected — prevent the memory-mode-on-huge-tree path.