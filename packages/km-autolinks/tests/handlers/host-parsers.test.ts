/**
 * Per-host URL parser tests — exercise `parseGithubUrl`, `parseGistUrl`,
 * `parseJiraUrl`, `parseLinearUrl` directly, plus the end-to-end body output
 * via the registered `httpsHandler`. Pattern-only — no HTTP fetching.
 *
 * Bead: km-silvercode.url-host-handlers
 */

import { describe, expect, test } from "vitest"
import {
  formatGistInfo,
  formatGithubInfo,
  formatJiraInfo,
  formatLinearInfo,
  httpsHandler,
  looksLikeJiraHost,
  parseGistUrl,
  parseGithubUrl,
  parseJiraUrl,
  parseLinearUrl,
} from "../../../src/autolinks/handlers/https.ts"
import type { ResolveCtx } from "../../../src/autolinks/handlers/index.ts"

const CTX: ResolveCtx = { cacheKey: "k" }

function bodyOf(uri: string): string {
  const outcome = httpsHandler.resolve(new URL(uri), CTX)
  if (outcome.result.kind !== "ok") throw new Error(`unexpected error: ${outcome.result.message}`)
  return outcome.result.body
}

describe("parseGithubUrl + GitHub host integration", () => {
  test("repo: org/owner shapes", () => {
    expect(parseGithubUrl(new URL("https://github.com/foo/bar"))).toEqual({ kind: "repo", owner: "foo", repo: "bar" })
    expect(parseGithubUrl(new URL("https://github.com/dotnet/runtime"))).toEqual({
      kind: "repo",
      owner: "dotnet",
      repo: "runtime",
    })
    // Trailing slash tolerated.
    expect(parseGithubUrl(new URL("https://github.com/anthropics/claude-code/"))).toEqual({
      kind: "repo",
      owner: "anthropics",
      repo: "claude-code",
    })
  })

  test("PR: /pull/<n> across owners", () => {
    expect(parseGithubUrl(new URL("https://github.com/foo/bar/pull/123"))).toEqual({
      kind: "pull",
      owner: "foo",
      repo: "bar",
      number: "123",
    })
    expect(parseGithubUrl(new URL("https://github.com/dotnet/runtime/pull/9999"))).toEqual({
      kind: "pull",
      owner: "dotnet",
      repo: "runtime",
      number: "9999",
    })
    expect(parseGithubUrl(new URL("https://github.com/anthropics/claude-code/pull/42"))).toEqual({
      kind: "pull",
      owner: "anthropics",
      repo: "claude-code",
      number: "42",
    })
  })

  test("issue: /issues/<n> across owners", () => {
    expect(parseGithubUrl(new URL("https://github.com/foo/bar/issues/7"))).toEqual({
      kind: "issue",
      owner: "foo",
      repo: "bar",
      number: "7",
    })
    expect(parseGithubUrl(new URL("https://github.com/dotnet/runtime/issues/100000"))).toEqual({
      kind: "issue",
      owner: "dotnet",
      repo: "runtime",
      number: "100000",
    })
    expect(parseGithubUrl(new URL("https://github.com/microsoft/vscode/issues/1"))).toEqual({
      kind: "issue",
      owner: "microsoft",
      repo: "vscode",
      number: "1",
    })
  })

  test("file: /blob/<branch>/<path> across shapes", () => {
    expect(parseGithubUrl(new URL("https://github.com/foo/bar/blob/main/README.md"))).toEqual({
      kind: "file",
      owner: "foo",
      repo: "bar",
      branch: "main",
      path: "README.md",
    })
    expect(parseGithubUrl(new URL("https://github.com/foo/bar/blob/release/1.x/src/index.ts"))).toEqual({
      kind: "file",
      owner: "foo",
      repo: "bar",
      branch: "release",
      path: "1.x/src/index.ts",
    })
    expect(parseGithubUrl(new URL("https://github.com/dotnet/runtime/blob/main/src/libraries/System.IO/README.md"))).toEqual({
      kind: "file",
      owner: "dotnet",
      repo: "runtime",
      branch: "main",
      path: "src/libraries/System.IO/README.md",
    })
  })

  test("falls back when path doesn't match any shape", () => {
    // Marketplace, settings, etc. — host matched but path doesn't fit.
    expect(parseGithubUrl(new URL("https://github.com/marketplace"))).toBeNull()
    // /pull/ with non-numeric tail
    expect(parseGithubUrl(new URL("https://github.com/foo/bar/pull/abc"))).toBeNull()
    // /issues/ without a number
    expect(parseGithubUrl(new URL("https://github.com/foo/bar/issues"))).toBeNull()
    // /blob/ without a path component
    expect(parseGithubUrl(new URL("https://github.com/foo/bar/blob/main"))).toBeNull()
  })

  test("formatGithubInfo body strings", () => {
    expect(formatGithubInfo({ kind: "repo", owner: "foo", repo: "bar" })).toBe("GitHub repo: foo/bar")
    expect(formatGithubInfo({ kind: "pull", owner: "foo", repo: "bar", number: "1" })).toBe(
      "GitHub PR #1\nin foo/bar",
    )
    expect(formatGithubInfo({ kind: "issue", owner: "foo", repo: "bar", number: "2" })).toBe(
      "GitHub issue #2\nin foo/bar",
    )
    expect(formatGithubInfo({ kind: "file", owner: "foo", repo: "bar", branch: "main", path: "x/y.ts" })).toBe(
      "GitHub file: x/y.ts\n@main in foo/bar",
    )
  })

  test("end-to-end body via httpsHandler — repo, PR, issue, file", () => {
    expect(bodyOf("https://github.com/foo/bar")).toBe("GitHub repo: foo/bar")
    expect(bodyOf("https://github.com/foo/bar/pull/123")).toBe("GitHub PR #123\nin foo/bar")
    expect(bodyOf("https://github.com/foo/bar/issues/7")).toBe("GitHub issue #7\nin foo/bar")
    expect(bodyOf("https://github.com/foo/bar/blob/main/src/x.ts")).toBe(
      "GitHub file: src/x.ts\n@main in foo/bar",
    )
  })

  test("unmatched github.com path falls through to generic webcard", () => {
    const body = bodyOf("https://github.com/marketplace")
    expect(body).toContain("https://github.com/marketplace")
    expect(body).toMatch(/webcard fetch not yet implemented/i)
  })
})

describe("parseGistUrl + Gist host integration", () => {
  test("gist: /<user>/<id> shapes", () => {
    expect(parseGistUrl(new URL("https://gist.github.com/octocat/abc123"))).toEqual({
      kind: "gist",
      user: "octocat",
      id: "abc123",
    })
    expect(parseGistUrl(new URL("https://gist.github.com/foo/deadbeef0123"))).toEqual({
      kind: "gist",
      user: "foo",
      id: "deadbeef0123",
    })
    expect(parseGistUrl(new URL("https://gist.github.com/anthropics/cafe1234/"))).toEqual({
      kind: "gist",
      user: "anthropics",
      id: "cafe1234",
    })
  })

  test("formatGistInfo body string", () => {
    expect(formatGistInfo({ kind: "gist", user: "octocat", id: "abc" })).toBe("GitHub Gist by octocat")
  })

  test("end-to-end body via httpsHandler", () => {
    expect(bodyOf("https://gist.github.com/octocat/abc123")).toBe("GitHub Gist by octocat")
  })

  test("non-matching gist path falls through to generic webcard", () => {
    const body = bodyOf("https://gist.github.com/discover")
    expect(body).toContain("https://gist.github.com/discover")
    expect(body).toMatch(/webcard fetch not yet implemented/i)
  })
})

describe("parseJiraUrl + JIRA host integration", () => {
  test("looksLikeJiraHost matches atlassian.net + /jira/i", () => {
    expect(looksLikeJiraHost("acme.atlassian.net")).toBe(true)
    expect(looksLikeJiraHost("foo-bar.atlassian.net")).toBe(true)
    expect(looksLikeJiraHost("jira.acme.com")).toBe(true)
    expect(looksLikeJiraHost("internal-jira.example.org")).toBe(true)
    expect(looksLikeJiraHost("MyJira.example.com")).toBe(true)
    expect(looksLikeJiraHost("github.com")).toBe(false)
    expect(looksLikeJiraHost("example.com")).toBe(false)
  })

  test("atlassian.net /browse/<KEY>-<n> shapes", () => {
    expect(parseJiraUrl(new URL("https://acme.atlassian.net/browse/PROJ-123"))).toEqual({
      kind: "jira",
      host: "acme.atlassian.net",
      key: "PROJ",
      number: "123",
    })
    expect(parseJiraUrl(new URL("https://foo.atlassian.net/browse/A-1"))).toEqual({
      kind: "jira",
      host: "foo.atlassian.net",
      key: "A",
      number: "1",
    })
    expect(parseJiraUrl(new URL("https://team-x.atlassian.net/browse/INFRA-9999"))).toEqual({
      kind: "jira",
      host: "team-x.atlassian.net",
      key: "INFRA",
      number: "9999",
    })
  })

  test("self-hosted /jira/ regex match — /browse/<KEY>-<n>", () => {
    expect(parseJiraUrl(new URL("https://jira.acme.com/browse/PROJ-7"))).toEqual({
      kind: "jira",
      host: "jira.acme.com",
      key: "PROJ",
      number: "7",
    })
    expect(parseJiraUrl(new URL("https://internal-jira.example.org/browse/CORE-42"))).toEqual({
      kind: "jira",
      host: "internal-jira.example.org",
      key: "CORE",
      number: "42",
    })
  })

  test("falls back when JIRA path is wrong", () => {
    // /browse/ without a KEY-<n> tail
    expect(parseJiraUrl(new URL("https://acme.atlassian.net/browse/notakey"))).toBeNull()
    // Missing /browse/
    expect(parseJiraUrl(new URL("https://acme.atlassian.net/issues/PROJ-1"))).toBeNull()
  })

  test("formatJiraInfo body string", () => {
    expect(formatJiraInfo({ kind: "jira", host: "acme.atlassian.net", key: "PROJ", number: "1" })).toBe(
      "JIRA PROJ-1\n(acme.atlassian.net)",
    )
  })

  test("end-to-end body via httpsHandler", () => {
    expect(bodyOf("https://acme.atlassian.net/browse/PROJ-123")).toBe("JIRA PROJ-123\n(acme.atlassian.net)")
    expect(bodyOf("https://jira.acme.com/browse/CORE-7")).toBe("JIRA CORE-7\n(jira.acme.com)")
  })

  test("JIRA host with non-/browse path falls through to generic webcard", () => {
    const body = bodyOf("https://acme.atlassian.net/wiki/spaces/HOME")
    expect(body).toContain("https://acme.atlassian.net/wiki/spaces/HOME")
    expect(body).toMatch(/webcard fetch not yet implemented/i)
  })
})

describe("parseLinearUrl + Linear host integration", () => {
  test("with-slug: /<workspace>/issue/<id>/<slug>", () => {
    expect(parseLinearUrl(new URL("https://linear.app/silvery/issue/SIL-123/fix-the-thing"))).toEqual({
      kind: "linear",
      workspace: "silvery",
      id: "SIL-123",
      slug: "fix-the-thing",
    })
    expect(
      parseLinearUrl(new URL("https://linear.app/team-foo/issue/FOO-1/add-new-feature-with-many-words")),
    ).toEqual({
      kind: "linear",
      workspace: "team-foo",
      id: "FOO-1",
      slug: "add-new-feature-with-many-words",
    })
  })

  test("without-slug: /<workspace>/issue/<id>", () => {
    expect(parseLinearUrl(new URL("https://linear.app/silvery/issue/SIL-7"))).toEqual({
      kind: "linear",
      workspace: "silvery",
      id: "SIL-7",
      slug: null,
    })
  })

  test("falls back when path is wrong", () => {
    // Missing /issue/
    expect(parseLinearUrl(new URL("https://linear.app/silvery/team/SIL-1"))).toBeNull()
    // ID doesn't match WORK-<n>
    expect(parseLinearUrl(new URL("https://linear.app/silvery/issue/notanid"))).toBeNull()
    // Just the workspace
    expect(parseLinearUrl(new URL("https://linear.app/silvery"))).toBeNull()
  })

  test("formatLinearInfo body strings", () => {
    expect(formatLinearInfo({ kind: "linear", workspace: "silvery", id: "SIL-1", slug: null })).toBe(
      "Linear SIL-1\nin silvery",
    )
    expect(
      formatLinearInfo({ kind: "linear", workspace: "silvery", id: "SIL-1", slug: "fix-the-thing" }),
    ).toBe("Linear SIL-1\nFix The Thing\nin silvery")
  })

  test("end-to-end body via httpsHandler", () => {
    expect(bodyOf("https://linear.app/silvery/issue/SIL-1/fix-the-thing")).toBe(
      "Linear SIL-1\nFix The Thing\nin silvery",
    )
    expect(bodyOf("https://linear.app/silvery/issue/SIL-7")).toBe("Linear SIL-7\nin silvery")
  })

  test("non-matching linear path falls through to generic webcard", () => {
    const body = bodyOf("https://linear.app/silvery/team/SIL")
    expect(body).toContain("https://linear.app/silvery/team/SIL")
    expect(body).toMatch(/webcard fetch not yet implemented/i)
  })
})

describe("generic webcard fallback", () => {
  test("unknown host returns the generic placeholder", () => {
    const body = bodyOf("https://example.com/some/path")
    expect(body).toContain("https://example.com/some/path")
    expect(body).toContain("host: example.com")
    expect(body).toContain("path: /some/path")
    expect(body).toMatch(/webcard fetch not yet implemented/i)
  })

  test("random URL hits the default placeholder", () => {
    const body = bodyOf("https://random.example.org/")
    expect(body).toContain("https://random.example.org/")
    expect(body).toMatch(/webcard fetch not yet implemented/i)
  })
})
