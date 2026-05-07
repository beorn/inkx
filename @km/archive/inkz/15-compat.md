---
mentions:
  - km
id: "@km/inkz/15-compat"
aliases:
  - km-inkz.15-compat
  - km-inkz-15-compat
created_at: 2026-01-19T12:02:52Z
closed_at: 2026-01-19T15:04:19Z
---

# [x] InkZ: Verify drop-in compatibility against real Ink projects @km/inkz #task #P3

## Goal

Test that InkZ works as a drop-in replacement for Ink by running it against several real-world Ink codebases.

## Approach

1. **Find test subjects** - identify 3-5 popular/representative Ink projects:
- ink-cli examples from the Ink repo itself
- pastel (Ink-based CLI framework)
- ink-testing-library examples
- Real apps: gatsby-cli, npm-check, etc.
7. **Create test harness**:
- Script that clones each project
- Replaces import ... from 'ink' with import ... from 'inkz'
- Runs the project's tests (if any)
- Compares output to original Ink version
13. **Track compatibility**:
- Document which APIs work identically
- Document which APIs have intentional differences
- Document any bugs found

## Success Criteria

- [ ] All Ink examples render identically (minus intentional improvements)
- [ ] No runtime errors from API mismatches
- [ ] Test suites pass (where applicable)

