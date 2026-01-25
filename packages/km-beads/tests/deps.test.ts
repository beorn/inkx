import { describe, test, expect } from "bun:test"
import {
  addDependency,
  removeDependency,
  getDependencies,
  dependsOn,
  mergeDepProps,
} from "../src/deps.ts"
import type { Issue } from "../src/types.ts"

describe("addDependency", () => {
  test("adds first dependency", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = addDependency(issue, "km-xyz9")

    expect(result.props["blocked-by"]).toEqual({
      type: "link",
      target: "km-xyz9",
    })
    expect(result.propsRaw["blocked-by"]).toBe("[[km-xyz9]]")
  })

  test("adds second dependency creates list", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      blockedBy: ["km-xyz9"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = addDependency(issue, "km-def4")

    expect(result.props["blocked-by"]).toEqual({
      type: "list",
      values: [
        { type: "link", target: "km-xyz9" },
        { type: "link", target: "km-def4" },
      ],
    })
    expect(result.propsRaw["blocked-by"]).toBe("[[km-xyz9]], [[km-def4]]")
  })

  test("does not add duplicate dependency", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      blockedBy: ["km-xyz9"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = addDependency(issue, "km-xyz9")

    expect(result.props["blocked-by"]).toEqual({
      type: "link",
      target: "km-xyz9",
    })
  })
})

describe("removeDependency", () => {
  test("removes single dependency returns empty props", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      blockedBy: ["km-xyz9"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = removeDependency(issue, "km-xyz9")

    expect(result).toEqual({ props: {}, propsRaw: {} })
  })

  test("removes one of multiple dependencies", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      blockedBy: ["km-xyz9", "km-def4"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = removeDependency(issue, "km-xyz9")

    expect(result?.props["blocked-by"]).toEqual({
      type: "link",
      target: "km-def4",
    })
  })

  test("returns null for non-existent dependency", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      blockedBy: ["km-xyz9"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = removeDependency(issue, "km-other")

    expect(result).toBeNull()
  })
})

describe("getDependencies", () => {
  test("returns empty array for issue without blockers", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(getDependencies(issue)).toEqual([])
  })

  test("returns blockedBy array", () => {
    const issue: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Test issue",
      status: "todo",
      priority: 2,
      blockedBy: ["km-xyz9", "km-def4"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(getDependencies(issue)).toEqual(["km-xyz9", "km-def4"])
  })
})

describe("dependsOn", () => {
  test("returns true when issue A depends on issue B", () => {
    const issueA: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Issue A",
      status: "todo",
      priority: 2,
      blockedBy: ["km-xyz9"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const issueB: Issue = {
      id: "01XYZ999",
      shortId: "km-xyz9",
      title: "Issue B",
      status: "todo",
      priority: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(dependsOn(issueA, issueB)).toBe(true)
  })

  test("returns false when issue A does not depend on issue B", () => {
    const issueA: Issue = {
      id: "01ABC123",
      shortId: "km-abc1",
      title: "Issue A",
      status: "todo",
      priority: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const issueB: Issue = {
      id: "01XYZ999",
      shortId: "km-xyz9",
      title: "Issue B",
      status: "todo",
      priority: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(dependsOn(issueA, issueB)).toBe(false)
  })
})

describe("mergeDepProps", () => {
  test("merges into empty data", () => {
    const depProps = {
      props: { "blocked-by": { type: "link", target: "km-xyz9" } },
      propsRaw: { "blocked-by": "[[km-xyz9]]" },
    }

    const result = mergeDepProps(undefined, depProps)

    expect(result.props).toEqual(depProps.props)
    expect(result.propsRaw).toEqual(depProps.propsRaw)
  })

  test("merges with existing props", () => {
    const existingData = {
      tags: ["bug"],
      props: { status: { type: "text", value: "active" } },
      propsRaw: { status: "active" },
    }

    const depProps = {
      props: { "blocked-by": { type: "link", target: "km-xyz9" } },
      propsRaw: { "blocked-by": "[[km-xyz9]]" },
    }

    const result = mergeDepProps(existingData, depProps)

    expect(result.tags).toEqual(["bug"])
    expect(result.props).toEqual({
      status: { type: "text", value: "active" },
      "blocked-by": { type: "link", target: "km-xyz9" },
    })
  })
})
