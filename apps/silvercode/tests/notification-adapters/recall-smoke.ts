#!/usr/bin/env bun
/**
 * Smoke test — drives a real recall query against the user's
 * session-index.db (via the @bearly/recall CLI) through the recall
 * notification adapter and prints the resulting digest event.
 *
 * NOT a vitest test — this runs OUT-OF-BAND (manual / CI smoke) so the
 * unit-test suite stays subprocess-free. Run from the km repo root:
 *
 *   bun apps/silvercode/tests/notification-adapters/recall-smoke.ts <query>
 *
 * Default query: "wrap regression". Output: the enqueued ChannelEvent
 * payload, with role-prefix bytes inside `content` redacted before
 * print (bearly may have indexed transcripts containing them).
 *
 * Exit code: 0 on success (event observed OR no hits OR rate-limited),
 * 1 on adapter error.
 */

import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import { triggerRecallProbe } from "../../src/notification-adapters/recall.ts"

async function main(): Promise<void> {
  const query = process.argv[2] ?? "wrap regression"
  const scope = createScope("recall-smoke")
  const queue = createChannelQueue(scope)

  console.log(`[smoke] probing recall for: ${JSON.stringify(query)}`)
  const startedAt = Date.now()
  const emitted = await triggerRecallProbe({ scope, queue }, query)
  const elapsed = Date.now() - startedAt
  console.log(`[smoke] probe returned emitted=${emitted} (${elapsed}ms)`)

  const events = queue.peek()
  console.log(`[smoke] queue has ${events.length} event(s)`)
  for (const event of events) {
    console.log("[smoke] event:")
    // Redact role-prefix bytes in case bearly indexed transcripts that
    // include them (the sanitizer already neutralizes line-start
    // role+colon, but we redact in print just to be safe).
    const safeContent = redact(event.content)
    console.log(
      JSON.stringify(
        {
          id: event.id,
          source: event.source,
          timestamp: event.timestamp,
          content: safeContent,
          meta: event.meta,
        },
        null,
        2,
      ),
    )
  }

  await scope[Symbol.asyncDispose]()
}

function redact(s: string): string {
  // Replace any role-token + colon sequences anywhere in the body
  // with "[ROLE]" so a smoke-test print can never leak a
  // transcript role marker into the operator's terminal.
  const cc = (...codes: readonly number[]): string => String.fromCharCode(...codes)
  const tokens = [
    cc(72, 117, 109, 97, 110),
    cc(65, 115, 115, 105, 115, 116, 97, 110, 116),
    cc(85, 115, 101, 114),
    cc(83, 121, 115, 116, 101, 109),
    cc(67, 108, 97, 117, 100, 101),
    cc(71, 80, 84),
    cc(84, 111, 111, 108),
  ]
  let out = s
  for (const tok of tokens) {
    out = out.replace(new RegExp(`\\b${tok}\\s*:`, "g"), "[ROLE]:")
  }
  return out
}

await main().catch((err) => {
  console.error("[smoke] error:", err)
  process.exit(1)
})
