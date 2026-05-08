# Streaming Marshalling

Silvercode treats streaming output as three separate layers. Do not collapse these layers into one "block" concept.

```text
provider bytes / deltas
  -> text runs
  -> semantic content blocks
  -> Markdown display blocks
  -> UI rows / leaves
```

## Contract

1. Text deltas are byte fragments.
   A `text-delta` is only "more text arrived". It is not a paragraph boundary, a Markdown block boundary, or a UI row boundary.

2. Text deltas concatenate exactly.
   No layer may infer whitespace, blank lines, headings, list starts, or paragraph breaks from two adjacent chunks. This is unsafe because providers can split anywhere, including inside Markdown syntax:

   ```markdown
   [parse.ts](/Users/beorn/Code/pim/km/apps/silvercode/packages/agent-harness/src/parse.ts: 572)
   ```

   The correct reconstructed text is:

   ```markdown
   [parse.ts](/Users/beorn/Code/pim/km/apps/silvercode/packages/agent-harness/src/parse.ts:572)
   ```

3. Semantic content blocks come from the provider, not from chunk timing.
   Claude stream-json `content_block_start` / `content_block_stop` and aggregate `assistant-message.content[]` are semantic block boundaries. ACP `agent_message_chunk` without a provider block id is a text run, not a block.

4. Markdown display blocks come from parsing complete text.
   `MarkdownView` owns paragraph/list/table/code/link interpretation. Upstream stream marshalling must feed it exact text and let the parser decide where paragraphs and links are.

5. UI rows are projection decisions.
   The ChatTree path may turn a semantic text block into one or more visible leaves, but it must not create a visible leaf per provider delta. Rendered prose is coalesced before Markdown parsing.

## OpenACP Comparison

OpenACP's messaging adapters use a draft-buffer model: every text chunk appends to one in-flight buffer, and the adapter edits the platform message in place until the turn finalizes. It splits only for platform limits, after the full text is known.

Silvercode differs because it also needs structured terminal projection, hoverable tools, notifications, and per-turn activity. The equivalent invariant is still the same:

```text
stream chunks are append-only bytes;
display structure is derived later.
```

## Implementation Points

- `apps/silvercode/packages/agent-harness/src/parse.ts`
  maps Claude stream-json `content_block_delta` to `text-delta` with the provider `blockIndex`.

- `apps/silvercode/packages/agent-harness/src/acp-client.ts`
  maps ACP `agent_message_chunk` to `text-delta`. ACP chunks do not provide a reliable content-block index, so they share one text run for the active message unless a stronger provider id is available.

- `apps/silvercode/packages/agent-harness/src/session-reducer.ts`
  keeps replayed provider aggregate text blocks as separate `MessageOp` entries marked with `boundary: "semantic"`. Live `text-delta` ops are unmarked transport chunks and are eligible for exact coalescing.

- `apps/silvercode/packages/agent-harness/src/session-types.ts`
  exposes `messageTextFromOps()` so legacy `.text` projections preserve semantic text boundaries with explicit blank lines instead of raw string gluing.

- `apps/silvercode/src/chat/normalize-agent-event.ts`
  coalesces adjacent `text-delta` events for the same message into one `message.block.added` ChatEvent. This prevents the ChatTree renderer from turning packet boundaries into visible rows.

- `apps/silvercode/src/components/MarkdownView.tsx`
  parses the reconstructed text into Markdown blocks and inline spans.

## Regression Tests

- `apps/silvercode/tests/chat-agent-event-normalization.test.ts`
  verifies adjacent text deltas become one exact Chat text block, tool boundaries stop coalescing, and provider aggregate text blocks remain separate semantic blocks.

- `apps/silvercode/tests/chat-message-summary.test.tsx`
  verifies a Markdown file link split between `:`
  and the line number still renders as a Markdown link instead of raw `[text](href)` syntax, while explicit semantic text blocks do not collapse into one paragraph.

## Anti-Patterns

- Do not key visible text blocks by `Date.now()` per delta.
- Do not insert `\n` or `\n\n` between text chunks based on capitalization or punctuation.
- Do not split Markdown before reassembling provider chunks.
- Do not use a provider's transport packet boundary as a UI row boundary.
- Do not repair malformed Markdown by mutating the stream. Preserve text and improve the parser or renderer instead.
