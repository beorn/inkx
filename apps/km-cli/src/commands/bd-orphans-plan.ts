/**
 * Pure planner for `bd orphans` — find open beads referenced in recent
 * commit messages (i.e. work that's been implemented but not formally
 * closed).
 *
 * Splits the I/O (git log, repo load, terminal output) from the pure
 * matching logic so unit tests can exercise the regex contract without
 * touching git or the silvery import chain.
 *
 * Acceptance contract:
 *   - Match the canonical bd id as a whole word (no `\b` since `.` isn't
 *     a word char). Escape regex metacharacters in the id (`.`, `*`, `+`,
 *     `?`, `^`, `$`, `{`, `}`, `(`, `)`, `|`, `[`, `]`, `\`).
 *   - Look-around guards `(?<![\w-])` / `(?![\w-])` reject prefix/suffix
 *     letters/digits/underscores/dashes — `km-foo-bar` matches `km-foo`
 *     only as the whole id.
 */

export interface CommitEntry {
  /** Commit SHA. */
  readonly sha: string
  /** Full commit body (subject + body, separated by blank line). */
  readonly body: string
}

export interface IssueLike {
  readonly id: string
}

export interface Orphan<I extends IssueLike> {
  readonly issue: I
  /** SHAs of every matching commit, in input order. */
  readonly commits: string[]
}

/**
 * Parse the `git log --since=Nd --format=%H%x00%B%x1e` raw output into
 * `(sha, body)` pairs. Splitter is `\x1e` (record separator) at the end
 * of each commit; SHA and body within a record are split by `\x00` (NUL).
 *
 * Empty entries (trailing newlines after the final record) are dropped.
 */
export function parseGitLog(log: string): CommitEntry[] {
  return log
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, ...rest] = entry.split("\x00")
      return { sha: (sha ?? "").trim(), body: rest.join("\x00").trim() }
    })
}

/**
 * For every issue, find the commits whose body mentions the issue's
 * canonical bd id. Returns only issues with at least one matching commit
 * (i.e., the orphans).
 */
export function findOrphans<I extends IssueLike>(issues: readonly I[], commits: readonly CommitEntry[]): Orphan<I>[] {
  const orphans: Orphan<I>[] = []
  for (const issue of issues) {
    // Match the canonical bd id as a whole word — `\b` doesn't treat `.`
    // as a word char, so `km-foo.bar` ends after `bar`. Escape regex
    // metacharacters in the id (the `.` segment separator most importantly).
    const pattern = new RegExp(`(?<![\\w-])${issue.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`)
    const matched = commits.filter((c) => pattern.test(c.body))
    if (matched.length > 0) {
      orphans.push({ issue, commits: matched.map((c) => c.sha) })
    }
  }
  return orphans
}
