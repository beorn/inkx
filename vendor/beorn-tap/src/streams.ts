import { Readable } from "node:stream"

/**
 * Converts a Web ReadableStream (Bun) to a Node.js Readable stream.
 *
 * @param webStream - Bun's ReadableStream<Uint8Array>
 * @returns Node.js Readable stream compatible with tap-parser and mergeStreams
 */
export function webStreamToNodeStream(
  webStream: ReadableStream<Uint8Array>,
): Readable {
  const reader = webStream.getReader()
  const decoder = new TextDecoder()

  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read()
        if (done) {
          this.push(null)
        } else {
          this.push(decoder.decode(value, { stream: true }))
        }
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)))
      }
    },
  })
}
