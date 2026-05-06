---
aliases:
  - km-cli.bd-agent-collapse-or-delete
  - km-cli-bd-agent-collapse-or-delete
created_at: 2026-05-06T17:13:25.009Z
---

# Collapse or delete bd-agent.ts (281 LOC) — duplicates km agent surface. Both bd agent ls/show/queue/assign/unassign/claim and km agent's equivalents call into @km/agent package primitives (queryAgents, getAgent, getAgentQueue, assignIssueFields, unassignIssueFields, claimIssueFields). Verify km agent has feature parity for all 6 bd-agent subcommands. If yes: delete bd-agent.ts + drop bdAgentCommand from bd.ts (281 LOC saved). If no: collapse to thin shims delegating to km agent (~80 LOC). #P3
