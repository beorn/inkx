---
mentions:
  - km
  - claude
id: "@km/inbox/nwkfh"
aliases:
  - km-nwkfh
  - "@km/_orphan/nwkfh"
created_by: claude:825fd398
created_at: 2026-03-22T07:02:02Z
closed_at: 2026-03-22T07:27:34Z
close_reason: "First run complete: +33.4% bench geomean, -5.5% profile. 12
  experiments, 10 kept. Branch: autoresearch/mar21"
owner: bjorn@stabell.org
assignee: claude:825fd398
---

# [x] Autoresearch: autonomous perf optimization loop @km/_orphan #feature #P2 @claude:825fd398

Port Karpathy's autoresearch pattern to km. AI agent autonomously modifies code, runs benchmarks, keeps improvements, discards regressions. Multi-metric: primary=perf, guardrails=tests+lint+complexity+code-size. program.md instructs the agent.

