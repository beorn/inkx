---
id: "@km/silvery/cli-output"
aliases:
  - km-silvery.cli-output
  - km-silvery-cli-output
created_by: claude:4929065a
created_at: 2026-04-02T15:15:59Z
owner: bjorn@stabell.org
---

# [ ] @silvery/cli: three-stream output model (data/status/log) with React components @km/silvery #feature #P2

Design a CLI output abstraction for silvery that separates data output from status/progress messages. Inspired by kimmi's three-stream architecture (ADR-006).

Streams:
- Data (stdout) — clean for piping, React <Data> component
- Status (stderr, styled) — human feedback, <Status> component  
- Log (stderr, structured) — debug/verbose, loggily integration

Features:
- Verbosity levels (-q, default, -v, -vv)
- Pipe detection (suppress status when piped)
- Semantic tokens ($success, $error, $muted)
- Works with @silvery/commander

Needs more design — get /pro input on the API surface.
See kimmi's ADR-006 at pim/kimmi/docs/decisions/006-cli-output-architecture.md