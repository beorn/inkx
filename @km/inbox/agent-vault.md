---
mentions:
  - km
  - km
id: "@km/inbox/agent-vault"
aliases:
  - km-agent-vault
  - "@km/_orphan/agent-vault"
created_at: 2026-01-25T08:30:35Z
closed_at: 2026-01-26T00:10:09Z
assignee: km
---

# [x] Convert km-agent package to use Vault API @km/_orphan #task #P1 @km

Convert packages/@km/_orphan/agent to use Vault domain object instead of singleton wrappers.

Files to Convert:

- src/queries.ts (uses queryNodes singleton)

Current code:
import { queryNodes } from "@km/storage"
const nodes = queryNodes("", "agent")

Needs conversion to:

- Accept vault parameter in queryAgents(), getAgent(), getAgentQueue()
- Or require callers to pass vault-retrieved nodes

Pattern options:

1. Pass vault as parameter: queryAgents(vault, filter?)
2. Pass nodes directly: queryAgents(nodes, filter?)
3. Both: queryAgents(vaultOrNodes, filter?)

Recommend: Option 1 (vault parameter) for consistency with other packages.

Depends on: None (parallel with CLI conversions)

