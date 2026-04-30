---
id: "@km/inbox/yq1t"
aliases:
  - km-yq1t
  - "@km/_orphan/yq1t"
created_at: 2026-01-20T14:30:50Z
closed_at: 2026-01-20T14:51:47Z
---

# [x] mdtest: Split index.ts into focused modules @km/_orphan #task #P3

Medium: index.ts is 720 lines with 5+ responsibilities mixed together.

**Current responsibilities:**
1. CLI setup & argument parsing (lines 108-178)
2. Global state management (lines 178-200)
3. Block execution logic (runBlock, lines 202-301)
4. Hook management (callHookIfExists, lines 303-315)
5. File processing & snapshots (testFile, lines 317-674)
6. Main orchestration (main, lines 684-709)

**Proposed split:**
- src/cli.ts - Command setup, argument parsing (~70 lines)
- src/executor.ts - Block execution logic (~100 lines)
- src/fileProcessor.ts - File reading, snapshot updates (~250 lines)
- src/index.ts - CLI entry point, main() orchestration (~100 lines)

**Benefits:**
- Easier to test individual components
- Clearer ownership of functionality
- Easier to maintain

**File:**
- vendor/beorn-mdtest/src/index.ts