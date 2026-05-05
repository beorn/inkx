/**
 * Shared I/O helpers for bd subcommands.
 *
 * `writeJsonOut`: write a large JSON payload to stdout and append a newline.
 * Plain `console.log` on Bun returns before the write hits the pipe; once the
 * action callback returns and the script exits, multi-MB payloads can be
 * truncated mid-string when stdout is a pipe (jq fails with
 * "Unfinished string at EOF"). The async stream callback fires only after
 * Node has handed every byte to the kernel, so the producer can't exit early.
 * See list-json-malformed.
 *
 * Extracted from `bd.ts` so every bd-* action handler that emits --json can
 * share the back-pressure-safe writer without duplicating the boilerplate.
 */

export async function writeJsonOut(value: unknown): Promise<void> {
  const out = JSON.stringify(value, null, 2) + "\n"
  // process.stdout is a Writable stream; honour back-pressure so a slow
  // consumer (jq, less, head -c N) doesn't drop bytes when the script
  // exits. Awaiting the callback waits until Node confirms the write.
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(out, (err) => (err ? reject(err) : resolve()))
  })
}
