/**
 * Command Parser Tests
 *
 * Tests for km-sh command parsing.
 */

import { describe, it, expect } from "bun:test";
import {
  parseCommand,
  parseKeySpec,
  getCommandNames,
  getCommandHelp,
} from "../src/commandParser.ts";

describe("parseKeySpec", () => {
  it("parses single characters", () => {
    expect(parseKeySpec("j")).toBe("j");
    expect(parseKeySpec("k")).toBe("k");
    expect(parseKeySpec("/")).toBe("/");
  });

  it("parses special keys in angle brackets", () => {
    expect(parseKeySpec("<Enter>")).toBe("Enter");
    expect(parseKeySpec("<Escape>")).toBe("Escape");
    expect(parseKeySpec("<Tab>")).toBe("Tab");
    expect(parseKeySpec("<Ctrl-z>")).toBe("Ctrl-z");
  });

  it("returns null for invalid specs", () => {
    expect(parseKeySpec("abc")).toBeNull();
    expect(parseKeySpec("<>")).toBeNull();
  });
});

describe("parseCommand - simple actions", () => {
  it("parses legacy navigation commands (mapped to structural)", () => {
    // Legacy commands are mapped to structural equivalents
    expect(parseCommand("move_up")).toEqual({
      ok: true,
      action: { type: "NAV_PREV_SIBLING" },
    });
    expect(parseCommand("move_down")).toEqual({
      ok: true,
      action: { type: "NAV_NEXT_SIBLING" },
    });
    expect(parseCommand("move_left")).toEqual({
      ok: true,
      action: { type: "NAV_PARENT" },
    });
    expect(parseCommand("move_right")).toEqual({
      ok: true,
      action: { type: "NAV_CHILD" },
    });
    expect(parseCommand("jump_top")).toEqual({
      ok: true,
      action: { type: "NAV_FIRST_SIBLING" },
    });
    expect(parseCommand("jump_bottom")).toEqual({
      ok: true,
      action: { type: "NAV_LAST_SIBLING" },
    });
  });

  it("parses path-based navigation commands", () => {
    expect(parseCommand("nav_prev_sibling")).toEqual({
      ok: true,
      action: { type: "NAV_PREV_SIBLING" },
    });
    expect(parseCommand("nav_next_sibling")).toEqual({
      ok: true,
      action: { type: "NAV_NEXT_SIBLING" },
    });
    expect(parseCommand("nav_parent")).toEqual({
      ok: true,
      action: { type: "NAV_PARENT" },
    });
    expect(parseCommand("nav_child")).toEqual({
      ok: true,
      action: { type: "NAV_CHILD" },
    });
  });

  it("parses history navigation commands", () => {
    expect(parseCommand("nav_back")).toEqual({
      ok: true,
      action: { type: "NAV_BACK" },
    });
    expect(parseCommand("nav_forward")).toEqual({
      ok: true,
      action: { type: "NAV_FORWARD" },
    });
  });

  it("parses selection commands", () => {
    expect(parseCommand("select_all")).toEqual({
      ok: true,
      action: { type: "SELECT_ALL" },
    });
    expect(parseCommand("select_all_siblings")).toEqual({
      ok: true,
      action: { type: "SELECT_ALL_SIBLINGS" },
    });
    expect(parseCommand("clear_selection")).toEqual({
      ok: true,
      action: { type: "CLEAR_SELECTION" },
    });
  });

  it("parses mode toggle commands", () => {
    expect(parseCommand("toggle_search")).toEqual({
      ok: true,
      action: { type: "TOGGLE_SEARCH_MODE" },
    });
    expect(parseCommand("toggle_help")).toEqual({
      ok: true,
      action: { type: "TOGGLE_HELP_MODE" },
    });
    expect(parseCommand("toggle_detail_pane")).toEqual({
      ok: true,
      action: { type: "TOGGLE_DETAIL_PANE" },
    });
  });

  it("parses outline depth commands", () => {
    expect(parseCommand("increase_outline_depth")).toEqual({
      ok: true,
      action: { type: "INCREASE_OUTLINE_DEPTH" },
    });
    expect(parseCommand("decrease_outline_depth")).toEqual({
      ok: true,
      action: { type: "DECREASE_OUTLINE_DEPTH" },
    });
  });

  it("is case insensitive", () => {
    expect(parseCommand("MOVE_UP")).toEqual({
      ok: true,
      action: { type: "NAV_PREV_SIBLING" },
    });
    expect(parseCommand("Move_Down")).toEqual({
      ok: true,
      action: { type: "NAV_NEXT_SIBLING" },
    });
  });
});

describe("parseCommand - parameterized actions", () => {
  it("parses toggle_fold with nodeId", () => {
    expect(parseCommand("toggle_fold node-123")).toEqual({
      ok: true,
      action: { type: "TOGGLE_FOLD", nodeId: "node-123" },
    });
  });

  it("requires nodeId for toggle_fold", () => {
    const result = parseCommand("toggle_fold");
    expect(result.ok).toBe(false);
  });

  it("parses toggle_collapse with nodeId", () => {
    expect(parseCommand("toggle_collapse node-abc")).toEqual({
      ok: true,
      action: { type: "TOGGLE_COLLAPSE", nodeId: "node-abc" },
    });
  });

  it("parses fold_level with depth", () => {
    expect(parseCommand("fold_level 0")).toEqual({
      ok: true,
      action: { type: "FOLD_LEVEL", depth: 0 },
    });
    expect(parseCommand("fold_level 2")).toEqual({
      ok: true,
      action: { type: "FOLD_LEVEL", depth: 2 },
    });
  });

  it("parses unfold_level with depth", () => {
    expect(parseCommand("unfold_level 1")).toEqual({
      ok: true,
      action: { type: "UNFOLD_LEVEL", depth: 1 },
    });
  });

  it("parses nav_to_path with path", () => {
    expect(parseCommand("nav_to_path 0,1,2")).toEqual({
      ok: true,
      action: { type: "NAV_TO_PATH", path: [0, 1, 2] },
    });
  });

  it("parses select_position with path (alias for nav_to_path)", () => {
    expect(parseCommand("select_position 1,2")).toEqual({
      ok: true,
      action: { type: "NAV_TO_PATH", path: [1, 2] },
    });
  });

  it("parses select_node_add with nodeId", () => {
    expect(parseCommand("select_node_add node-xyz")).toEqual({
      ok: true,
      action: { type: "SELECT_NODE_ADD", nodeId: "node-xyz" },
    });
  });

  it("parses select_node_toggle with nodeId", () => {
    expect(parseCommand("select_node_toggle node-abc")).toEqual({
      ok: true,
      action: { type: "SELECT_NODE_TOGGLE", nodeId: "node-abc" },
    });
  });

  it("parses set_search_query with text", () => {
    expect(parseCommand("set_search_query hello world")).toEqual({
      ok: true,
      action: { type: "SET_SEARCH_QUERY", query: "hello world" },
    });
  });
});

describe("parseCommand - shell commands", () => {
  it("parses state command", () => {
    expect(parseCommand("state")).toEqual({
      ok: true,
      command: { type: "STATE" },
    });
  });

  it("parses view command", () => {
    expect(parseCommand("view")).toEqual({
      ok: true,
      command: { type: "VIEW" },
    });
  });

  it("parses help command", () => {
    expect(parseCommand("help")).toEqual({
      ok: true,
      command: { type: "HELP" },
    });
  });

  it("parses help with topic", () => {
    expect(parseCommand("help move_up")).toEqual({
      ok: true,
      command: { type: "HELP", topic: "move_up" },
    });
  });

  it("parses quit/exit commands", () => {
    expect(parseCommand("quit")).toEqual({
      ok: true,
      command: { type: "QUIT" },
    });
    expect(parseCommand("exit")).toEqual({
      ok: true,
      command: { type: "QUIT" },
    });
    expect(parseCommand("q")).toEqual({
      ok: true,
      command: { type: "QUIT" },
    });
  });
});

describe("parseCommand - JSON mode", () => {
  it("parses JSON actions", () => {
    expect(parseCommand('{"type": "NAV_NEXT_SIBLING"}')).toEqual({
      ok: true,
      action: { type: "NAV_NEXT_SIBLING" },
    });
  });

  it("parses JSON actions with parameters", () => {
    expect(parseCommand('{"type": "TOGGLE_FOLD", "nodeId": "abc"}')).toEqual({
      ok: true,
      action: { type: "TOGGLE_FOLD", nodeId: "abc" },
    });
  });

  it("rejects JSON without type field", () => {
    const result = parseCommand('{"foo": "bar"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("type");
    }
  });

  it("rejects invalid JSON", () => {
    const result = parseCommand("{bad json}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid JSON");
    }
  });
});

describe("parseCommand - key commands", () => {
  it("returns KEY marker for key commands", () => {
    const result = parseCommand("key j");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("KEY:j");
    }
  });

  it("handles special keys", () => {
    const result = parseCommand("key <Enter>");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("KEY:Enter");
    }
  });

  it("requires key argument", () => {
    const result = parseCommand("key");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("requires");
    }
  });
});

describe("parseCommand - edge cases", () => {
  it("handles empty lines", () => {
    expect(parseCommand("")).toEqual({ ok: false, error: "empty" });
    expect(parseCommand("   ")).toEqual({ ok: false, error: "empty" });
  });

  it("handles comments", () => {
    expect(parseCommand("# this is a comment")).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("handles unknown commands", () => {
    const result = parseCommand("unknown_command");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown command");
    }
  });

  it("trims whitespace", () => {
    expect(parseCommand("  move_up  ")).toEqual({
      ok: true,
      action: { type: "NAV_PREV_SIBLING" },
    });
  });
});

describe("getCommandNames", () => {
  it("returns array of command names", () => {
    const names = getCommandNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names).toContain("move_up");
    expect(names).toContain("move_down");
    expect(names).toContain("nav_prev_sibling");
    expect(names).toContain("state");
    expect(names).toContain("quit");
    expect(names).toContain("toggle_fold");
    expect(names).toContain("key");
  });
});

describe("getCommandHelp", () => {
  it("returns general help when no topic", () => {
    const help = getCommandHelp();
    expect(help).toContain("Navigation");
    expect(help).toContain("move_up");
    expect(help).toContain("Shell");
    expect(help).toContain("state");
  });

  it("returns specific help for known command", () => {
    const help = getCommandHelp("move_up");
    expect(help).toContain("Move");
    expect(help).toContain("up");
  });

  it("returns unknown message for unknown topic", () => {
    const help = getCommandHelp("nonexistent");
    expect(help).toContain("Unknown");
  });
});
