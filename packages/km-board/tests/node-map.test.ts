import { describe, it, expect } from "bun:test";
import { createNodeMap } from "../src/node-map.ts";
import type { TNode } from "../src/board-types.ts";

// Helper to create test nodes
function node(id: string, children: TNode[] = []): TNode {
  return {
    id,
    type: "task",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    name: id,
    title: id,
    children,
    childCount: children.length,
    isTask: true,
    depth: 0,
    data: {},
    created_at: "",
    updated_at: "",
    version: "1",
  };
}

describe("createNodeMap", () => {
  it("should create empty map for empty nodes", () => {
    const map = createNodeMap([]);
    expect(map.size).toBe(0);
    expect(map.keys()).toEqual([]);
  });

  it("should index flat list of nodes", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const map = createNodeMap(nodes);

    expect(map.size).toBe(3);
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(true);
    expect(map.has("c")).toBe(true);
    expect(map.has("d")).toBe(false);
  });

  it("should return node via get()", () => {
    const nodes = [node("a"), node("b")];
    const map = createNodeMap(nodes);

    expect(map.get("a").id).toBe("a");
    expect(map.get("b").id).toBe("b");
  });

  it("should throw on get() for missing node", () => {
    const map = createNodeMap([node("a")]);
    expect(() => map.get("missing")).toThrow("Node not found: missing");
  });

  it("should return null on getOrNull() for missing node", () => {
    const map = createNodeMap([node("a")]);
    expect(map.getOrNull("missing")).toBeNull();
  });

  it("should index nested nodes with correct paths", () => {
    const nodes = [
      node("col1", [node("card1"), node("card2")]),
      node("col2", [node("card3", [node("sub1"), node("sub2")])]),
    ];
    const map = createNodeMap(nodes);

    expect(map.size).toBe(7);

    // Check paths
    expect(map.getEntry("col1")?.path).toEqual([0]);
    expect(map.getEntry("card1")?.path).toEqual([0, 0]);
    expect(map.getEntry("card2")?.path).toEqual([0, 1]);
    expect(map.getEntry("col2")?.path).toEqual([1]);
    expect(map.getEntry("card3")?.path).toEqual([1, 0]);
    expect(map.getEntry("sub1")?.path).toEqual([1, 0, 0]);
    expect(map.getEntry("sub2")?.path).toEqual([1, 0, 1]);
  });
});

