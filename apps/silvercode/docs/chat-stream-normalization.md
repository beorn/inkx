# Chat Stream Normalization

Provider chunks are transport deltas. Silvercode normalizes them into
`ChatEvent` records before projection, and projection never stitches raw chunks.

## Contract

- `text-delta` and `thinking-delta` become `message.block.added` events.
- Adjacent deltas coalesce only when they share session, message, block type,
  provider kind, and provider `blockIndex`.
- Coalescing preserves every raw event in `rawRefs` and every contributing event
  id in the canonical `Block.eventIds`.
- Tool, permission, plan, status, notification, and debug events interrupt text
  coalescing. They are lifecycle events, not prose chunks.
- Aggregate provider rows, such as replayed assistant messages, keep semantic
  block boundaries. They do not merge separate provider blocks into one prose
  block.
- Duplicate provider ids are uniquified at the `ChatEvent`/`Block` layer while
  preserving raw provenance for the traffic log.
- Late chunks after a completed message are ignored by `ChatTree` projection and
  remain inspectable through raw refs/debug surfaces.

## Provider Mapping

- Claude stream-json: maps streaming text and thought chunks into delta events.
- Codex rollout replay: maps raw provider items into canonical `AgentEvent`
  shapes before this layer.
- ACP/opencode: maps `agent_message_chunk` and `agent_thought_chunk` through the
  ACP boundary into the same delta contract.
- Fake providers: must emit the same canonical events so contract tests exercise
  every backend without special UI cases.
