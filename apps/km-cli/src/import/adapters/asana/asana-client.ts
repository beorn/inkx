import { createTerm } from "@silvery/ag-react"
import { ASANA_BASE } from "./asana-types.ts"
import type { RecordedCall } from "./asana-types.ts"

const term = createTerm(process)

/**
 * Adaptive rate-limited Asana API client.
 *
 * Uses AIMD (additive increase, multiplicative decrease):
 * - Starts at ~17 req/s (60ms delay)
 * - On 429: halves rate limit, waits Retry-After, all concurrent requests share one gate
 * - On success: slowly increases rate toward ceiling
 * - Rejected requests still count against Asana's quota, so avoiding 429s is critical
 */
export class AsanaClient {
  /** Current delay between requests (ms). Starts at ~17 req/s. */
  private delayMs = 60
  /** Minimum delay (ceiling rate ~20 req/s, well under 1500/min paid limit). */
  private minDelayMs = 50
  /** Shared gate: when rate-limited, all requests wait on this single promise */
  private rateLimitGate: Promise<void> | null = null
  /** Semaphore: serialize requests to enforce delay between them */
  private queue: Promise<void> = Promise.resolve()
  /** Recorded API responses (when recording is enabled) */
  readonly recorded: RecordedCall[] = []

  constructor(
    private token: string,
    private record = false,
    /** Initial delay between requests in ms. 0 for tests. */
    initialDelayMs?: number,
  ) {
    if (initialDelayMs !== undefined) {
      this.delayMs = initialDelayMs
      this.minDelayMs = initialDelayMs
    }
  }

  /** Low-level GET: returns data + pagination offset */
  private async getRaw<T>(path: string, params?: Record<string, string>): Promise<{ data: T; nextOffset?: string }> {
    const url = new URL(`${ASANA_BASE}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    let lastError: Error | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      // Wait for shared rate-limit gate (if 429 in flight)
      if (this.rateLimitGate) await this.rateLimitGate

      // Serialize: wait for previous request's delay
      await this.enqueue()

      try {
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${this.token}` },
        })

        if (res.status === 401) {
          throw new Error("Authentication failed. Run 'km import setup asana' to configure your token.")
        }

        if (res.status === 429) {
          // AIMD: multiplicative decrease — double the delay
          this.delayMs = Math.min(this.delayMs * 2, 10000)

          // Only one request sets the gate; others wait on it
          if (!this.rateLimitGate) {
            const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10)
            console.log(
              term.yellow(
                `  Rate limited, waiting ${retryAfter}s (slowing to ${(1000 / this.delayMs).toFixed(1)} req/s)...`,
              ),
            )
            this.rateLimitGate = sleep(retryAfter * 1000).then(() => {
              this.rateLimitGate = null
              return undefined
            })
          }
          await this.rateLimitGate
          attempt-- // Don't count rate-limit waits as retries
          continue
        }

        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Asana API error ${res.status}: ${body}`)
        }

        // AIMD: additive increase — reduce delay slightly on success
        this.delayMs = Math.max(this.minDelayMs, this.delayMs - 10)

        const json = (await res.json()) as {
          data: T
          next_page?: { offset: string } | null
        }

        if (this.record) {
          this.recorded.push({ path, params, response: json.data })
        }

        return { data: json.data, nextOffset: json.next_page?.offset }
      } catch (err) {
        lastError = err as Error
        if ((err as Error).message.includes("Authentication failed")) throw err
        const backoff = Math.min(30000, 1000 * Math.pow(2, attempt))
        console.log(term.dim(`  Retry in ${backoff / 1000}s: ${(err as Error).message}`))
        await sleep(backoff)
      }
    }
    throw lastError ?? new Error("Request failed after retries")
  }

  /** Single-page GET, returns just the data */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const result = await this.getRaw<T>(path, params)
    return result.data
  }

  /** Paginated GET — fetches all pages and concatenates results */
  async getAll<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const all: T[] = []
    let offset: string | undefined
    do {
      const p = { ...params }
      if (offset) p.offset = offset
      const result = await this.getRaw<T[]>(path, p)
      all.push(...result.data)
      offset = result.nextOffset
    } while (offset)
    return all
  }

  /** Enqueue: each request waits for the previous one's delay to elapse */
  private enqueue(): Promise<void> {
    const prev = this.queue
    this.queue = prev.then(() => sleep(this.delayMs))
    return prev
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
